// @ts-nocheck
/**
 * Unified observability snapshot — single source for session observer, API, and dashboard.
 */
import { positionWindowEndMs } from '../positions/settle.js';

export function closedPaperTrades(trades = []) {
  return (trades || []).filter(
    (t) => t.mode === 'paper' && (t.closed || t.exitReason || t.exitPrice != null),
  );
}

export function sessionTrades(trades, session) {
  if (!session?.startedAt) return closedPaperTrades(trades);
  return closedPaperTrades(trades).filter(
    (t) => Number(t.timestamp || t.entryTime || t.openedAt || 0) >= Number(session.startedAt),
  );
}

function sideStats(trades) {
  const up = trades.filter((t) => String(t.outcome).toLowerCase() === 'up').length;
  const down = trades.length - up;
  return { up, down, upShare: trades.length ? up / trades.length : 0.5 };
}

function sizeStats(trades) {
  const sizes = trades.map((t) => Number(t.costBasis) || Number(t.entryPrice) * Number(t.shares) || 0);
  if (!sizes.length) return { avg: 0, min: 0, max: 0 };
  return {
    avg: sizes.reduce((s, v) => s + v, 0) / sizes.length,
    min: Math.min(...sizes),
    max: Math.max(...sizes),
  };
}

function forecastStats(markets) {
  let total = 0;
  let withFc = 0;
  let implausible = 0;
  let vetoed = 0;
  let micro = 0;
  for (const m of markets || []) {
    for (const c of m.candidates || []) {
      total++;
      if (c.forecast) withFc++;
      if (c.forecast?.implausible) implausible++;
      if (c.micro?.weight > 0) micro++;
      if ((c.reasons || []).some((r) => /forecast .*vs ask|forecast ignored/.test(r))) vetoed++;
    }
  }
  return { total, withFc, implausible, vetoed, micro };
}

function orphanPaperPositions(positions, nowMs = Date.now()) {
  return (positions || []).filter((p) => {
    if (p?.closed || p?.mode !== 'paper') return false;
    const endMs = positionWindowEndMs(p);
    return endMs != null && nowMs > endMs + 15_000;
  });
}

/**
 * Build a normalized observability snapshot from poly getState() output.
 */
export function buildObservabilitySnapshot(state, signalHealth = null, opts = {}) {
  const nowMs = Date.now();
  const session = state.session || {};
  const gov = state.governor || {};
  const cfg = state.config || {};
  const process = state.process || {};
  const sessClosed = sessionTrades(state.trades, session);
  const sessPnl = sessClosed.reduce((s, t) => s + Number(t.pnl || 0), 0);
  const open = (state.positions || []).filter((p) => !p.closed);
  const deployed = open.reduce((s, p) => s + (Number(p.costBasis) || Number(p.entryPrice) * Number(p.shares) || 0), 0);
  const unrealized = open.reduce((s, p) => s + Number(p.pnl || 0), 0);
  const cash = Number(cfg.paperBankroll ?? state.portfolio?.cash ?? 0);
  const initial = Number(cfg.paperInitialDeposit ?? session.baselineCash ?? 1000);
  const equity = Number(state.portfolio?.equity ?? cash + deployed + unrealized);
  const peak = Number(gov.peakEquity ?? initial);
  const dd = peak > 0 ? (peak - equity) / peak : 0;
  const lastScanAt = state.lastScan || process.lastScanAt || null;
  const lastScanAgeMs = lastScanAt ? nowMs - Number(lastScanAt) : null;
  const orphans = orphanPaperPositions(state.positions, nowMs);

  return {
    at: new Date(nowMs).toISOString(),
    sessionId: session.id,
    sessionStartedAt: session.startedAt ? new Date(session.startedAt).toISOString() : null,
    sessionTrades: sessClosed.length,
    sessionWins: sessClosed.filter((t) => Number(t.pnl || 0) > 0).length,
    sessionLosses: sessClosed.filter((t) => Number(t.pnl || 0) <= 0).length,
    sessionPnl: Math.round(sessPnl * 100) / 100,
    running: Boolean(state.running),
    scanning: Boolean(state.scanning || process.scanning),
    phase: process.phase || (state.running ? 'idle' : 'stopped'),
    scansDone: Number(state.stats?.scansDone ?? process.scansDone ?? 0),
    regime: gov.regime || gov.profile || null,
    governorBreaker: Boolean(gov.drawdownBreakerActive || gov.breakerActive),
    governorReason: gov.reason || gov.lastResult?.reasons?.[0] || null,
    peakEquity: Math.round(peak * 100) / 100,
    equity: Math.round(equity * 100) / 100,
    drawdownPct: Math.round(dd * 10000) / 100,
    cash: Math.round(cash * 100) / 100,
    deployed: Math.round(deployed * 100) / 100,
    unrealized: Math.round(unrealized * 100) / 100,
    openPositions: open.length,
    maxOpenPositions: Number(cfg.maxOpenPositions ?? 4),
    maxArbPackages: Number(cfg.maxArbPackages ?? 4),
    openArbPackages: Number(state.slots?.arb?.open ?? state.packages?.filter?.((p) => p.status === 'LOCKED')?.length ?? 0),
    edgeGate: state.edgeGate || null,
    dataAssurance: {
      ok: state.dataAssurance?.ok,
      score: state.dataAssurance?.score,
      canBuy: state.dataAssurance?.canBuy,
      note: state.dataAssurance?.note,
      blocking: state.dataAssurance?.blocking || [],
      warnings: state.dataAssurance?.warnings || [],
      checks: (state.dataAssurance?.checks || []).map((c) => ({
        id: c.id,
        ok: c.ok,
        level: c.level,
        detail: c.detail,
        blockBuys: c.blockBuys,
      })),
    },
    signalHealth: signalHealth ? {
      status: signalHealth.status,
      directionalTrustworthy: signalHealth.directionalTrustworthy,
      checks: (signalHealth.checks || []).map((c) => ({
        id: c.id,
        status: c.status,
        message: c.message,
      })),
    } : null,
    clobWs: state.clobWs ? {
      connected: state.clobWs.connected,
      running: state.clobWs.running,
      subscribed: state.clobWs.subscribed,
      lastMsgAgeMs: state.clobWs.lastMsgAgeMs,
    } : null,
    orphans: orphans.map((p) => ({
      id: p.id,
      slug: p.slug,
      symbol: p.symbol,
      outcome: p.outcome,
      packageId: p.packageId,
      isArbLeg: p.isArbLeg,
      costBasis: p.costBasis,
      windowEndMs: positionWindowEndMs(p),
    })),
    sideBalance: sideStats(sessClosed),
    sizing: (() => {
      const s = sizeStats(sessClosed);
      return {
        avgUsd: Math.round(s.avg * 100) / 100,
        minUsd: Math.round(s.min * 100) / 100,
        maxUsd: Math.round(s.max * 100) / 100,
      };
    })(),
    forecast: forecastStats(state.markets),
    lastScan: lastScanAt ? new Date(lastScanAt).toISOString() : null,
    lastScanAgeMs,
    sessionTarget: opts.sessionTarget ?? null,
    mode: cfg.mode || 'paper',
    priceBand: [cfg.minPrice, cfg.maxPrice],
    arbEnabled: cfg.clobArbEnabled !== false,
    forceArbOnly: cfg.forceArbOnly === true,
  };
}
