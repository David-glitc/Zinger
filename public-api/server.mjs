/**
 * Zinger Strategy Playground — standalone public API.
 * No private bot deps, no secrets. Pure math + public Binance market data.
 */
import express from 'express';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { evaluateEdgeGate } from './lib/edge.js';
import { computeKellySize, setKellyTradeHistory } from './lib/kelly.js';
import { fetchCandles, fetchFunding, analyze, getSignalForBoth } from './lib/signal.js';
import { fetchOrderBook, currentWindow, buildLevels, depthCumulative } from './lib/market.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PLAYGROUND_PORT || 3001);
const PROXY_PORT = Number(process.env.PROXY_PORT || 2096);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

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
  const direction = analysis.direction;
  const confidence = analysis.confidence;
  const entry = 0.5;
  const levels = buildLevels({ entry, confidence });
  setKellyTradeHistory([]);
  const sizing = computeKellySize({
    bankroll: Number(bankroll),
    price: entry,
    signalConfidence: confidence,
    historicalWinRate: 0,
    tradeCount: 0,
    minUsd: 0.4,
    maxUsd: Number(bankroll) * 0.4,
    kellyFraction: 0.25,
    maxPositionPct: 0.4,
  });
  const action =
    direction === 'up' ? 'buy_up' : direction === 'down' ? 'buy_down' : 'hold';
  return {
    id: `sig_${asset.toLowerCase()}_${Date.now()}`,
    asset,
    action,
    direction,
    confidence,
    score: analysis.score,
    price: analysis.price,
    entry,
    takeProfit: { pct: levels.tpPct, price: levels.tpPrice },
    stopLoss: { pct: levels.slPct, price: levels.slPrice },
    partial: { pct: levels.partialPct, price: levels.partialTpPrice },
    sizing: { sizeUsd: sizing.sizeUsd, method: sizing.method },
    indicators: {
      rsi: analysis.rsi,
      macdHist: analysis.macd?.hist,
      bbPos: analysis.bb ? round((analysis.price - analysis.bb.lower) / (analysis.bb.upper - analysis.bb.lower), 3) : null,
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

// ── Health ──────────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  res.json({ ok: true, service: 'zinger-playground', version: '2.0.0', timestamp: Date.now() });
});

// ── Strategy overview ───────────────────────────────────────────────
app.get('/api/v1/strategy', (req, res) => {
  res.json({
    name: 'Zinger Strategy',
    type: 'Mean-reversion / momentum hybrid for Polymarket BTC/ETH 5m updown windows',
    description:
      'Publishes directional signals (buy/sell/TP/SL) for Polymarket 5-minute BTC/ETH binaries. Clients bring their own execution. Combines multi-indicator TA, Kelly sizing, and an expectancy edge gate.',
    architecture: {
      signal_generation:
        'Multi-indicator TA on 1m Binance candles (RSI, MACD, Bollinger, ADX, volume, taker ratio, funding, BTC→ETH lead). Weighted score → direction + confidence.',
      position_sizing:
        'Fractional Kelly (default 25%). Confidence-scaling fallback when trade history < 10. Cap 40% bankroll.',
      risk_management:
        'TP 8–16% conf-scaled, SL ~12%, partial at 50% of TP selling 55%, trailing optional.',
      edge_gate:
        'Live unlock requires 40+ paper closes with expectancy > 0 and kelly > 0.',
      client_model:
        'You consume signals via REST/SSE and execute on your own venue/wallet. This API never holds keys or places orders.',
    },
    signal_actions: ['buy_up', 'buy_down', 'hold', 'take_profit', 'stop_loss', 'partial_tp'],
    links: {
      signals: 'GET /api/v1/signals',
      stream: 'GET /api/v1/signals/stream',
      market: 'GET /api/v1/market/:symbol',
      orderbook: 'GET /api/v1/orderbook/:symbol',
      candles: 'GET /api/v1/candles/:symbol',
      window: 'GET /api/v1/window',
      sizing: 'POST /api/v1/sizing/calculate',
      simulate: 'POST /api/v1/simulate/trade',
      edge: 'GET /api/v1/strategy/edge',
      docs: 'GET /api/v1/docs',
    },
  });
});

