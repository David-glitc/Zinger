/**
 * Playground router mounted on the main Zinger server at /playground.
 * Uses standalone public-api/lib — no private secrets.
 */
import express, { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { evaluateEdgeGate } from './lib/edge.js';
import { computeKellySize, setKellyTradeHistory } from './lib/kelly.js';
import { fetchCandles, fetchFunding, analyze, getSignalForBoth } from './lib/signal.js';
import { fetchOrderBook, currentWindow, buildLevels, depthCumulative } from './lib/market.js';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function round(n, d = 4) {
  return Math.round(Number(n) * 10 ** d) / 10 ** d;
}

function mockTrades(n, winRate, avgWin = 1, avgLoss = 0.5) {
  const wins = Math.round(n * winRate);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      pnl: round(i < wins ? avgWin * (0.5 + Math.random() * 0.5) : -avgLoss * (0.5 + Math.random() * 0.5), 2),
      closed: true,
      exitReason: 'tp',
      mode: 'paper',
      timestamp: Date.now() - (n - i) * 300000,
    });
  }
  return out;
}

function signalEnvelope(analysis, asset, bankroll = 100) {
  if (!analysis) return null;
  const levels = buildLevels({ entry: 0.5, confidence: analysis.confidence });
  setKellyTradeHistory([]);
  const sizing = computeKellySize({
    bankroll: Number(bankroll),
    price: 0.5,
    signalConfidence: analysis.confidence,
    historicalWinRate: 0,
    tradeCount: 0,
    minUsd: 0.4,
    maxUsd: Number(bankroll) * 0.4,
    kellyFraction: 0.25,
    maxPositionPct: 0.4,
  });
  return {
    id: `sig_${asset.toLowerCase()}_${Date.now()}`,
    asset,
    action: analysis.direction === 'up' ? 'buy_up' : analysis.direction === 'down' ? 'buy_down' : 'hold',
    direction: analysis.direction,
    confidence: analysis.confidence,
    score: analysis.score,
    price: analysis.price,
    entry: 0.5,
    takeProfit: { pct: levels.tpPct, price: levels.tpPrice },
    stopLoss: { pct: levels.slPct, price: levels.slPrice },
    partial: { pct: levels.partialPct, price: levels.partialTpPrice },
    sizing: { sizeUsd: sizing.sizeUsd, method: sizing.method },
    indicators: {
      rsi: analysis.rsi,
      macdHist: analysis.macd?.hist,
      adx: analysis.adx?.adx,
      momentum1m: analysis.momentum?.m1,
      volumeRatio: analysis.volume?.ratio,
      takerBuyRatio: analysis.volume?.takerBuyRatio,
      funding: analysis.funding,
    },
    tags: analysis.signals || [],
    skipTrade: analysis.skipTrade,
    window: currentWindow(300),
    timestamp: analysis.timestamp || Date.now(),
  };
}

router.get('/api/v1/health', (req, res) => {
  res.json({ ok: true, service: 'zinger-playground', version: '2.0.0', timestamp: Date.now() });
});

router.get('/api/v1/strategy', (req, res) => {
  res.json({
    name: 'Zinger Strategy',
    type: 'Mean-reversion / momentum hybrid for Polymarket BTC/ETH 5m updown windows',
    description:
      'Publishes directional signals (buy/sell/TP/SL) for Polymarket 5-minute BTC/ETH binaries. Clients bring their own execution.',
    architecture: {
      signal_generation: 'Multi-indicator TA on 1m Binance candles → direction + confidence.',
      position_sizing: 'Fractional Kelly (25%) with confidence fallback.',
      risk_management: 'TP 8–16%, SL ~12%, partial TP.',
      edge_gate: 'Live unlock after 40+ paper closes with E>0 and kelly>0.',
      client_model: 'Consume signals via REST/SSE; execute on your own flow. No keys held here.',
    },
    signal_actions: ['buy_up', 'buy_down', 'hold', 'take_profit', 'stop_loss', 'partial_tp'],
  });
});

router.get('/api/v1/strategy/edge', (req, res) => {
  const n = Number(req.query.n || 100);
  const winRate = Number(req.query.wr ?? 0.5);
  const avgWin = Number(req.query.avgWin ?? 1.0);
  const avgLoss = Number(req.query.avgLoss ?? 0.5);
  const gate = evaluateEdgeGate(mockTrades(n, winRate, avgWin, avgLoss), req.query);
  res.json({
    description: 'Edge gate requires 40+ paper closes with positive expectancy.',
    formula: {
      expectancy: 'P(win) × avgWin - P(loss) × avgLoss',
      kelly: '(winRate × winLossRatio - (1 - winRate)) / winLossRatio',
    },
    parameters: {
      minTrades: Number(req.query.edgeMinTrades ?? 40),
      minExpectancy: Number(req.query.edgeMinExpectancy ?? 0),
      requireEdgeForLive: req.query.requireEdgeForLive !== 'false',
    },
    current: gate,
  });
});

