import fs from 'fs';
import path from 'path';
import { findMarkets } from './markets.js';
import { getPricesForMarket, getDepthForMarket } from './clob.js';
import { getRemainingSeconds, getRemainingMs, getCycleEndMs, formatRemainingMs, POLY_MIN_ORDER_USD, POLY_SCAN_INTERVAL_MS, POLY_WINDOW_SECONDS } from './config.js';
import { getSignalForBoth } from './signal.js';
import { getMLSignalForBoth, getMLTraceForBoth } from './predict.js';
import { addMLPrediction, addPriceTrace, getConfidenceBias, getConfidenceBufferStats, getPriceTrace } from './confidence.js';
import { placeOrder, placeMarketSell, syncClobBalance } from './trade.js';
import { checkReadiness } from './readiness.js';
import { computeKellySize, resolveDynamicLimits, setKellyTradeHistory, getKellyStats, buildDynamicPlan, checkTrailingStop, checkPartialProfit } from './kelly.js';
import {
  dedupeTrades,
  computeTradeStats,
  runAudit,
  loadBaseline,
  saveBaseline,
  normalizeTrade,
  tradeRealizedPnl,
  tradeCostBasis,
} from './audit.js';

const DATA_DIR = path.resolve(import.meta.dirname, '../../data');
const CONFIG_FILE = path.join(DATA_DIR, 'poly_config.json');
const TRADES_FILE = path.join(DATA_DIR, 'poly_trades.json');
const POSITIONS_FILE = path.join(DATA_DIR, 'poly_positions.json');
const ACTIONS_FILE = path.join(DATA_DIR, 'poly_actions.json');

let botState = {
  running: false,
  interval: null,
  config: loadConfig(),
  markets: [],
  positions: loadPositions(),
  trades: loadTrades(),
  actions: loadActions(),
  signals: { btc: null, eth: null },
  stats: { totalTrades: 0, wins: 0, losses: 0, totalPnl: 0, winRate: 0, bestTrade: 0, worstTrade: 0, scansDone: 0 },
  telemetry: { uptime: 0, usdcBalance: 0, openValue: 0, totalFees: 0, signalsToday: 0, polyBalance: 0 },
  readiness: null,
  diagnostics: [],
  executionLog: [],
  lastScan: null,
  lastScanLog: null,
  pendingTrades: [],
  announcements: [],
  _scanning: false,
  _buyLocks: new Set(),
  _stateListeners: [],
  _chartTicks: {},
  spotPrices: { btc: null, eth: null },
};

export function onStateChange(fn) {
  botState._stateListeners.push(fn);
  return () => {
    botState._stateListeners = botState._stateListeners.filter(f => f !== fn);
  };
}

function notifyStateChange() {
  for (const fn of botState._stateListeners) {
    try { fn(); } catch {}
  }
}

export function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); }
  catch {
    return {
      enabled: false, mode: 'paper',
      minPrice: 0.40, maxPrice: 0.92,
      tpPctLow: 25, tpPctHigh: 55, slPct: 18,
      maxPositionSize: 50,
      minPositionSize: 0.4,
      maxPositionPct: 0.4,
      maxPositionCap: 50,
      bankrollReservePct: 0.05,
      useKellySizing: true,
      kellyFraction: 0.25,
      minRemainingSec: 35,
      maxEntryRemainingSec: 260,
      assets: ['BTC', 'ETH'],
      use15m: true,
      maxConcurrentPerSlug: 2,
      minConfidence: 0.35,
      useSignals: true,
      useML: true,
      tradeCurrentWindowOnly: true,
      announceBeforeTrade: true,
      announceTimeoutSec: 28,
      autoApprovePaper: true,
    };
  }
}

export function saveConfig(cfg) {
  botState.config = { ...botState.config, ...cfg };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(botState.config, null, 2));
}

function loadTrades() {
  try {
    const raw = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf-8'));
    return raw.map(normalizeTrade);
  }
  catch { return []; }
}

function loadPositions() {
  try { return JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8')); }
  catch { return []; }
}

function loadActions() {
  try { return JSON.parse(fs.readFileSync(ACTIONS_FILE, 'utf-8')); }
  catch { return []; }
}

function saveState() {
  try {
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(botState.positions, null, 2));
    fs.writeFileSync(ACTIONS_FILE, JSON.stringify(botState.actions.slice(0, 300), null, 2));
  } catch {}
  notifyStateChange();
}

function saveTrade(trade) {
  const normalized = normalizeTrade(trade);
  const key = `${normalized.mode}:${normalized.slug}:${normalized.outcome}:${normalized.exitReason || 'open'}`;
  const dupe = botState.trades.find((t) =>
    `${t.mode}:${t.slug}:${t.outcome}:${t.exitReason || 'open'}` === key
    && Math.abs((t.timestamp || t.entryTime || 0) - (normalized.timestamp || normalized.entryTime || 0)) < 120000
  );
  if (dupe) return;
  botState.trades.unshift(normalized);
  fs.writeFileSync(TRADES_FILE, JSON.stringify(botState.trades.slice(0, 500), null, 2));
}

function computeStats(trades) {
  return computeTradeStats(trades);
}

// Feed trades into Kelly engine on load
setKellyTradeHistory(botState.trades);

function recordChartTick(slug, prices) {
  if (!slug || !prices) return;
  const up = prices.up != null ? Number(prices.up) : null;
  const down = prices.down != null ? Number(prices.down) : null;
  if (up == null && down == null) return;
  if (!botState._chartTicks[slug]) botState._chartTicks[slug] = [];
  const series = botState._chartTicks[slug];
  const last = series[series.length - 1];
  const now = Date.now();
  // debounce identical prints under 250ms
  if (last && now - last.t < 250 && last.up === up && last.down === down) return;
  series.push({ t: now, up, down });
  if (series.length > 360) series.splice(0, series.length - 360);
}

function getChartSeries(slug) {
  if (!slug) return [];
  return botState._chartTicks[slug] || [];
}

function hasOpenOnSlug(slug) {
  const cfg = botState.config;
  if (cfg.maxConcurrentPerSlug === 0) return true;
  const maxConcurrent = cfg.maxConcurrentPerSlug || 1;
  const openCount = botState.positions.filter((p) => !p.closed && p.slug === slug).length;
  if (openCount >= maxConcurrent) return true;
  const pendingCount = botState.pendingTrades.filter((p) => p.slug === slug && p.status === 'pending').length;
  if (openCount + pendingCount >= maxConcurrent) return true;
  return botState._buyLocks.has(slug);
}

function prunePendingTrades() {
  const now = Date.now();
  botState.pendingTrades = botState.pendingTrades.filter((p) => {
    if (p.status !== 'pending') return false;
    if (p.expiresAt && now > p.expiresAt) {
      p.status = 'expired';
      log(`⌛ TRADE EXPIRED ${p.symbol} ${p.outcome?.toUpperCase()} — no approve in time`, 'signal', { id: p.id, slug: p.slug });
      botState._buyLocks.delete(p.slug);
      return false;
    }
    return true;
  });
}