app.get('/api/v1/strategy/edge', (req, res) => {
  const n = Number(req.query.n || 100);
  const winRate = Number(req.query.wr ?? 0.5);
  const avgWin = Number(req.query.avgWin ?? 1.0);
  const avgLoss = Number(req.query.avgLoss ?? 0.5);
  const gate = evaluateEdgeGate(mockTrades(n, winRate, avgWin, avgLoss), req.query);
  res.json({
    description:
      'Edge gate requires 40+ closed paper trades with positive expectancy before live/directional unlock.',
    formula: {
      expectancy: 'P(win) × avgWin - P(loss) × avgLoss',
      kelly: '(winRate × winLossRatio - (1 - winRate)) / winLossRatio',
      liveAllowed: '!requireEdgeForLive || (n >= minTrades && expectancy > 0 && kelly > 0)',
    },
    parameters: {
      minTrades: Number(req.query.edgeMinTrades ?? 40),
      minExpectancy: Number(req.query.edgeMinExpectancy ?? 0),
      requireEdgeForLive: req.query.requireEdgeForLive !== 'false',
      lookback: Number(req.query.edgeLookback ?? 100),
    },
    current: gate,
  });
});

// ── Live market ─────────────────────────────────────────────────────
app.get('/api/v1/window', (req, res) => {
  res.json(currentWindow(Number(req.query.sec || 300)));
});

app.get('/api/v1/candles/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || 'BTCUSDT').toUpperCase();
  const interval = String(req.query.interval || '1m');
  const limit = Math.min(500, Number(req.query.limit || 120));
  const candles = await fetchCandles(symbol, interval, limit).catch(() => null);
  if (!candles) return res.status(502).json({ error: 'Failed to fetch candles' });
  res.json({ symbol, interval, count: candles.length, candles });
});

app.get('/api/v1/orderbook/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || 'BTCUSDT').toUpperCase();
  const limit = Math.min(100, Number(req.query.limit || 20));
  const book = await fetchOrderBook(symbol, limit).catch(() => null);
  if (!book) return res.status(502).json({ error: 'Failed to fetch order book' });
  res.json({ ...book, depth: depthCumulative(book) });
});

app.get('/api/v1/market/:symbol', async (req, res) => {
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
  const changePct = prev ? round(((last.close - prev.close) / prev.close) * 100, 3) : 0;
  res.json({
    symbol,
    price: last.close,
    changePct,
    candle: last,
    funding: funding
      ? { rate: round(funding.fundingRate * 100, 6), premium: round(funding.premium * 100, 6) }
      : null,
    orderbook: book
      ? {
          bestBid: book.bestBid,
          bestAsk: book.bestAsk,
          mid: book.mid,
          spreadBps: book.spreadBps,
        }
      : null,
    signal: analysis
      ? {
          direction: analysis.direction,
          confidence: analysis.confidence,
          score: analysis.score,
          tags: analysis.signals,
          rsi: analysis.rsi,
          skipTrade: analysis.skipTrade,
        }
      : null,
    window: currentWindow(300),
    timestamp: Date.now(),
  });
});

// ── Signals (the publish surface for client builders) ───────────────
app.get('/api/v1/signals', async (req, res) => {
  const bankroll = Number(req.query.bankroll || 100);
  const both = await getSignalForBoth().catch(() => null);
  if (!both) return res.status(502).json({ error: 'Signal generation failed' });
  res.json({
    ok: true,
    window: currentWindow(300),
    signals: {
      btc: signalEnvelope(both.btc, 'BTC', bankroll),
      eth: signalEnvelope(both.eth, 'ETH', bankroll),
    },
    schema: {
      action: 'buy_up | buy_down | hold',
      takeProfit: '{ pct, price }',
      stopLoss: '{ pct, price }',
      sizing: '{ sizeUsd, method }',
    },
    timestamp: Date.now(),
  });
});

const sseClients = new Set();
app.get('/api/v1/signals/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const client = { res, bankroll: Number(req.query.bankroll || 100) };
  sseClients.add(client);
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);
  req.on('close', () => sseClients.delete(client));
});