router.get('/api/v1/window', (req, res) => res.json(currentWindow(Number(req.query.sec || 300))));

router.get('/api/v1/candles/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || 'BTCUSDT').toUpperCase();
  const candles = await fetchCandles(symbol, String(req.query.interval || '1m'), Math.min(500, Number(req.query.limit || 120))).catch(() => null);
  if (!candles) return res.status(502).json({ error: 'Failed to fetch candles' });
  res.json({ symbol, interval: req.query.interval || '1m', count: candles.length, candles });
});

router.get('/api/v1/orderbook/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || 'BTCUSDT').toUpperCase();
  const book = await fetchOrderBook(symbol, Math.min(100, Number(req.query.limit || 20))).catch(() => null);
  if (!book) return res.status(502).json({ error: 'Failed to fetch order book' });
  res.json({ ...book, depth: depthCumulative(book) });
});

router.get('/api/v1/market/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || 'BTCUSDT').toUpperCase();
  const [candles, funding, book] = await Promise.all([
    fetchCandles(symbol, '1m', 120).catch(() => null),
    fetchFunding(symbol).catch(() => null),
    fetchOrderBook(symbol, 20).catch(() => null),
  ]);
  if (!candles) return res.status(502).json({ error: 'Failed to fetch market data' });
  const analysis = analyze(candles, { funding });
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  res.json({
    symbol,
    price: last.close,
    changePct: prev ? round(((last.close - prev.close) / prev.close) * 100, 3) : 0,
    funding: funding ? { rate: round(funding.fundingRate * 100, 6), premium: round(funding.premium * 100, 6) } : null,
    orderbook: book ? { bestBid: book.bestBid, bestAsk: book.bestAsk, mid: book.mid, spreadBps: book.spreadBps } : null,
    signal: analysis
      ? { direction: analysis.direction, confidence: analysis.confidence, score: analysis.score, tags: analysis.signals, rsi: analysis.rsi, skipTrade: analysis.skipTrade }
      : null,
    window: currentWindow(300),
    timestamp: Date.now(),
  });
});

router.get('/api/v1/signals', async (req, res) => {
  const bankroll = Number(req.query.bankroll || 100);
  const both = await getSignalForBoth().catch(() => null);
  if (!both) return res.status(502).json({ error: 'Signal generation failed' });
  res.json({
    ok: true,
    window: currentWindow(300),
    signals: { btc: signalEnvelope(both.btc, 'BTC', bankroll), eth: signalEnvelope(both.eth, 'ETH', bankroll) },
    timestamp: Date.now(),
  });
});

const sseClients = new Set();
router.get('/api/v1/signals/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const client = { res, bankroll: Number(req.query.bankroll || 100) };
  sseClients.add(client);
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);
  req.on('close', () => sseClients.delete(client));
});

setInterval(async () => {
  if (!sseClients.size) return;
  try {
    const both = await getSignalForBoth();
    for (const client of sseClients) {
      client.res.write(
        `event: signal\ndata: ${JSON.stringify({
          window: currentWindow(300),
          signals: {
            btc: signalEnvelope(both?.btc, 'BTC', client.bankroll),
            eth: signalEnvelope(both?.eth, 'ETH', client.bankroll),
          },
          timestamp: Date.now(),
        })}\n\n`,
      );
    }
  } catch {
    /* ignore */
  }
}, 5000);

router.post('/api/v1/sizing/calculate', (req, res) => {
  const { bankroll, price, confidence, winRate, tradeCount, minUsd, maxUsd, kellyFraction, maxPositionPct } = req.body || {};
  if (!bankroll) return res.status(400).json({ error: 'bankroll is required (USD)' });
  if (tradeCount > 0 && winRate > 0) setKellyTradeHistory(mockTrades(Number(tradeCount), Number(winRate)));
  else setKellyTradeHistory([]);
  const result = computeKellySize({
    bankroll: Number(bankroll),
    price: Number(price || 0.5),
    signalConfidence: Number(confidence ?? 0.5),
    historicalWinRate: Number(winRate || 0),
    tradeCount: Number(tradeCount || 0),
    minUsd: Number(minUsd || 0.4),
    maxUsd: Number(maxUsd || bankroll * 0.4),
    kellyFraction: Number(kellyFraction || 0.25),
    maxPositionPct: Number(maxPositionPct || 0.4),
  });
  res.json({
    ok: true,
    sizing: result,
    levels: buildLevels({ entry: Number(price || 0.5), confidence: Number(confidence ?? 0.5) }),
  });
});