function buildTradePlan({ cfg, market, outcome, price, remaining, signal, sizeUsd, kelly, analysis }) {
  const plan = buildDynamicPlan({ cfg, price, analysis, signal });
  const entry = Number(price);
  const tpPrice = Math.min(0.99, entry * (1 + plan.tpPct / 100));
  const slPrice = Math.max(0.01, entry * (1 - plan.slPct / 100));
  const shares = Math.max(market.minShares || 5, Math.ceil((sizeUsd / entry) * 100) / 100);
  const costEst = Math.round(shares * entry * 100) / 100;
  const tpPnl = Math.round((tpPrice - entry) * shares * 100) / 100;
  const slPnl = Math.round((slPrice - entry) * shares * 100) / 100;

  return {
    targetTp: plan.tpPct,
    slPct: plan.slPct,
    trailActivatePct: plan.trailActivatePct,
    trailDistancePct: plan.trailDistancePct,
    partialTpPct: plan.partialTpPct,
    partialPct: plan.partialPct,
    volFactor: plan.volFactor,
    entryPrice: entry,
    tpPrice: Math.round(tpPrice * 1000) / 1000,
    slPrice: Math.round(slPrice * 1000) / 1000,
    shares,
    costEst,
    tpPnl,
    slPnl,
    sizeUsd,
    kelly,
    remaining,
    confidence: signal?.confidence || 0,
    direction: signal?.direction || outcome,
    thesis: signal?.thesis || null,
  };
}