async function pushSignals() {
  if (!sseClients.size) return;
  try {
    const both = await getSignalForBoth();
    for (const client of sseClients) {
      const payload = {
        window: currentWindow(300),
        signals: {
          btc: signalEnvelope(both?.btc, 'BTC', client.bankroll),
          eth: signalEnvelope(both?.eth, 'ETH', client.bankroll),
        },
        timestamp: Date.now(),
      };
      client.res.write(`event: signal\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  } catch {
    /* ignore push errors */
  }
}
setInterval(pushSignals, 5000);

// ── Sizing / simulate ───────────────────────────────────────────────
app.post('/api/v1/sizing/calculate', (req, res) => {
  const { bankroll, price, confidence, winRate, tradeCount, minUsd, maxUsd, kellyFraction, maxPositionPct } =
    req.body || {};
  if (!bankroll) return res.status(400).json({ error: 'bankroll is required (USD)' });
  if (tradeCount > 0 && winRate > 0) {
    setKellyTradeHistory(mockTrades(Number(tradeCount), Number(winRate)));
  } else {
    setKellyTradeHistory([]);
  }
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
  const levels = buildLevels({ entry: Number(price || 0.5), confidence: Number(confidence ?? 0.5) });
  res.json({
    ok: true,
    parameters: { bankroll, price, confidence, winRate, tradeCount, kellyFraction, maxPositionPct },
    sizing: result,
    levels,
    explanation:
      result.method === 'confidence_scaling'
        ? 'Insufficient trade history (< 10). Sizing based on confidence-scaled range.'
        : result.method === 'negative_kelly'
          ? 'Kelly is negative or zero. No position recommended.'
          : `Kelly-based sizing at ${result.kellyFraction}% of bankroll (${round(result.kellyRaw * 100, 1)}% raw Kelly).`,
  });
});

app.post('/api/v1/simulate/trade', async (req, res) => {
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
  const priceChange = prev ? round(((price - prev.close) / prev.close) * 100, 2) : 0;
  res.json({
    ok: true,
    market: {
      symbol,
      price,
      priceChangePct: priceChange,
      direction: priceChange >= 0 ? 'up' : 'down',
      volume24h: round(
        candles.slice(-288).reduce((s, c) => s + c.volume, 0),
        0,
      ),
    },
    funding: funding
      ? { rate: round(funding.fundingRate * 100, 4), premium: round(funding.premium * 100, 4) }
      : null,
    analysis: analysis
      ? {
          direction: analysis.direction,
          confidence: analysis.confidence,
          score: analysis.score,
          rsi: analysis.rsi,
          tags: analysis.signals,
        }
      : null,
    signal: { direction, confidence: signalConfidence, score: round(signalConfidence * 10, 1) },
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
            potentialReturn: round(sizingResult.sizeUsd, 2),
            risk: sizingResult.sizeUsd,
            tp: levels.tpPrice,
            sl: levels.slPrice,
            riskReward: '1:1 (binary) · TP/SL on share price',
          }
        : {
            skipped: true,
            reason: sizingResult.method === 'negative_kelly' ? 'Negative edge — no trade' : 'Size too small',
          },
  });
});

app.get('/api/v1/docs', (req, res) => {
  res.json({
    version: '2.0.0',
    base: '/api/v1',
    endpoints: {
      'GET /api/v1/health': { description: 'Health check' },
      'GET /api/v1/strategy': { description: 'Strategy overview + signal action list' },
      'GET /api/v1/strategy/edge': { description: 'Edge gate calculator (query: n, wr, avgWin, avgLoss)' },
      'GET /api/v1/signals': { description: 'Latest BTC/ETH pipeline signals with TP/SL/sizing' },
      'GET /api/v1/signals/stream': { description: 'SSE stream of live signals (~5s)' },
      'GET /api/v1/market/:symbol': { description: 'Live price, funding, book summary, signal snapshot' },
      'GET /api/v1/candles/:symbol': { description: 'OHLCV candles (query: interval, limit)' },
      'GET /api/v1/orderbook/:symbol': { description: 'L2 order book + cumulative depth' },
      'GET /api/v1/window': { description: 'Current 5m settlement window clock' },
      'POST /api/v1/sizing/calculate': {
        description: 'Kelly sizing + TP/SL levels',
        body: { bankroll: 'number', price: 'number', confidence: '0-1', winRate: '0-1', tradeCount: 'number' },
      },
      'POST /api/v1/simulate/trade': {
        description: 'Full trade simulation with live market data',
        body: { symbol: 'BTCUSDT|ETHUSDT', direction: 'up|down', bankroll: 'number', confidence: '0-1' },
      },
      'GET /api/v1/docs': { description: 'This documentation' },
    },
  });
});

app.get('/', (req, res) => res.sendFile(join(__dirname, 'public/index.html')));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Zinger Playground API v2`);
  console.log(`     http://0.0.0.0:${PORT}`);
  console.log(`     docs: http://0.0.0.0:${PORT}/api/v1/docs\n`);
});

if (PROXY_PORT && PROXY_PORT !== PORT) {
  http.createServer(app).listen(PROXY_PORT, '0.0.0.0', () => {
    console.log(`     alias :${PROXY_PORT}`);
  });
}

export default app;
export { server };
