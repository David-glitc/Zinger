// @ts-nocheck
/**
 * Lightweight Bayesian parameter loop for backtest — mirrors train_heuristics.py
 * strata without requiring Python at runtime.
 */
const PRIOR_A = 2;
const PRIOR_B = 2;

export function confBucket(c) {
  const x = Number(c) || 0;
  if (x < 0.15) return 'low';
  if (x < 0.22) return 'mid';
  if (x < 0.35) return 'high';
  return 'vhigh';
}

export function priceBand(p) {
  const x = Number(p) || 0.5;
  if (x < 0.28) return 'dog';
  if (x < 0.32) return 'cheap';
  if (x < 0.38) return 'sweet';
  if (x < 0.55) return 'mid';
  return 'fav';
}

export function stratumKey(trade) {
  return `${trade.duration || '5m'}|${confBucket(trade.confidence)}|${priceBand(trade.entryPrice)}|${trade.asset || 'BTC'}`;
}

export function createBayesianState() {
  return {
    strata: {},
    updates: [],
    samples: [],
  };
}

export function recordTradeSample(state, trade) {
  const sample = {
    asset: trade.asset,
    duration: trade.duration || '5m',
    confidence: trade.confidence,
    entryPrice: trade.entryPrice,
    pnl: trade.netPnl ?? trade.gross ?? 0,
    exitReason: trade.exitReason || trade.exit,
    won: Number(trade.netPnl ?? trade.gross ?? 0) > 0,
    method: trade.method || trade.planMethod,
    regime: trade.regime,
    ts: trade.ts,
  };
  state.samples.push(sample);
  const key = stratumKey(sample);
  const s = state.strata[key] || { wins: 0, losses: 0, pnl: 0, n: 0 };
  if (sample.won) s.wins++;
  else s.losses++;
  s.pnl += sample.pnl;
  s.n++;
  state.strata[key] = s;
  return sample;
}

export function posteriorWinRate(wins, losses) {
  const a = PRIOR_A + wins;
  const b = PRIOR_B + losses;
  return a / (a + b);
}

/**
 * Suggest config patches from accumulated samples. Returns knobs that need
 * tightening when a stratum is bleeding.
 */
export function suggestConfigPatches(state, baseCfg = {}) {
  const patches = {};
  const notes = [];
  let globalWins = 0;
  let globalLosses = 0;
  let globalPnl = 0;

  for (const s of Object.values(state.strata)) {
    globalWins += s.wins;
    globalLosses += s.losses;
    globalPnl += s.pnl;
  }
  const globalN = globalWins + globalLosses;
  const globalWr = globalN > 0 ? globalWins / globalN : 0.5;

  if (globalN >= 30 && globalWr < 0.42) {
    patches.minConfidence = Math.min(0.35, Number(baseCfg.minConfidence ?? 0.2) + 0.02);
    patches.kellyFraction = Math.max(0.06, Number(baseCfg.kellyFraction ?? 0.12) * 0.9);
    notes.push(`global WR ${(globalWr * 100).toFixed(1)}% → tighter conf/kelly`);
  } else if (globalN >= 30 && globalWr > 0.55 && globalPnl > 0) {
    patches.kellyFraction = Math.min(0.2, Number(baseCfg.kellyFraction ?? 0.12) * 1.05);
    notes.push(`global WR ${(globalWr * 100).toFixed(1)}% profitable → slight kelly lift`);
  }

  for (const [key, s] of Object.entries(state.strata)) {
    if (s.n < 8) continue;
    const wr = posteriorWinRate(s.wins, s.losses);
    if (wr < 0.35 && s.pnl < -50) {
      notes.push(`${key}: WR~${(wr * 100).toFixed(0)}% loss $${s.pnl.toFixed(0)} — avoid band`);
      if (key.includes('|fav|') || key.includes('|mid|')) {
        patches.maxPrice = Math.min(Number(baseCfg.maxPrice ?? 0.35), 0.34);
      }
    }
  }

  return { patches, notes, globalWr, globalN, globalPnl };
}

export function applyBayesianLoop(state, cfg, { every = 40 } = {}) {
  if (state.samples.length === 0 || state.samples.length % every !== 0) return cfg;
  const { patches, notes } = suggestConfigPatches(state, cfg);
  if (Object.keys(patches).length) {
    state.updates.push({
      at: state.samples.length,
      patches,
      notes,
      kind: 'directional',
    });
    return { ...cfg, ...patches };
  }
  return cfg;
}