function announceTrade(plan, market, outcome) {
  const id = `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const timeoutSec = Number(botState.config.announceTimeoutSec ?? 28);
  const announcement = {
    id,
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + timeoutSec * 1000,
    symbol: market.symbol,
    slug: market.slug,
    outcome,
    mode: botState.config.mode,
    question: market.question,
    tokenId: market.tokenIds?.[outcome] || null,
    negRisk: !!market.negRisk,
    tickSize: market.tickSize || '0.01',
    minShares: market.minShares || 5,
    plan,
  };

  botState.pendingTrades.unshift(announcement);
  if (botState.pendingTrades.length > 20) botState.pendingTrades.length = 20;
  botState.announcements.unshift({
    id,
    type: 'trade_intent',
    time: Date.now(),
    title: `READY ${market.symbol} ${outcome.toUpperCase()}`,
    msg: `${market.symbol} ${outcome.toUpperCase()} @ $${plan.entryPrice.toFixed(3)} · size $${plan.costEst} (~${plan.shares} sh) · TP +${plan.targetTp}% → $${plan.tpPrice.toFixed(3)} (+$${plan.tpPnl}) · SL -${plan.slPct}% → $${plan.slPrice.toFixed(3)} ($${plan.slPnl}) · ${plan.remaining}s left`,
    plan,
  });
  if (botState.announcements.length > 50) botState.announcements.length = 50;

  log(
    `📣 ANNOUNCE ${market.symbol} ${outcome.toUpperCase()} @ $${plan.entryPrice.toFixed(3)} · $${plan.costEst} · TP +${plan.targetTp}% ($${plan.tpPrice.toFixed(3)}) · SL -${plan.slPct}% ($${plan.slPrice.toFixed(3)}) · approve in ${timeoutSec}s`,
    'announce',
    { id, ...plan, slug: market.slug, outcome },
  );

  return announcement;
}

async function executePendingTrade(pending) {
  const cfg = botState.config;
  const plan = pending.plan;
  const pos = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    symbol: pending.symbol,
    slug: pending.slug,
    outcome: pending.outcome,
    entryPrice: plan.entryPrice,
    currentPrice: plan.entryPrice,
    highestPrice: plan.entryPrice,
    size: plan.sizeUsd,
    shares: plan.shares,
    pnl: 0,
    gainPct: 0,
    targetTp: plan.targetTp,
    slPct: plan.slPct,
    tpPrice: plan.tpPrice,
    slPrice: plan.slPrice,
    trailActivatePct: plan.trailActivatePct,
    trailDistancePct: plan.trailDistancePct,
    partialTpPct: plan.partialTpPct,
    partialPct: plan.partialPct,
    partialSold: false,
    volFactor: plan.volFactor,
    entryTime: Date.now(),
    closed: false,
    mode: cfg.mode,
    signal: { direction: plan.direction, confidence: plan.confidence },
    tokenId: pending.tokenId,
    negRisk: pending.negRisk,
    tickSize: pending.tickSize,
    minShares: pending.minShares,
    announceId: pending.id,
  };

  if (cfg.mode === 'live' && pending.tokenId) {
    try {
      log(`🛰️ LIVE ORDER SUBMIT ${pending.symbol} ${pending.outcome.toUpperCase()} @ $${plan.entryPrice.toFixed(3)}`, 'signal', {
        market: pending.symbol, slug: pending.slug, outcome: pending.outcome,
        amount: plan.sizeUsd, price: plan.entryPrice, announceId: pending.id,
      });
      const orderResult = await placeOrder({
        tokenId: pending.tokenId,
        side: 'buy',
        amountUsd: plan.sizeUsd,
        price: plan.entryPrice,
        negRisk: pending.negRisk,
        tickSize: pending.tickSize || '0.01',
        minShares: pending.minShares || 5,
      });
      pos.orderId = orderResult.id;
      pos.shares = orderResult.size;
      pos.entryPrice = orderResult.price;
      markPosition(pos, orderResult.price);
      try { await syncClobBalance(); await refreshTelemetry(); } catch {}
      log(`✅ LIVE BUY ${pending.symbol} ${pending.outcome.toUpperCase()} @ $${orderResult.price.toFixed(3)} · ${orderResult.size} sh · TP $${plan.tpPrice.toFixed(3)} · SL $${plan.slPrice.toFixed(3)}`, 'buy', {
        market: pending.symbol, slug: pending.slug, outcome: pending.outcome,
        orderId: pos.orderId, amount: plan.sizeUsd, price: orderResult.price,
        shares: orderResult.size, targetTp: plan.targetTp, tpPrice: plan.tpPrice, slPrice: plan.slPrice,
      });
    } catch (err) {
      pending.status = 'failed';
      botState._buyLocks.delete(pending.slug);
      log(`❌ LIVE BUY FAILED ${pending.symbol}: ${err.message.slice(0, 160)}`, 'error', {
        market: pending.symbol, slug: pending.slug, outcome: pending.outcome,
      });
      return { ok: false, error: err.message };
    }
  } else {
    markPosition(pos, plan.entryPrice);
    log(`✅ PAPER BUY ${pending.symbol} ${pending.outcome.toUpperCase()} @ $${plan.entryPrice.toFixed(3)} · TP +${plan.targetTp}% · SL -${plan.slPct}% · $${plan.sizeUsd}`, 'buy', {
      market: pending.symbol, slug: pending.slug, outcome: pending.outcome,
      amount: plan.sizeUsd, price: plan.entryPrice, targetTp: plan.targetTp, tpPrice: plan.tpPrice, slPrice: plan.slPrice,
    });
  }

  botState.positions.push(pos);
  botState.stats.signalsToday = (botState.stats.signalsToday || 0) + 1;
  pending.status = 'executed';
  pending.executedAt = Date.now();
  botState._buyLocks.delete(pending.slug);
  botState.pendingTrades = botState.pendingTrades.filter((p) => p.id !== pending.id);
  saveState();
  return { ok: true, position: pos };
}

export async function approveTrade(id) {
  prunePendingTrades();
  const pending = botState.pendingTrades.find((p) => p.id === id && p.status === 'pending');
  if (!pending) return { ok: false, error: 'No pending trade with that id' };
  pending.status = 'approved';
  return executePendingTrade(pending);
}

export async function rejectTrade(id) {
  prunePendingTrades();
  const pending = botState.pendingTrades.find((p) => p.id === id && p.status === 'pending');
  if (!pending) return { ok: false, error: 'No pending trade with that id' };
  pending.status = 'rejected';
  botState._buyLocks.delete(pending.slug);
  botState.pendingTrades = botState.pendingTrades.filter((p) => p.id !== id);
  log(`🚫 REJECTED ${pending.symbol} ${pending.outcome?.toUpperCase()} @ $${pending.plan?.entryPrice?.toFixed(3)}`, 'signal', { id });
  return { ok: true };
}

export async function approveAllTrades() {
  prunePendingTrades();
  const results = [];
  for (const p of [...botState.pendingTrades]) {
    if (p.status === 'pending') results.push(await approveTrade(p.id));
  }
  return { ok: true, results };
}

function log(msg, type = 'info', meta = null) {
  const entry = { msg, type, time: Date.now(), meta };
  botState.actions.unshift(entry);
  if (botState.actions.length > 300) botState.actions.length = 300;
  botState.executionLog.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...entry,
    level: type,
  });
  if (botState.executionLog.length > 500) botState.executionLog.length = 500;
  saveState();
}

function logScan(msg, meta) {
  const entry = {
    id: 'latest-scan',
    msg,
    type: 'scan',
    time: Date.now(),
    meta,
    level: 'scan',
  };
  botState.lastScanLog = entry;
  botState.executionLog = botState.executionLog.filter((e) => e.type !== 'scan' && e.level !== 'scan' && e.id !== 'latest-scan');
  botState.executionLog.unshift(entry);
  if (botState.executionLog.length > 500) botState.executionLog.length = 500;
}

function summarizeSignal(signal) {
  if (!signal) return null;
  return {
    asset: signal.asset,
    direction: signal.direction,
    confidence: signal.confidence,
    conviction: signal.conviction,
    thesis: signal.thesis,
    score: signal.score,
    rsi: signal.rsi,
    tooVolatile: signal.tooVolatile,
    price: signal.price,
    regime: signal.structure?.regime,
    factors: signal.factors?.slice(0, 8) || [],
    signals: signal.signals?.slice(0, 8) || [],
  };
}

function positionShares(pos) {
  if (pos.shares > 0) return pos.shares;
  if (pos.entryPrice > 0 && pos.size > 0) return pos.size / pos.entryPrice;
  return 0;
}

function markPosition(pos, price) {
  const shares = positionShares(pos);
  pos.currentPrice = price;
  pos.shares = shares;
  pos.costBasis = Math.round(shares * (pos.entryPrice || 0) * 100) / 100;
  pos.markValue = Math.round(shares * price * 100) / 100;
  pos.pnl = Math.round((price - pos.entryPrice) * shares * 100) / 100;
  pos.gainPct = pos.entryPrice ? ((price - pos.entryPrice) / pos.entryPrice) * 100 : 0;
  return pos;
}

function summarizeBook(depth) {
  if (!depth) return null;
  const side = (d) => (d ? {
    bestBid: d.bestBid,
    bestAsk: d.bestAsk,
    spread: d.spread,
    spreadPct: d.spreadPct,
    imbalance: d.imbalance,
    bidVol: d.totalBidVol,
    askVol: d.totalAskVol,
    mid: d.mid,
    bids: (d.bids || []).slice(0, 5),
    asks: (d.asks || []).slice(0, 5),
  } : null);
  return {
    up: side(depth.up),
    down: side(depth.down),
    arbGap: (depth.up?.bestAsk && depth.down?.bestAsk)
      ? Math.round((1 - depth.up.bestAsk - depth.down.bestAsk) * 1000) / 1000
      : null,
  };
}

function buildPortfolio(readiness) {
  const cash = readiness?.spendableBalance ?? readiness?.clobBalance ?? botState.telemetry.usdcBalance ?? 0;
  const pmPositions = readiness?.positions || [];
  const pmUnrealized = pmPositions.reduce((sum, p) => sum + Number(p.cashPnl || 0), 0);
  const openMarkValue = pmPositions.reduce((sum, p) => sum + Number(p.currentValue || 0), 0);

  const deduped = dedupeTrades(botState.trades);
  const liveTrades = deduped.filter((t) => t.mode === 'live');
  const paperTrades = deduped.filter((t) => t.mode === 'paper');
  const liveStats = computeTradeStats(liveTrades);
  const paperStats = computeTradeStats(paperTrades);

  const baselineUsd = loadBaseline();
  const cashPnl = baselineUsd != null ? Math.round((cash - baselineUsd) * 100) / 100 : null;
  const equity = Math.round((cash + openMarkValue) * 100) / 100;
  const limits = resolveDynamicLimits(botState.config, cash);

  return {
    cash: Math.round(cash * 100) / 100,
    openMarkValue: Math.round(openMarkValue * 100) / 100,
    unrealizedPnl: Math.round(pmUnrealized * 100) / 100,
    pmUnrealized: Math.round(pmUnrealized * 100) / 100,
    baselineUsd,
    cashPnl,
    netPnl: cashPnl,
    realizedPnl: liveStats.verifiedPnl,
    realizedPnlBot: liveStats.totalPnl,
    realizedPnlPaper: paperStats.totalPnl,
    equity,
    openCount: pmPositions.length,
    limits,
    live: liveStats,
    paper: paperStats,
    pnlSource: 'cash',
  };
}

function resolveOrderSize(cfg, { price, signal, readiness, stats }) {
  const bankroll = readiness?.spendableBalance ?? readiness?.clobBalance ?? 0;
  const limits = resolveDynamicLimits(cfg, bankroll);
  const { minUsd, maxUsd } = limits;

  if (!cfg.useKellySizing) {
    return { sizeUsd: maxUsd, kelly: null, limits };
  }

  const kelly = computeKellySize({
    bankroll: limits.spendable || bankroll,
    price,
    signalConfidence: signal?.confidence ?? 0.35,
    historicalWinRate: stats?.totalTrades > 0 ? stats.wins / stats.totalTrades : null,
    tradeCount: stats?.totalTrades ?? 0,
    minUsd,
    maxUsd,
    kellyFraction: Number(cfg.kellyFraction ?? 0.25),
  });

  return { sizeUsd: kelly.sizeUsd, kelly: { ...kelly, limits }, limits };
}

function buildDecision({
  cfg,
  market,
  outcome,
  price,
  remaining,
  signal,
  existingPosition,
  readiness,
  depth = null,
  prices = null,
}) {
  const reasons = [];
  let eligible = true;
  let score = 0;

  if (cfg.tradeCurrentWindowOnly && !market.isCurrent) {
    eligible = false;
    reasons.push('next window — watch only');
  }

  if (!market.acceptingOrders) {
    eligible = false;
    reasons.push('not accepting orders');
  }

  if (!price || price === 0) {
    eligible = false;
    reasons.push('no price');
  }

  if (eligible && price < cfg.minPrice) {
    eligible = false;
    reasons.push(`below min $${cfg.minPrice.toFixed(2)}`);
  }

  if (eligible && price > cfg.maxPrice) {
    eligible = false;
    reasons.push(`above max $${cfg.maxPrice.toFixed(2)}`);
  }

  if (eligible && remaining < cfg.minRemainingSec) {
    eligible = false;
    reasons.push(`${remaining}s left < ${cfg.minRemainingSec}s min`);
  }

  if (eligible && cfg.maxEntryRemainingSec && remaining > cfg.maxEntryRemainingSec) {
    eligible = false;
    reasons.push(`${remaining}s left > ${cfg.maxEntryRemainingSec}s entry window`);
  }

  if (eligible && cfg.minPositionSize != null && cfg.maxPositionSize < cfg.minPositionSize) {
    eligible = false;
    reasons.push(`max $${cfg.maxPositionSize} < min $${cfg.minPositionSize}`);
  }

  const minBet = Number(cfg.minPositionSize ?? POLY_MIN_ORDER_USD);
  if (eligible && (readiness?.spendableBalance ?? 0) < minBet && cfg.mode === 'live') {
    eligible = false;
    reasons.push(`bankroll $${(readiness?.spendableBalance ?? 0).toFixed(2)} < min bet $${minBet}`);
  }

  const maxConcurrent = cfg.maxConcurrentPerSlug ?? 1;
  const allowScaleIn = cfg.allowScaleIn !== false && maxConcurrent > 1;
  if (eligible && existingPosition && !allowScaleIn) {
    eligible = false;
    reasons.push('position already open');
  }
  if (eligible && existingPosition && allowScaleIn) {
    reasons.push('scale-in allowed');
    score += 4;
  }

  if (eligible && hasOpenOnSlug(market.slug)) {
    eligible = false;
    reasons.push('already in this window');
  }

  if (cfg.mode === 'live' && readiness && !readiness.liveReady) {
    eligible = false;
    reasons.push('live not ready — fund CLOB USDC');
  }

  // Order book / arb: YES+NO ask sum < 1 → free edge; imbalance biases direction
  let bookMeta = null;
  if (cfg.useOrderBookBias !== false && depth) {
    const side = depth[outcome];
    const upAsk = depth.up?.bestAsk || prices?.up;
    const downAsk = depth.down?.bestAsk || prices?.down;
    const arbGap = (upAsk > 0 && downAsk > 0) ? (1 - upAsk - downAsk) : null;
    const imbalance = side?.imbalance ?? 0;
    const spreadPct = side?.spreadPct ?? null;
    bookMeta = { arbGap, imbalance, spreadPct, bestBid: side?.bestBid, bestAsk: side?.bestAsk };

    if (arbGap != null && arbGap > 0.015) {
      score += arbGap * 120;
      reasons.push(`arb gap +${(arbGap * 100).toFixed(1)}c`);
    }
    if (spreadPct != null && spreadPct < 1.5) {
      score += 3;
      reasons.push(`tight spread ${spreadPct.toFixed(2)}%`);
    } else if (spreadPct != null && spreadPct > 4) {
      score -= 8;
      reasons.push(`wide spread ${spreadPct.toFixed(2)}%`);
    }
    const imbHelps = (outcome === 'up' && imbalance > 0.15) || (outcome === 'down' && imbalance < -0.15);
    const imbHurts = (outcome === 'up' && imbalance < -0.25) || (outcome === 'down' && imbalance > 0.25);
    if (imbHelps) {
      score += Math.abs(imbalance) * 18;
      reasons.push(`book ${imbalance > 0 ? 'bid' : 'ask'} heavy`);
    } else if (imbHurts) {
      score -= Math.abs(imbalance) * 12;
      reasons.push('book against');
    }
  }

  if (cfg.useSignals) {
    if (!signal) {
      eligible = false;
      reasons.push('signal unavailable');
    } else if (signal.tooVolatile) {
      eligible = false;
      reasons.push(`volatility high (${signal.volatility?.atrPct?.toFixed?.(2) || 'n/a'}% ATR)`);
    } else if (signal.direction === 'neutral') {
      eligible = false;
      reasons.push('signal neutral');
    } else {
      const expectedDirection = outcome === 'up' ? 'up' : 'down';
      if (signal.direction !== expectedDirection) {
        eligible = false;
        reasons.push(`signal says ${signal.direction.toUpperCase()}`);
      } else if (signal.confidence < cfg.minConfidence) {
        eligible = false;
        reasons.push(`confidence ${(signal.confidence * 100).toFixed(0)}% < ${(cfg.minConfidence * 100).toFixed(0)}%`);
      } else {
        const edge = Math.max(0, 0.55 - price);
        score += (signal.confidence * 100) + (edge * 40) + (signal.score || 0);
        reasons.push(`signal ${signal.direction.toUpperCase()} ${(signal.confidence * 100).toFixed(0)}%`);
        if (edge > 0) reasons.push(`price edge +${(edge * 100).toFixed(1)}c`);
        if (signal.confidenceBiasUsed && signal.confidenceBias?.traceAgree === true) {
          score += 6;
          reasons.push('ML trace agrees');
        } else if (signal.confidenceBias?.traceAgree === false) {
          score -= 10;
          reasons.push('ML trace disagrees');
        }
      }
    }
  } else {
    score += Math.max(0, 0.55 - price) * 40;
    reasons.push('signals disabled');
  }

  if (eligible) reasons.push('tradable now');

  return {
    outcome,
    price,
    eligible,
    score,
    reasons,
    book: bookMeta,
  };
}

function summarizeMarketDecision({ market, remaining, selectedCandidate, candidates, activePosition, announced }) {
  if (announced) {
    return {
      action: 'announce',
      outcome: announced.outcome,
      confidence: announced.plan?.confidence || 0,
      summary: `ANNOUNCE ${market.symbol} ${announced.outcome.toUpperCase()} — await approve`,
      trace: [
        `entry $${announced.plan?.entryPrice?.toFixed(3)}`,
        `TP +${announced.plan?.targetTp}% → $${announced.plan?.tpPrice?.toFixed(3)}`,
        `SL -${announced.plan?.slPct}% → $${announced.plan?.slPrice?.toFixed(3)}`,
      ],
    };
  }

  if (selectedCandidate) {
    return {
      action: 'buy',
      outcome: selectedCandidate.outcome,
      confidence: selectedCandidate.signal?.confidence || 0,
      summary: `BUY ${market.symbol} ${selectedCandidate.outcome.toUpperCase()} @ $${selectedCandidate.price.toFixed(3)}`,
      trace: selectedCandidate.reasons,
    };
  }

  if (activePosition) {
    return {
      action: 'watch',
      outcome: activePosition.outcome,
      confidence: activePosition.signal?.confidence || 0,
      summary: `${market.symbol} ${activePosition.outcome.toUpperCase()} already open`,
      trace: [`tracking open ${activePosition.outcome.toUpperCase()} position`, `${remaining}s remaining`],
    };
  }

  const blockedReasons = candidates.flatMap((candidate) =>
    candidate.reasons.map((reason) => `${candidate.outcome.toUpperCase()}: ${reason}`)
  );

  return {
    action: 'hold',
    outcome: null,
    confidence: 0,
    summary: `HOLD ${market.symbol}`,
    trace: blockedReasons.slice(0, 6),
  };
}

export function getState() {
  prunePendingTrades();
  const deduped = dedupeTrades(botState.trades);
  const liveTrades = deduped.filter((t) => t.mode === 'live');
  const paperTrades = deduped.filter((t) => t.mode === 'paper');
  const liveStats = computeStats(liveTrades);
  const paperStats = computeStats(paperTrades);
  const portfolio = buildPortfolio(botState.readiness);
  const pmOpen = (botState.readiness?.positions || []);
  const audit = runAudit({
    readiness: botState.readiness,
    trades: botState.trades,
    botPositions: botState.positions,
    cash: portfolio.cash,
    baselineUsd: portfolio.baselineUsd,
  });

  const logFiltered = botState.executionLog.filter((e) => e.type !== 'scan' && e.level !== 'scan');
  const executionLog = botState.lastScanLog
    ? [botState.lastScanLog, ...logFiltered].slice(0, 200)
    : logFiltered.slice(0, 200);

  return {
    running: botState.running, config: botState.config,
    markets: botState.markets,
    positions: pmOpen.length ? pmOpen : botState.positions.filter((p) => !p.closed),
    botPositions: botState.positions.filter((p) => !p.closed),
    trades: deduped.slice(0, 50),
    tradesRaw: botState.trades.length,
    pendingTrades: botState.pendingTrades.filter((p) => p.status === 'pending'),
    announcements: botState.announcements.slice(0, 20),
    actions: botState.actions.slice(0, 100),
    signals: botState.signals,
    stats: {
      ...liveStats,
      scansDone: botState.stats.scansDone || 0,
      live: liveStats,
      paper: paperStats,
      cashPnl: portfolio.cashPnl,
      netPnl: portfolio.cashPnl,
      botPnl: liveStats.verifiedPnl,
    },
    audit,
    telemetry: {
      uptime: botState.running ? Math.floor((Date.now() - botState._startTime) / 1000) : 0,
      uptimeMs: botState.running ? Date.now() - botState._startTime : 0,
      startedAt: botState.running ? botState._startTime : null,
      usdcBalance: portfolio.cash,
      openValue: portfolio.openMarkValue,
      totalFees: botState.telemetry.totalFees || 0,
      signalsToday: botState.stats.signalsToday || 0,
      polyBalance: botState.telemetry.polyBalance || 0,
    },
    portfolio,
    lastScan: botState.lastScan,
    readiness: botState.readiness,
    diagnostics: botState.diagnostics,
    executionLog,
    intelligence: {
      btc: summarizeSignal(botState.signals.btc),
      eth: summarizeSignal(botState.signals.eth),
    },
    cycle: {
      remainingSeconds: getRemainingSeconds(),
      remainingMs: getRemainingMs(),
      endAtMs: getCycleEndMs(),
      serverTime: Date.now(),
      scanIntervalMs: POLY_SCAN_INTERVAL_MS,
    },
    sizing: botState.lastSizing || null,
    kellyStats: getKellyStats(),
    confidenceBuffer: getConfidenceBufferStats(),
    charts: Object.fromEntries(
      Object.keys(botState._chartTicks).map((slug) => [slug, getChartSeries(slug)])
    ),
    mlTraces: {
      btc: getPriceTrace('btc'),
      eth: getPriceTrace('eth'),
    },
    spotPrices: botState.spotPrices,
  };
}

async function refreshTelemetry() {
  try {
    const readiness = await checkReadiness(botState.config);
    botState.readiness = readiness;
    botState.telemetry.usdcBalance = readiness.spendableBalance ?? readiness.clobBalance;
    botState.telemetry.polyBalance = readiness.polyBalance;
    return readiness;
  } catch (err) {
    botState.readiness = { liveReady: false, paperReady: true, needs: [err.message], checks: [] };
    return botState.readiness;
  }
}

export async function getReadiness() {
  return refreshTelemetry();
}

export async function syncBalances() {
  try {
    await syncClobBalance();
  } catch {}
  const readiness = await refreshTelemetry();
  if (loadBaseline() == null && readiness?.spendableBalance > 0) {
    saveBaseline(readiness.spendableBalance, 'Auto-set on first sync');
  }
  return readiness;
}

export async function getAudit() {
  await refreshTelemetry();
  const portfolio = buildPortfolio(botState.readiness);
  return runAudit({
    readiness: botState.readiness,
    trades: botState.trades,
    botPositions: botState.positions,
    cash: portfolio.cash,
    baselineUsd: portfolio.baselineUsd,
  });
}

export function setBaseline(balanceUsd) {
  return saveBaseline(balanceUsd, 'Manual set');
}

async function scan() {
  const cfg = botState.config;
  if (!cfg.enabled) return;
  if (botState._scanning) return;
  botState._scanning = true;

  try {
    prunePendingTrades();
    botState.stats.scansDone = (botState.stats.scansDone || 0) + 1;
    const readiness = await refreshTelemetry();

    if (cfg.useSignals) {
      botState.signals = await getSignalForBoth();
      const [mlOverride, mlTraces] = await Promise.all([
        cfg.useML ? getMLSignalForBoth('1h', 1).catch(() => ({ btc: null, eth: null })) : null,
        cfg.useML ? getMLTraceForBoth().catch(() => ({ btc: null, eth: null })) : null,
      ]);
      if (mlTraces) {
        for (const asset of ['btc', 'eth']) {
          const trace = mlTraces[asset];
          if (trace?.priceTrace?.length) {
            addPriceTrace(asset, trace.priceTrace);
            addMLPrediction(asset, trace);
          }
        }
      }
      if (mlOverride) {
        for (const asset of ['btc', 'eth']) {
          const raw = botState.signals[asset];
          const ml = mlOverride[asset];
          if (!raw || !ml || ml.error || ml.direction === 'neutral' || ml.direction === 0) continue;
          addMLPrediction(asset, ml);
          const rawIsBull = raw.direction === 'up';
          const mlIsBull = ml.direction === 1;
          if (ml.confidence >= 0.65 && rawIsBull !== mlIsBull) {
            raw.direction = ml.direction === 1 ? 'up' : 'down';
            raw.confidence = Math.max(raw.confidence, ml.confidence);
            raw.score = ml.confidence * 10;
            raw.mlOverride = true;
            raw.mlConfidence = ml.confidence;
          } else if (ml.confidence >= 0.65 && rawIsBull === mlIsBull) {
            raw.confidence = Math.min(1, raw.confidence + ml.confidence * 0.3);
            raw.mlConfirmed = true;
            raw.mlConfidence = ml.confidence;
          }
          const bias = getConfidenceBias(asset, raw);
          if (bias.bias !== 0) {
            raw.confidence = bias.adjusted;
            raw.confidenceBias = bias;
            raw.confidenceBiasUsed = true;
          }
        }
      }
    }

    const { markets, diagnostics } = await findMarkets(cfg.use15m !== false);
    botState.diagnostics = diagnostics;
    const tradableMarkets = cfg.tradeCurrentWindowOnly ? markets.filter((market) => market.isCurrent) : markets;
    const enriched = [];
    let signalsFound = 0;

    if (markets.length === 0) {
      log(`🧯 Discovery miss — 0 BTC/ETH markets`, 'error', { diagnostics });
    } else if (diagnostics.length > 0) {
      log(`🧭 Discovery partial — ${markets.length} live · ${diagnostics.length} missing`, 'scan', { diagnostics });
    }

    for (const market of tradableMarkets) {
      if (!cfg.assets.includes(market.symbol)) continue;
      const prices = await getPricesForMarket(market);
      recordChartTick(market.slug, prices);
      const depth = cfg.useOrderBookBias !== false
        ? await getDepthForMarket(market).catch(() => null)
        : null;
      const remainingMs = market.endTime
        ? Math.max(0, market.endTime * 1000 - Date.now())
        : getRemainingMs();
      const remaining = Math.ceil(remainingMs / 1000);
      const signal = botState.signals[market.symbol.toLowerCase()];
      const targetOutcomes = cfg.useSignals && signal?.direction && signal.direction !== 'neutral'
        ? [signal.direction]
        : ['up', 'down'];

      let action = 'hold';
      let buyOutcome = null;
      let buyPrice = null;
      let confidence = 0;
      const candidates = [];
      let selectedCandidate = null;
      const activePosition = botState.positions.find((position) =>
        position.symbol === market.symbol && position.slug === market.slug && !position.closed
      );

      for (const outcome of targetOutcomes) {
        const price = prices[outcome];
        const existing = botState.positions.find((position) =>
          position.symbol === market.symbol && position.slug === market.slug && position.outcome === outcome && !position.closed
        );
        const candidate = buildDecision({
          cfg,
          market,
          outcome,
          price,
          remaining,
          signal,
          existingPosition: existing,
          readiness,
          depth,
          prices,
        });

        candidates.push(candidate);

        if (candidate.eligible && (!selectedCandidate || candidate.score > selectedCandidate.score)) {
          selectedCandidate = { ...candidate, signal };
        }
      }

      if (selectedCandidate) {
        buyOutcome = selectedCandidate.outcome;
        buyPrice = selectedCandidate.price;
        action = 'buy';
        confidence = signal?.confidence || 0;
        signalsFound++;
      }

      if (action === 'buy' && buyOutcome) {
        if (hasOpenOnSlug(market.slug)) {
          action = 'hold';
        } else {
        botState._buyLocks.add(market.slug);
        try {
        const { sizeUsd, kelly } = resolveOrderSize(cfg, {
          price: buyPrice,
          signal,
          readiness,
          stats: botState.stats,
        });
        if (!sizeUsd || sizeUsd <= 0) {
          action = 'hold';
          botState._buyLocks.delete(market.slug);
        } else {
        botState.lastSizing = kelly ? { ...kelly, sizeUsd, bankroll: readiness?.spendableBalance } : { sizeUsd, reason: 'fixed' };

        const analysis = signal?.direction ? signal : null;
        const plan = buildTradePlan({
          cfg, market, outcome: buyOutcome, price: buyPrice, remaining, signal, sizeUsd, kelly, analysis,
        });

        const shouldAnnounce = cfg.announceBeforeTrade !== false
          && !(cfg.mode === 'paper' && cfg.autoApprovePaper);

        if (shouldAnnounce) {
          announceTrade(plan, market, buyOutcome);
          action = 'announce';
          // keep lock until approve / reject / expire
        } else {
          const pending = {
            id: `auto-${Date.now().toString(36)}`,
            status: 'pending',
            symbol: market.symbol,
            slug: market.slug,
            outcome: buyOutcome,
            tokenId: market.tokenIds?.[buyOutcome] || null,
            negRisk: !!market.negRisk,
            tickSize: market.tickSize || '0.01',
            minShares: market.minShares || 5,
            plan,
          };
          log(`📡 AUTO ${market.symbol} ${buyOutcome.toUpperCase()} @ $${buyPrice.toFixed(3)} · $${plan.costEst} · TP +${plan.targetTp}% · SL -${plan.slPct}%`, 'signal', {
            market: market.symbol, slug: market.slug, outcome: buyOutcome, ...plan,
          });
          await executePendingTrade(pending);
        }
        }
        } catch (err) {
          botState._buyLocks.delete(market.slug);
          throw err;
        }
        }
      }

      // Check exits for existing positions
      for (const outcome of ['up', 'down']) {
        const price = prices[outcome];
        if (!price) continue;
        const pos = botState.positions.find(p =>
          p.symbol === market.symbol && p.slug === market.slug && p.outcome === outcome && !p.closed
        );
        if (!pos) continue;

        markPosition(pos, price);
        const gainPct = pos.gainPct;

        async function closePosition(exitReason, extraMeta = {}) {
          const sellShares = exitReason === 'partial' ? positionShares(pos) * (pos.partialPct || 0.5) : positionShares(pos);
          if (exitReason === 'partial') {
            pos.partialSold = true;
            pos.firstPartialTime = Date.now();
            // Adjust position after partial sell
            pos.shares = positionShares(pos) * (1 - (pos.partialPct || 0.5));
            pos.costBasis = Math.round(pos.shares * pos.entryPrice * 100) / 100;
            pos.markValue = Math.round(pos.shares * price * 100) / 100;
            pos.partialExitPrice = price;
            pos.partialPnl = Math.round((price - pos.entryPrice) * sellShares * 100) / 100;
            log(`🔹 PARTIAL TP ${pos.symbol} ${pos.outcome.toUpperCase()} · +$${pos.partialPnl.toFixed(2)} (+${gainPct.toFixed(1)}%) · ${(pos.partialPct * 100).toFixed(0)}% sold, ${pos.shares.toFixed(2)} sh remain`, 'tp', {
              market: pos.symbol, slug: pos.slug, outcome: pos.outcome,
              entryPrice: pos.entryPrice, exitPrice: price, gainPct, pnl: pos.partialPnl, shares: sellShares,
            });
            saveState();
            return;
          }
          pos.exitPrice = price;
          pos.closed = true;
          pos.exitReason = exitReason;
          if (pos.mode === 'live' && pos.tokenId && sellShares > 0) {
            try {
              await placeMarketSell({
                tokenId: pos.tokenId,
                shares: sellShares,
                negRisk: pos.negRisk,
                tickSize: pos.tickSize,
              });
            } catch (err) {
              log(`⚠️ LIVE ${exitReason.toUpperCase()} sell failed ${pos.symbol}: ${err.message.slice(0, 120)}`, 'error');
            }
          }
          saveTrade({ ...pos, timestamp: Date.now(), orderId: pos.orderId, ...extraMeta });
          try { await syncClobBalance(); await refreshTelemetry(); } catch {}
        }

        // 1. Check stop loss first
        if (gainPct <= -pos.slPct) {
          await closePosition('sl');
          log(`🛑 ${pos.mode === 'live' ? 'LIVE' : 'PAPER'} SL ${pos.symbol} ${pos.outcome.toUpperCase()} · -$${Math.abs(pos.pnl).toFixed(2)} (${gainPct.toFixed(1)}%)`, 'sl', {
            market: pos.symbol, slug: pos.slug, outcome: pos.outcome,
            entryPrice: pos.entryPrice, exitPrice: price, gainPct, pnl: pos.pnl, shares: positionShares(pos),
          });
          continue;
        }

        // 2. Check trailing stop
        const trailHit = checkTrailingStop(pos, price);
        if (trailHit) {
          await closePosition(trailHit);
          log(`🪤 TRAIL ${pos.symbol} ${pos.outcome.toUpperCase()} · ${gainPct.toFixed(1)}% from peak · +$${pos.pnl.toFixed(2)}`, 'tp', {
            market: pos.symbol, slug: pos.slug, outcome: pos.outcome,
            entryPrice: pos.entryPrice, exitPrice: price, gainPct, pnl: pos.pnl, shares: positionShares(pos),
            highestPrice: pos.highestPrice,
          });
          continue;
        }

        // 3. Check partial profit (before full TP)
        if (!pos.partialSold) {
          const partialHit = checkPartialProfit(pos, price);
          if (partialHit) {
            await closePosition(partialHit);
            continue;
          }
        }

        // 4. Check full TP
        if (gainPct >= pos.targetTp) {
          await closePosition('tp');
          log(`💰 ${pos.mode === 'live' ? 'LIVE' : 'PAPER'} TP ${pos.symbol} ${pos.outcome.toUpperCase()} · +$${pos.pnl.toFixed(2)} (+${gainPct.toFixed(1)}%)`, 'tp', {
            market: pos.symbol, slug: pos.slug, outcome: pos.outcome,
            entryPrice: pos.entryPrice, exitPrice: price, gainPct, pnl: pos.pnl, shares: positionShares(pos),
          });
        }
      }

      const windowStartMs = market.endTime ? (market.endTime - POLY_WINDOW_SECONDS) * 1000 : getCycleEndMs() - POLY_WINDOW_SECONDS * 1000;
      const pendingForMarket = botState.pendingTrades.find(
        (p) => p.status === 'pending' && p.slug === market.slug
      );

      const decision = summarizeMarketDecision({
        market,
        remaining,
        selectedCandidate: action === 'announce' ? null : selectedCandidate,
        candidates,
        activePosition,
        announced: pendingForMarket || (action === 'announce' ? botState.pendingTrades.find((p) => p.slug === market.slug) : null),
      });

      enriched.push({
        symbol: market.symbol, slug: market.slug, question: market.question,
        tokenIds: market.tokenIds, endTime: market.endTime,
        startAtMs: windowStartMs,
        endAtMs: market.endTime ? market.endTime * 1000 : getCycleEndMs(),
        durationSec: POLY_WINDOW_SECONDS,
        windowStatus: market.isCurrent ? 'LIVE' : 'NEXT',
        remaining, remainingMs, prices, action,
        isCurrent: market.isCurrent,
        acceptingOrders: market.acceptingOrders,
        spread: prices.up && prices.down ? Math.round((1 - prices.up - prices.down) * 1000) / 1000 : null,
        depth: summarizeBook(depth),
        book: summarizeBook(depth),
        signal: signal ? { direction: signal.direction, confidence: signal.confidence, rsi: signal.rsi } : null,
        signalDetails: summarizeSignal(signal),
        decision,
        candidates,
        sizingPreview: selectedCandidate?.eligible ? resolveOrderSize(cfg, {
          price: selectedCandidate.price,
          signal,
          readiness,
          stats: botState.stats,
        }) : null,
        position: activePosition ? {
          id: activePosition.id,
          outcome: activePosition.outcome,
          entryPrice: activePosition.entryPrice,
          currentPrice: activePosition.currentPrice,
          shares: positionShares(activePosition),
          gainPct: activePosition.gainPct || 0,
          pnl: activePosition.pnl || 0,
          markValue: activePosition.markValue || activePosition.size,
          mode: activePosition.mode,
          targetTp: activePosition.targetTp,
        } : null,
        volume: market.volume || 0,
        liquidity: market.liquidity || 0,
        tickSize: market.tickSize,
        minShares: market.minShares,
      });
    }

    botState.markets = [
      ...enriched,
      ...markets.filter((market) => !market.isCurrent).map((market) => {
        const nextRemainingMs = market.endTime
          ? Math.max(0, market.endTime * 1000 - Date.now())
          : getRemainingMs();
        return {
        symbol: market.symbol,
        slug: market.slug,
        question: market.question,
        endTime: market.endTime,
        endAtMs: market.endTime ? market.endTime * 1000 : getCycleEndMs(),
        remaining: Math.ceil(nextRemainingMs / 1000),
        remainingMs: nextRemainingMs,
        prices: market.gammaPrices || {},
        action: 'watch',
        isCurrent: false,
        decision: {
          action: 'watch',
          summary: `NEXT ${market.symbol} window`,
          trace: ['next 5m window — not trading yet'],
        },
      };
      }),
    ];
    botState.lastScan = Date.now();

    const t = botState.trades;
    botState.stats.totalTrades = t.length;
    botState.stats.totalPnl = Math.round(t.reduce((s, x) => s + (x.pnl || 0), 0) * 100) / 100;
    botState.stats.wins = t.filter(x => (x.pnl || 0) > 0).length;
    botState.stats.losses = t.filter(x => (x.pnl || 0) <= 0).length;

    saveState();

    const buyCount = enriched.filter((market) => market.action === 'buy').length;
    logScan(
      `🔎 Scan #${botState.stats.scansDone} — ${enriched.length} mkts · ${buyCount} buy signals · cycle ${formatRemainingMs()}`,
      {
        scan: botState.stats.scansDone,
        markets: enriched.map((market) => ({
          symbol: market.symbol,
          slug: market.slug,
          action: market.action,
          summary: market.decision?.summary,
          remaining: market.remaining,
        })),
      }
    );

  } catch (err) {
    log(`⚠️ Scan error: ${err.message}`, 'error');
  } finally {
    botState._scanning = false;
  }
}