router.post('/api/v1/simulate/trade', async (req, res) => {
  const { symbol = 'BTCUSDT', direction, bankroll = 100, confidence, tradeCount, winRate } = req.body || {};
  if (!direction) return res.status(400).json({ error: 'direction required (up or down)' });
  const candles = await fetchCandles(symbol, '1m', 200).catch(() => null);
  if (!candles) return res.status(400).json({ error: 'Failed to fetch live market data' });
  const funding = await fetchFunding(symbol).catch(() => null);
  const analysis = analyze(candles, { funding });
  const signalConfidence = Number(confidence ?? analysis?.confidence ?? 0.5);
  if (tradeCount > 0 && winRate > 0) setKellyTradeHistory(mockTrades(Number(tradeCount), Number(winRate)));
  else setKellyTradeHistory([]);
  const sizingResult = computeKellySize({
    bankroll: Number(bankroll),
    price: 0.5,
    signalConfidence,
    historicalWinRate: Number(winRate || 0),
    tradeCount: Number(tradeCount || 0),
    minUsd: 0.4,
    maxUsd: Number(bankroll) * 0.4,
    kellyFraction: 0.25,
    maxPositionPct: 0.4,
  });
  const levels = buildLevels({ entry: 0.5, confidence: signalConfidence });
  const price = candles[candles.length - 1]?.close || 0;
  const prev = candles[candles.length - 2];
  res.json({
    ok: true,
    market: {
      symbol,
      price,
      priceChangePct: prev ? round(((price - prev.close) / prev.close) * 100, 2) : 0,
      direction: prev && price >= prev.close ? 'up' : 'down',
    },
    funding: funding ? { rate: round(funding.fundingRate * 100, 4), premium: round(funding.premium * 100, 4) } : null,
    analysis: analysis ? { direction: analysis.direction, confidence: analysis.confidence, score: analysis.score, rsi: analysis.rsi, tags: analysis.signals } : null,
    signal: { direction, confidence: signalConfidence },
    levels,
    sizing: sizingResult,
    window: currentWindow(300),
    trade:
      sizingResult.sizeUsd > 0
        ? {
            type: 'binary_option',
            market: `${symbol === 'BTCUSDT' ? 'BTC' : 'ETH'} updown 5m`,
            outcome: direction,
            size: sizingResult.sizeUsd,
            maxPayout: round(sizingResult.sizeUsd * 2, 2),
            tp: levels.tpPrice,
            sl: levels.slPrice,
          }
        : { skipped: true, reason: sizingResult.method === 'negative_kelly' ? 'Negative edge' : 'Size too small' },
  });
});

router.get('/api/v1/docs', (req, res) => {
  res.json({
    version: '2.0.0',
    base: '/playground/api/v1',
    endpoints: {
      'GET /playground/api/v1/health': { description: 'Health check' },
      'GET /playground/api/v1/strategy': { description: 'Strategy overview' },
      'GET /playground/api/v1/strategy/edge': { description: 'Edge gate calculator' },
      'GET /playground/api/v1/signals': { description: 'Latest BTC/ETH signals with TP/SL' },
      'GET /playground/api/v1/signals/stream': { description: 'SSE live signal stream' },
      'GET /playground/api/v1/market/:symbol': { description: 'Live market snapshot' },
      'GET /playground/api/v1/candles/:symbol': { description: 'OHLCV candles' },
      'GET /playground/api/v1/orderbook/:symbol': { description: 'L2 order book + depth' },
      'GET /playground/api/v1/window': { description: '5m settlement window clock' },
      'POST /playground/api/v1/sizing/calculate': { description: 'Kelly sizing + levels' },
      'POST /playground/api/v1/simulate/trade': { description: 'Trade simulation' },
    },
  });
});

router.use('/assets', express.static(join(__dirname, 'assets')));
router.get('/', (req, res) => res.sendFile(join(__dirname, 'public/index.html')));
router.get('/index.html', (req, res) => res.sendFile(join(__dirname, 'public/index.html')));

export default router;