/** Arb strata: gap size + sum bucket */
export function arbGapBucket(gap) {
  const g = Number(gap) || 0;
  if (g < 0.006) return 'tight';
  if (g < 0.012) return 'mid';
  return 'wide';
}

export function arbSumBucket(sum) {
  const s = Number(sum) || 1;
  if (s < 0.98) return 'cheap';
  if (s < 0.995) return 'fair';
  return 'rich';
}

export function arbStratumKey(trade) {
  return `arb|${trade.asset || 'BTC'}|${arbGapBucket(trade.arbGap)}|${arbSumBucket(trade.arbSum)}`;
}

export function recordArbSample(state, trade) {
  const sample = {
    ...recordTradeSample(state, trade),
    arbGap: trade.arbGap,
    arbSum: trade.arbSum,
    method: 'arb',
  };
  const key = arbStratumKey(sample);
  const s = state.arbStrata?.[key] || { wins: 0, losses: 0, pnl: 0, n: 0 };
  if (sample.won) s.wins++;
  else s.losses++;
  s.pnl += sample.pnl;
  s.n++;
  if (!state.arbStrata) state.arbStrata = {};
  state.arbStrata[key] = s;
  return sample;
}

/**
 * Tune arb knobs from settled arb packages — tighten when bleeding, loosen when profitable.
 */
export function suggestArbPatches(state, baseCfg = {}) {
  const patches = {};
  const notes = [];
  const arbSamples = state.samples.filter((s) => s.method === 'arb');
  if (arbSamples.length < 12) return { patches, notes, arbN: arbSamples.length, arbPnl: 0 };

  let wins = 0;
  let losses = 0;
  let pnl = 0;
  for (const s of arbSamples) {
    pnl += s.pnl;
    if (s.won) wins++;
    else losses++;
  }
  const n = wins + losses;
  const wr = n > 0 ? wins / n : 0.5;

  const minGap = Number(baseCfg.minArbGap ?? 0.006);
  const margin = Number(baseCfg.arbMinMarginPct ?? 0.003);
  const frac = Number(baseCfg.arbBankrollFrac ?? 0.18);

  if (n >= 20 && wr < 0.55 && pnl < 0) {
    patches.minArbGap = Math.min(0.02, minGap + 0.001);
    patches.arbMinMarginPct = Math.min(0.012, margin + 0.0005);
    patches.arbBankrollFrac = Math.max(0.08, frac * 0.9);
    notes.push(`arb WR ${(wr * 100).toFixed(1)}% pnl $${pnl.toFixed(0)} → tighter gap/margin, smaller frac`);
  } else if (n >= 20 && wr > 0.7 && pnl > 0) {
    patches.minArbGap = Math.max(0.004, minGap - 0.0005);
    patches.arbMinMarginPct = Math.max(0.002, margin - 0.0003);
    patches.arbBankrollFrac = Math.min(0.28, frac * 1.05);
    notes.push(`arb WR ${(wr * 100).toFixed(1)}% pnl $${pnl.toFixed(0)} → loosen gap, lift frac`);
  }

  for (const [key, s] of Object.entries(state.arbStrata || {})) {
    if (s.n < 6) continue;
    if (s.pnl < -80 && s.wins / s.n < 0.5) {
      notes.push(`${key}: loss $${s.pnl.toFixed(0)} — avoid stratum`);
      if (key.includes('|wide|')) {
        patches.minArbGap = Math.min(0.025, Number(patches.minArbGap ?? minGap) + 0.002);
      }
    }
  }

  return { patches, notes, arbN: n, arbPnl: pnl, arbWr: wr };
}

export function applyArbBayesianLoop(state, cfg, { every = 25 } = {}) {
  const arbN = state.samples.filter((s) => s.method === 'arb').length;
  if (arbN === 0 || arbN % every !== 0) return cfg;
  const { patches, notes } = suggestArbPatches(state, cfg);
  if (Object.keys(patches).length) {
    state.updates.push({
      at: arbN,
      patches,
      notes,
      kind: 'arb',
    });
    return { ...cfg, ...patches };
  }
  return cfg;
}