async function fetchSpotTicker(symbol) {
  const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const d = await res.json();
  return {
    symbol,
    price: Number(d.lastPrice),
    changePct: Number(d.priceChangePercent),
    high: Number(d.highPrice),
    low: Number(d.lowPrice),
    ts: Date.now(),
  };
}

export async function refreshSpotPrices() {
  try {
    const [btc, eth] = await Promise.all([
      fetchSpotTicker('BTCUSDT'),
      fetchSpotTicker('ETHUSDT'),
    ]);
    botState.spotPrices = {
      btc: btc || botState.spotPrices.btc,
      eth: eth || botState.spotPrices.eth,
    };
  } catch {}
  return botState.spotPrices;
}

function windowStatusFor(market, remainingMs) {
  if (market.closed || remainingMs <= 0) return 'RESOLVED';
  if (!market.isCurrent) return 'NEXT';
  if (remainingMs <= 15000) return 'ENDING';
  return 'LIVE';
}

/** Keep markets + resolution visible even when the trading bot is stopped */
export async function refreshLiveMarkets() {
  if (botState._scanning) return botState.markets;
  try {
    const include15m = botState.config.use15m !== false;
    const { markets, diagnostics } = await findMarkets(include15m);
    botState.diagnostics = diagnostics;
    const enriched = [];

    for (const market of markets) {
      const prices = await getPricesForMarket(market).catch(() => market.gammaPrices || {});
      const depth = await getDepthForMarket(market).catch(() => null);
      recordChartTick(market.slug, prices);
      const remainingMs = market.endTime
        ? Math.max(0, market.endTime * 1000 - Date.now())
        : getRemainingMs();
      const remaining = Math.ceil(remainingMs / 1000);
      const windowStatus = windowStatusFor(market, remainingMs);
      const up = prices.up ?? market.gammaPrices?.up;
      const down = prices.down ?? market.gammaPrices?.down;
      const impliedWinner = up != null && down != null
        ? (up > down ? 'UP' : down > up ? 'DOWN' : 'TIE')
        : null;

      const bookSummary = summarizeBook(depth);

      enriched.push({
        symbol: market.symbol,
        slug: market.slug,
        question: market.question,
        tokenIds: market.tokenIds,
        endTime: market.endTime,
        startAtMs: market.endTime ? (market.endTime - POLY_WINDOW_SECONDS) * 1000 : null,
        endAtMs: market.endTime ? market.endTime * 1000 : getCycleEndMs(),
        durationSec: POLY_WINDOW_SECONDS,
        windowStatus,
        remaining,
        remainingMs,
        prices: { up, down },
        action: botState.running ? (botState.markets.find((m) => m.slug === market.slug)?.action || 'watch') : 'watch',
        isCurrent: market.isCurrent,
        acceptingOrders: market.acceptingOrders && remainingMs > 0,
        closed: !!market.closed || remainingMs <= 0,
        spread: up != null && down != null ? Math.round((1 - up - down) * 1000) / 1000 : null,
        impliedWinner,
        book: bookSummary,
        depth: bookSummary,
        resolution: {
          status: windowStatus,
          endsAt: market.endTime ? market.endTime * 1000 : null,
          impliedWinner,
          note: windowStatus === 'RESOLVED'
            ? 'Window ended — Polymarket settles winning side'
            : windowStatus === 'ENDING'
              ? 'Final seconds — exits / resolution imminent'
              : windowStatus === 'LIVE'
                ? 'Accepting orders'
                : 'Next window',
        },
        signal: botState.signals[market.symbol.toLowerCase()]
          ? {
              direction: botState.signals[market.symbol.toLowerCase()].direction,
              confidence: botState.signals[market.symbol.toLowerCase()].confidence,
              rsi: botState.signals[market.symbol.toLowerCase()].rsi,
            }
          : null,
        volume: market.volume || 0,
        liquidity: market.liquidity || 0,
        tickSize: market.tickSize,
        minShares: market.minShares,
      });
    }

    // Preserve richer scan decision fields when bot is actively scanning/running
    if (botState.running && botState.markets?.length) {
      const bySlug = Object.fromEntries(botState.markets.map((m) => [m.slug, m]));
      botState.markets = enriched.map((m) => {
        const prev = bySlug[m.slug];
        if (!prev) return m;
        return {
          ...m,
          action: prev.action,
          decision: prev.decision,
          candidates: prev.candidates,
          sizingPreview: prev.sizingPreview,
          position: prev.position,
          signalDetails: prev.signalDetails,
          depth: prev.depth,
        };
      });
    } else {
      botState.markets = enriched;
    }
    notifyStateChange();
  } catch (err) {
    console.error('refreshLiveMarkets:', err?.message || err);
  }
  return botState.markets;
}

