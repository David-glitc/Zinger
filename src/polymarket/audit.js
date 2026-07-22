import fs from 'fs';
import path from 'path';

const BASELINE_FILE = path.resolve(import.meta.dirname, '../../data/poly_baseline.json');

export function loadBaseline() {
  try {
    const data = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
    return Number(data.balanceUsd) || null;
  } catch {
    return null;
  }
}

export function saveBaseline(balanceUsd, note = '') {
  const payload = { balanceUsd: Number(balanceUsd), setAt: Date.now(), note };
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

export function tradeCostBasis(trade) {
  const shares = trade.shares > 0
    ? trade.shares
    : (trade.entryPrice > 0 && trade.size > 0 ? trade.size / trade.entryPrice : 0);
  return Math.round(shares * (trade.entryPrice || 0) * 100) / 100;
}

export function tradeRealizedPnl(trade) {
  if (trade.exitPrice == null || !trade.entryPrice) return trade.pnl ?? 0;
  const shares = trade.shares > 0
    ? trade.shares
    : (trade.size > 0 ? trade.size / trade.entryPrice : 0);
  if (!shares) return trade.pnl ?? 0;
  return Math.round((trade.exitPrice - trade.entryPrice) * shares * 100) / 100;
}

export function normalizeTrade(trade) {
  const cost = tradeCostBasis(trade);
  const pnl = tradeRealizedPnl(trade);
  const verified = trade.mode === 'paper'
    ? false
    : !!(trade.orderId || (trade.exitReason && cost > 0));
  return { ...trade, costBasis: cost, pnl, verified };
}

export function dedupeTrades(trades) {
  const seen = new Map();
  for (const t of trades) {
    const key = `${t.mode}:${t.slug}:${t.outcome}:${t.exitReason || '?'}`;
    if (!seen.has(key)) seen.set(key, normalizeTrade(t));
  }
  return [...seen.values()];
}

export function computeTradeStats(trades) {
  const list = trades.map(normalizeTrade);
  const wins = list.filter((x) => x.pnl > 0).length;
  const losses = list.filter((x) => x.pnl <= 0).length;
  const totalPnl = list.reduce((s, x) => s + x.pnl, 0);
  const verified = list.filter((x) => x.verified);
  const verifiedPnl = verified.reduce((s, x) => s + x.pnl, 0);
  return {
    totalTrades: list.length,
    verifiedTrades: verified.length,
    wins,
    losses,
    totalPnl: Math.round(totalPnl * 100) / 100,
    verifiedPnl: Math.round(verifiedPnl * 100) / 100,
    winRate: list.length ? ((wins / list.length) * 100).toFixed(1) : '0',
    bestTrade: list.length ? Math.round(Math.max(...list.map((x) => x.pnl)) * 100) / 100 : 0,
    worstTrade: list.length ? Math.round(Math.min(...list.map((x) => x.pnl)) * 100) / 100 : 0,
  };
}

export function runAudit({ readiness, trades, botPositions, cash, baselineUsd }) {
  const issues = [];
  const deduped = dedupeTrades(trades || []);
  const live = deduped.filter((t) => t.mode === 'live');
  const paper = deduped.filter((t) => t.mode === 'paper');
  const liveStats = computeTradeStats(live);
  const paperStats = computeTradeStats(paper);

  const pmPositions = readiness?.positions || [];
  const openBot = (botPositions || []).filter((p) => !p.closed);
  const unverifiedLive = live.filter((t) => !t.orderId);

  if (unverifiedLive.length) {
    issues.push(`${unverifiedLive.length} live trade(s) missing orderId — PnL may be estimated`);
  }
  if (openBot.length && pmPositions.length === 0) {
    issues.push(`${openBot.length} bot-tracked open position(s) not on Polymarket wallet`);
  }
  if (openBot.length > pmPositions.length + 1) {
    issues.push('Bot position count exceeds wallet — stale tracker entries');
  }

  const baseline = baselineUsd ?? loadBaseline();
  const cashPnl = baseline != null ? Math.round((cash - baseline) * 100) / 100 : null;
  const botPnl = liveStats.verifiedPnl;
  if (cashPnl != null && Math.abs(cashPnl - botPnl) > 1.5) {
    issues.push(`Cash PnL ($${cashPnl}) differs from verified bot PnL ($${botPnl}) — trust cash`);
  }

  const rawLivePnl = (trades || []).filter((t) => t.mode === 'live').reduce((s, t) => s + (t.pnl || 0), 0);
  if (Math.abs(rawLivePnl - liveStats.totalPnl) > 0.01) {
    issues.push(`Deduped trades: raw log PnL $${rawLivePnl.toFixed(2)} → $${liveStats.totalPnl.toFixed(2)}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    baselineUsd: baseline,
    cashPnl,
    botPnlVerified: liveStats.verifiedPnl,
    botPnlAll: liveStats.totalPnl,
    paperPnl: paperStats.totalPnl,
    pnlSource: 'cash',
    live: liveStats,
    paper: paperStats,
    wallet: {
      cash: Math.round(cash * 100) / 100,
      pmPositions: pmPositions.length,
      pmUnrealized: Math.round(pmPositions.reduce((s, p) => s + Number(p.cashPnl || 0), 0) * 100) / 100,
      botOpen: openBot.length,
      clobBalance: readiness?.clobBalance ?? null,
      liveReady: readiness?.liveReady ?? false,
    },
    checks: [
      { id: 'clob', ok: (readiness?.clobBalance ?? 0) >= 0, detail: `CLOB $${(readiness?.clobBalance ?? 0).toFixed(2)}` },
      { id: 'api', ok: !!readiness?.apiReady, detail: readiness?.apiReady ? 'API ok' : 'API missing' },
      { id: 'owner', ok: readiness?.ownerMatches !== false, detail: readiness?.ownerMatches === false ? 'Owner mismatch' : 'Owner ok' },
      { id: 'pnl_cash', ok: cashPnl == null || cashPnl >= -2, detail: cashPnl != null ? `Net vs baseline: $${cashPnl}` : 'Set baseline to track net PnL' },
      { id: 'trades', ok: unverifiedLive.length === 0, detail: `${liveStats.verifiedTrades}/${liveStats.totalTrades} live trades verified` },
    ],
  };
}