export async function sampleCharts({ refreshMl = false } = {}) {
  try {
    const { markets } = await findMarkets(botState.config.use15m !== false);
    const current = markets.filter((m) => m.isCurrent);
    await Promise.all(current.map(async (m) => {
      const prices = await getPricesForMarket(m).catch(() => m.gammaPrices || {});
      recordChartTick(m.slug, prices);
    }));
  } catch {}

  if (refreshMl && botState.config.useML !== false) {
    await refreshMLTraces(false).catch(() => {});
  }

  return {
    charts: Object.fromEntries(
      Object.keys(botState._chartTicks).map((slug) => [slug, getChartSeries(slug)])
    ),
    mlTraces: {
      btc: getPriceTrace('btc'),
      eth: getPriceTrace('eth'),
    },
    confidenceBuffer: getConfidenceBufferStats(),
    mlPython: null,
  };
}

let _mlRefreshRunning = false;
let _lastMlRefresh = 0;
const ML_REFRESH_MIN_MS = 50000;

export async function refreshMLTraces(force = false) {
  if (botState.config.useML === false) {
    return { btc: getPriceTrace('btc'), eth: getPriceTrace('eth') };
  }
  if (_mlRefreshRunning) {
    return { btc: getPriceTrace('btc'), eth: getPriceTrace('eth'), pending: true };
  }
  if (!force && Date.now() - _lastMlRefresh < ML_REFRESH_MIN_MS) {
    return { btc: getPriceTrace('btc'), eth: getPriceTrace('eth'), cached: true };
  }

  _mlRefreshRunning = true;
  try {
    const traces = await getMLTraceForBoth();
    for (const asset of ['btc', 'eth']) {
      const trace = traces[asset];
      if (!trace || trace.error) continue;
      if (trace.priceTrace?.length) {
        addPriceTrace(asset, trace.priceTrace);
        addMLPrediction(asset, {
          direction: trace.direction,
          confidence: trace.confidence,
          expected_return: trace.expected_return,
        });
      }
    }
    _lastMlRefresh = Date.now();
    notifyStateChange();
  } catch (err) {
    console.error('ML trace refresh failed:', err?.message || err);
  } finally {
    _mlRefreshRunning = false;
  }

  return {
    btc: getPriceTrace('btc'),
    eth: getPriceTrace('eth'),
    refreshedAt: _lastMlRefresh,
  };
}

let _feedsStarted = false;
export function startBackgroundFeeds() {
  if (_feedsStarted) return;
  _feedsStarted = true;

  // Immediate kick
  refreshSpotPrices().catch(() => {});
  refreshLiveMarkets().catch(() => {});
  syncBalances().catch(() => {});

  // Spot BTC/ETH every 3s
  setInterval(() => {
    refreshSpotPrices().catch(() => {});
  }, 3000);

  // Markets + resolution + chart ticks every 3s (works with bot stopped)
  setInterval(() => {
    refreshLiveMarkets().catch(() => {});
  }, 3000);

  // Keep CLOB / cash fresh
  setInterval(() => {
    syncBalances().catch(() => {});
  }, 30000);

  // Extra chart sample
  setInterval(() => {
    sampleCharts({ refreshMl: false }).catch(() => {});
  }, 5000);

  // ML ladder traces (~every 55s, first kick after 3s)
  setTimeout(() => {
    refreshMLTraces(true).catch(() => {});
  }, 3000);
  setInterval(() => {
    refreshMLTraces(false).catch(() => {});
  }, 55000);
}

export function startBot() {
  if (botState.running) return;
  botState.running = true;
  botState._startTime = Date.now();
  botState.config.enabled = true;
  saveConfig(botState.config);
  refreshTelemetry().then((readiness) => {
    if (botState.config.mode === 'live' && !readiness.liveReady) {
      log(`⚠️ LIVE blocked — ${readiness.needs.join(' · ') || 'fund CLOB USDC first'}`, 'error', { readiness });
    }
  });
  log(`🚀 Bot started — ${botState.config.mode} mode · ${botState.config.useSignals ? 'signals on' : 'no signals'} · BTC/ETH${botState.config.use15m !== false ? ' 5m+15m' : ' 5m'}`, 'system');
  scan();
  botState.interval = setInterval(scan, POLY_SCAN_INTERVAL_MS);
}

export function stopBot() {
  botState.running = false;
  botState.config.enabled = false;
  saveConfig(botState.config);
  if (botState.interval) { clearInterval(botState.interval); botState.interval = null; }
  log('⏹️ Bot stopped', 'system');
}

async function executeSell(pos, reason = 'manual') {
  if (!pos || pos.closed) return { ok: false, error: 'Position not found or already closed' };

  const price = pos.currentPrice || pos.entryPrice;
  markPosition(pos, price);

  if (pos.mode === 'live' && pos.tokenId && positionShares(pos) > 0) {
    try {
      const result = await placeMarketSell({
        tokenId: pos.tokenId,
        shares: positionShares(pos),
        negRisk: pos.negRisk,
        tickSize: pos.tickSize,
      });
      pos.orderId = result.id;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  pos.exitPrice = price;
  pos.closed = true;
  pos.exitReason = reason;
  saveTrade({ ...pos, timestamp: Date.now(), orderId: pos.orderId });
  saveState();
  try { await syncClobBalance(); await refreshTelemetry(); } catch {}

  log(`⚡ RAPID SELL ${pos.symbol} ${pos.outcome?.toUpperCase()} · ${reason} · PnL $${pos.pnl?.toFixed(2)}`, 'sl', {
    market: pos.symbol, slug: pos.slug, outcome: pos.outcome, reason,
    pnl: pos.pnl, shares: positionShares(pos), exitPrice: price,
  });

  return { ok: true, position: pos, pnl: pos.pnl };
}

export async function rapidSell(positionId) {
  const pos = botState.positions.find((p) => p.id === positionId && !p.closed);
  return executeSell(pos, 'rapid');
}

export async function rapidSellAll() {
  const open = botState.positions.filter((p) => !p.closed);
  const results = [];
  for (const pos of open) {
    results.push({ id: pos.id, ...(await executeSell(pos, 'panic')) });
  }
  return { sold: results.filter((r) => r.ok).length, results };
}

export async function rapidSellPmAsset({ assetId, size }) {
  if (!assetId || !size) throw new Error('assetId and size required');
  const result = await placeMarketSell({
    tokenId: assetId,
    shares: Number(size),
    negRisk: false,
    tickSize: '0.01',
  });
  try { await syncClobBalance(); await refreshTelemetry(); } catch {}
  log(`⚡ PM WALLET SELL asset ${String(assetId).slice(0, 12)} · ${size} sh`, 'sl', { assetId, size, orderId: result.id });
  return { ok: true, orderId: result.id };
}
