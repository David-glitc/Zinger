// @ts-nocheck
/**
 * Paper / live strategy isolation.
 * Shared: mode, enabled, paper cash ledger fields.
 * Everything else lives under profiles.paper / profiles.live.
 */

import { normalizeAttribution } from './config/attribution.js';
import { CONF_GATE } from './confidenceScale.js';
export const SHARED_KEYS = new Set([
  'mode',
  'enabled',
  'paperBankroll',
  'paperInitialDeposit',
]);

/** Default paper bankroll from environment variable (ZINGER_DEFAULT_PAPER_BANKROLL / PAPER_BANKROLL) defaulting to 100 */
export function getDefaultPaperBankroll(): number {
  const envVal = process.env.ZINGER_DEFAULT_PAPER_BANKROLL || process.env.PAPER_BANKROLL;
  const parsed = Number(envVal);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

/** Strategy knobs that must NOT leak across modes */
export const STRATEGY_KEYS = [
  'minPrice', 'maxPrice', 'hardMinPrice', 'hardMaxPrice', 'dynamicEntry', 'feeRate',
  'tpPctLow', 'tpPctHigh', 'slPct',
  'maxPositionSize', 'minPositionSize', 'maxPositionPct', 'maxPositionCap',
  'bankrollReservePct',
  'useKellySizing', 'kellyFraction',
  'certaintySizing', 'certaintyMaxPct', 'certaintyMaxUsd',
  'arbBankrollFrac', 'arbMaxUsd', 'arbSliceUsd',
  'useAggressiveScaling', 'aggScaleMultiplier',
  'minRemainingSec', 'maxEntryRemainingSec', 'entryWindowFrac',
  'assets', 'use15m', 'enabledDurations',
  'maxConcurrentPerSlug', 'maxOpenPositions',
  'minConfidence',
  'maxConfidence',
  'counterMaxConfidence',
  'useSignals', 'useML', 'useOrderBookBias', 'requireTightSpread',
  'useStrikeForecast', 'strikeForecastVeto', 'strikeForecastVetoEdge',
  'useBookMicrostructure', 'useSessionTA', 'bookQualityMin', 'liquiditySlippageMaxPct',
  'tradeCurrentWindowOnly',
  'announceBeforeTrade', 'announceTimeoutSec',
  'autoApprovePaper', 'autoApproveLive',
  'partialTpFrac', 'partialSellPct', 'trailActivateFrac', 'trailDistanceCap',
  'adaptiveSl', 'minAdaptiveSlPct',
  'llmOptimize', 'optimizeIntervalMs',
  'governorEnabled', 'governorIntervalMs', 'governorCooldownMs',
  'governorDrawdownPct', 'governorRevertTrades',
  'evalBothSides', 'sideBalanceEnabled', 'sideBalanceWeight',
  'preferShortTf', 'shortTfWeight',
  'clobArbEnabled', 'minArbGap', 'arbMinMarginPct', 'arbExploreRate', 'maxArbPackages', 'maxArbPerSlug',
  'minArbPackageUsd', 'minArbLockedProfitUsd', 'minArbLockedProfitPct',
  'arbDynamicGates', 'arbGapFloor', 'arbMarginFloor', 'arbLockUsdFloor', 'arbLockPctFloor', 'arbPackageUsdFloor',
  'arbExitMode', 'arbSpreadMinBidSum', 'arbSpreadMinCaptureFrac', 'arbThirdLegHedge',
  'arbReverseEnabled',
  'arbOnlyUntilEdge', 'forceArbOnly', 'requireEdgeForLive',
  'edgeLookback', 'edgeMinTrades', 'edgeMinExpectancy',
  'holdToSettleUnderdogs', 'underdogMaxPrice', 'holdToSettleDisasterSlPct',
  'holdToSettleFavorites', 'favoriteMinPrice', 'favoriteMaxPrice',
  'slMaxSlippagePct',
  'allowScaleIn',
  'maxOpenDrawdownPct',
  'simulateClobFees',
  'useClobMarketFees',
  'feeCategory',
  'minTpUsd',
  'requireDataAssurance',
  'instantCtfMerge',
];

export function defaultPaperStrategy() {
  return {
    // Hard absolute bounds only — dynamicEntry computes real gate from edge/time/vol
    minPrice: 0.12, maxPrice: 0.88,
    hardMinPrice: 0.05, hardMaxPrice: 0.95,
    dynamicEntry: true, feeRate: 0.07,
    tpPctLow: 18, tpPctHigh: 36, slPct: 12,
    maxPositionSize: 100,
    minPositionSize: 5,
    maxPositionPct: 0.14,
    maxPositionCap: 100,
    bankrollReservePct: 0.05,
    useKellySizing: true,
    kellyFraction: 0.15,
    certaintySizing: true,
    certaintyMaxPct: 0.10,
    certaintyMaxUsd: 100,
    // Compare spot against the window's own strike instead of inferring
    // direction from TA alone. The veto blocks the side the geometry rules out;
    // an implausible edge disables both, since that indicates a spot-feed gap
    // rather than a mispricing.
    useStrikeForecast: true,
    strikeForecastVeto: true,
    strikeForecastVetoEdge: 0.04,
    useBookMicrostructure: true,
    useSessionTA: true,
    bookQualityMin: 0.18,
    liquiditySlippageMaxPct: 1.5,
    arbBankrollFrac: 0.10,
    arbMaxUsd: 50,
    maxArbPackages: 4,
    maxArbPerSlug: 3,
    useAggressiveScaling: false,
    aggScaleMultiplier: 1.0,
    minRemainingSec: 25,
    maxEntryRemainingSec: 270,
    entryWindowFrac: 0.90,
    assets: ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'],
  enabledDurations: ['5m', '15m'],
  use15m: true,
    maxConcurrentPerSlug: 1,
    maxOpenPositions: 4,
    // Recalibrated 2026-08-31 for the repaired confidence scale. The old 0.60
    // was set against a distribution with a fabricated 0.30 floor; with the
    // MACD units bug fixed and that floor gone, fused confidence measures
    // p50 0.142 / p90 0.256 / max 0.455 over 1,400 live bars, so 0.60 is not
    // strict, it is unreachable. See CONF_GATE in confidenceScale.ts.
    minConfidence: CONF_GATE.STANDARD,
    // Above the observed maximum, so the upper band is effectively off until a
    // closed-trade sample shows over-confident entries actually lose.
    maxConfidence: 0.60,
    useSignals: true,
    useML: true,
    useOrderBookBias: true,
    requireTightSpread: true,
    tradeCurrentWindowOnly: true,
    announceBeforeTrade: true,
    announceTimeoutSec: 28,
    autoApprovePaper: true,
    autoApproveLive: false,
    partialTpFrac: 0.78,
    partialSellPct: 0.28,
    trailActivateFrac: 0.72,
    trailDistanceCap: 10,
    minTpUsd: 5,
    adaptiveSl: false,
    minAdaptiveSlPct: 10,
    slMaxSlippagePct: 2,
    // Live CLOB schedule via /clob-markets fd.r/e (fallback category crypto).
    simulateClobFees: true,
    useClobMarketFees: true,
    feeCategory: 'crypto',
    // Skip buys when spot/signal/mids/to-beat/ledger fail freshness checks.
    requireDataAssurance: true,
    llmOptimize: false,
    optimizeIntervalMs: 180000,
    governorEnabled: true,
    governorIntervalMs: 120000,
    governorCooldownMs: 240000,
    governorDrawdownPct: 0.10,
    governorRevertTrades: 6,
    evalBothSides: true,
    sideBalanceEnabled: true,
    sideBalanceWeight: 12,
    preferShortTf: true,
    shortTfWeight: 2.0,
    clobArbEnabled: true,
    // Absolute floor: "how big a dislocation is worth the trouble". Profitability
    // is no longer this field's job — the fee-aware break-even gate owns that
    // (item 7), and it cannot be turned off. Safe to lower to capture skewed
    // books, which need far less gap than a 50/50 one.
    minArbGap: 0.015,
    // Required profit *above* break-even, in gap terms. Profit = shares x this.
    arbMinMarginPct: 0.006,
    arbExploreRate: 0.08,
    arbOnlyUntilEdge: false,
    forceArbOnly: false,
    requireEdgeForLive: true,
    edgeLookback: 100,
    edgeMinTrades: 40,
    edgeMinExpectancy: 0,
    holdToSettleUnderdogs: true,
    // Doubles as the counter-signal price gate in the directional engine, so
    // widening it past ~0.45 turns "cheap long-shot" into "the whole losing
    // side of a coin flip". Kept below the even-money band on purpose.
    underdogMaxPrice: 0.42,
    // A disagreeing signal at or above this confidence is not faded at all.
    // On the repaired scale a signal at or above the loose gate is a real read,
    // so fading it needs more than a cheap price. Below it we are fading noise,
    // which is what the underdog-price branch is for.
    counterMaxConfidence: CONF_GATE.LOOSE,
    holdToSettleDisasterSlPct: 42,
    holdToSettleFavorites: true,
    favoriteMinPrice: 0.50,
    favoriteMaxPrice: 0.72,
    allowScaleIn: false,
    instantCtfMerge: true,
  };
}

/**
 * Pre-live paper profile — the architecture from before the first mainnet run.
 *
 * Flow: discover markets → TA signal + book bias → buildDecision → Kelly size →
 * execute with TP/SL. No governor regime switching, no edge gate, no strike
 * forecast, no ML override, no LLM optimizer. Arb still runs when CLOB gap exists.
 *
 * This is what paper-tested profitably in July; the layered guardrails added since
 * (governor DD breaker, edge gate, signal health suspend, strike forecast) were
 * meant for live safety but on paper they mostly prevent trading after the first
 * losing streak.
 */
export function classicPaperStrategy() {
  return {
    ...defaultPaperStrategy(),
    // Governor on — regime switching + DD breaker, but paper stays directional
    governorEnabled: true,
    governorDrawdownPct: 0.12,
    governorIntervalMs: 120_000,
    llmOptimize: false,
    arbOnlyUntilEdge: false,
    forceArbOnly: false,
    useBookMicrostructure: true,
    useSessionTA: true,
    bookQualityMin: 0.18,
    liquiditySlippageMaxPct: 1.5,
    dynamicEntry: true,
    hardMinPrice: 0.05, hardMaxPrice: 0.95, feeRate: 0.07,
    useStrikeForecast: true,
    strikeForecastVeto: true,
    strikeForecastVetoEdge: 0.04,
    useML: false,
    // Hold to settle on extremes avoids mid-scalp grind — exit via settlement, not 10% SL
    holdToSettleFavorites: true,
    holdToSettleUnderdogs: true,
    adaptiveSl: false,
    tpPctLow: 15,
    tpPctHigh: 28,
    slPct: 10,
    // Sizing: meaningful on $1k without the validation haircut
    maxPositionPct: 0.08,
    maxPositionCap: 50,
    minPositionSize: 5,
    kellyFraction: 0.12,
    certaintySizing: false,
    maxOpenPositions: 4,
    maxConcurrentPerSlug: 1,
    minConfidence: 0.22,
    maxConfidence: 0.65,
    counterMaxConfidence: CONF_GATE.LOOSE,
    // Wider band — veto does filtering, not price gate. 0.12-0.88 lets targetContext decide.
    minPrice: 0.12,
    maxPrice: 0.88,
    underdogMaxPrice: 0.32,
    favoriteMinPrice: 0.58,
    favoriteMaxPrice: 0.88,
    // Enter from window open while the cheap side is still ~30¢; skip last 25s when illiquid
    maxEntryRemainingSec: 270,
    minRemainingSec: 25,
    entryWindowFrac: 0.9,
    enabledDurations: ['5m'],
    use15m: false,
    clobArbEnabled: true,
    minArbGap: 0.005,
    arbMinMarginPct: 0.002,
    arbBankrollFrac: 0.10,
    arbMaxUsd: 50,
    maxArbPackages: 6,
    maxArbPerSlug: 3,
    evalBothSides: true,
    sideBalanceEnabled: true,
    requireTightSpread: true,
    autoApprovePaper: true,
    requireDataAssurance: true,
  };
}

/**
 * 200-trade directional session — hard reset profile.
 * 30¢ band, TP/SL exits (no hold-to-settle grind), minimal gates, arb secondary.
 */
export function directionalSessionStrategy() {
  return {
    ...classicPaperStrategy(),
    governorEnabled: true,
    governorDrawdownPct: 0.15,
    governorIntervalMs: 180_000,
    arbOnlyUntilEdge: false,
    forceArbOnly: false,
    edgeMinTrades: 5,
    useML: false,
    useStrikeForecast: false,
    strikeForecastVeto: false,
    holdToSettleFavorites: false,
    holdToSettleUnderdogs: false,
    minPrice: 0.25,
    maxPrice: 0.35,
    underdogMaxPrice: 0.35,
    favoriteMinPrice: 0.65,
    favoriteMaxPrice: 0.95,
    minConfidence: 0.20,
    maxConfidence: 0.55,
    kellyFraction: 0.14,
    maxPositionPct: 0.10,
    maxPositionCap: 40,
    minPositionSize: 8,
    maxOpenPositions: 4,
    tpPctLow: 18,
    tpPctHigh: 35,
    slPct: 12,
    adaptiveSl: true,
    minAdaptiveSlPct: 8,
    minRemainingSec: 30,
    maxEntryRemainingSec: 240,
    clobArbEnabled: true,
    minArbGap: 0.005,
    arbMinMarginPct: 0.002,
    arbBankrollFrac: 0.10,
    arbMaxUsd: 45,
    maxArbPackages: 6,
    maxArbPerSlug: 3,
    enabledDurations: ['5m'],
    use15m: false,
    llmOptimize: false,
    autoApprovePaper: true,
    requireDataAssurance: true,
  };
}

/**
 * Live paper arb-only — no directional entries, hunt CLOB gaps only.
 */
export function arbOnlyPaperStrategy() {
  return {
    ...classicPaperStrategy(),
    governorEnabled: true,
    governorDrawdownPct: 0.15,
    governorIntervalMs: 180_000,
    forceArbOnly: true,
    arbOnlyUntilEdge: false,
    clobArbEnabled: true,
    // Dynamic gates loosen these by window phase / touch dislocation
    arbDynamicGates: true,
    minArbGap: 0.006,
    arbMinMarginPct: 0.003,
    minArbLockedProfitUsd: 0.40,
    minArbLockedProfitPct: 0.45,
    arbGapFloor: 0.003,
    arbMarginFloor: 0.0015,
    arbLockUsdFloor: 0.20,
    arbLockPctFloor: 0.25,
    arbPackageUsdFloor: 5,
    // merge = paper CTF sim / live mergePositions ASAP — free capital, keep locked edge
    arbExitMode: 'merge',
    instantCtfMerge: true,
    arbSpreadMinBidSum: 0.985,
    arbSpreadMinCaptureFrac: 0.70,
    arbThirdLegHedge: false,
    // Stage-2: mint+dual-sell when bidΣ > 1 (paper); live CTF split deferred
    arbReverseEnabled: true,
    // $1k paper: ~$50/leg ⇒ ~$100 package; frac leaves room for 3 pkgs/slug
    arbBankrollFrac: 0.30,
    arbMaxUsd: 100,
    arbSliceUsd: 15,
    maxArbPackages: 16,
    maxArbPerSlug: 6,
    minArbPackageUsd: 8,
    minPositionSize: 5,
    maxOpenPositions: 4,
    edgeMinTrades: 999,
    useML: false,
    useStrikeForecast: false,
    strikeForecastVeto: false,
    holdToSettleFavorites: false,
    holdToSettleUnderdogs: false,
    // Max surface: all Gamma crypto up/down series
    assets: ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'],
    enabledDurations: ['5m', '15m', '4h'],
    use15m: true,
    autoApprovePaper: true,
    requireDataAssurance: true,
    llmOptimize: false,
  };
}

export function defaultLiveStrategy() {
  return {
    ...defaultPaperStrategy(),
    maxPositionSize: 1.0,
    maxPositionPct: 0.05,
    maxPositionCap: 1.0,
    maxOpenPositions: 1,
    minConfidence: CONF_GATE.STRICT,
    kellyFraction: 0.05,
    certaintyMaxPct: 0.05,
    certaintyMaxUsd: 2.0,
    arbBankrollFrac: 0.03,
    arbMaxUsd: 1,
    // Wider than paper on purpose: a quoted ask is not a fill price, and this
    // margin is what absorbs the difference when real money is at stake.
    arbMinMarginPct: 0.010,
    autoApprovePaper: true,
    autoApproveLive: false,
    slPct: 8,
    adaptiveSl: true,
    minAdaptiveSlPct: 6,
    slMaxSlippagePct: 1,
    // Live stays locked until paper edge proves out
    arbOnlyUntilEdge: true,
    forceArbOnly: false,
    requireEdgeForLive: true,
    announceBeforeTrade: true,
    minTpUsd: 3,
    minPrice: 0.35,
    maxPrice: 0.65,
    requireTightSpread: true,
    useAggressiveScaling: false,
    maxOpenDrawdownPct: 0.05,
    instantCtfMerge: true,
  };
}

function pickStrategy(src = {}) {
  const out = {};
  for (const k of STRATEGY_KEYS) {
    if (src[k] !== undefined) out[k] = src[k];
  }
  return out;
}

function pickShared(src = {}) {
  const out = {};
  for (const k of SHARED_KEYS) {
    if (src[k] !== undefined) out[k] = src[k];
  }
  return out;
}

function normalizeSizing(strategy = {}) {
  const next = { ...strategy };
  const minRaw = Number(next.minPositionSize);
  const maxRaw = Number(next.maxPositionSize);
  const hasMin = Number.isFinite(minRaw) && minRaw > 0;
  const hasMax = Number.isFinite(maxRaw) && maxRaw > 0;

  if (hasMin) next.minPositionSize = minRaw;
  if (hasMax) next.maxPositionSize = maxRaw;

  if (hasMin && hasMax && next.maxPositionSize < next.minPositionSize) {
    next.maxPositionSize = next.minPositionSize;
  }
  return next;
}

/**
 * Migrate legacy flat config → dual-profile shape.
 * Flat strategy keys seed the paper profile; live profile strictly preserves
 * conservative safety caps (Items 19 & 28).
 */
export function normalizeConfigStore(raw, defaultsFlat = {}) {
  const base = { ...defaultsFlat, ...(raw || {}) };
  const hasProfiles = raw?.profiles && (raw.profiles.paper || raw.profiles.live);

  const paper = {
    ...defaultPaperStrategy(),
    ...pickStrategy(defaultsFlat),
    ...(hasProfiles ? pickStrategy(raw.profiles.paper || {}) : pickStrategy(base)),
  };
  const live = {
    ...defaultLiveStrategy(),
    ...(hasProfiles ? pickStrategy(raw.profiles.live || {}) : {}),
    // Always keep live gate strict even if migrating from flat paper-ish config
    arbOnlyUntilEdge: hasProfiles
      ? (raw.profiles.live?.arbOnlyUntilEdge !== false)
      : true,
    requireEdgeForLive: true,
    autoApproveLive: hasProfiles ? (raw.profiles.live?.autoApproveLive === true) : false,
  };

  return {
    mode: base.mode === 'live' ? 'live' : 'paper',
    enabled: !!base.enabled,
    paperBankroll: Number(base.paperBankroll ?? base.paperInitialDeposit ?? getDefaultPaperBankroll()),
    paperInitialDeposit: Number(base.paperInitialDeposit ?? getDefaultPaperBankroll()),
    profiles: { paper, live },
    // Carried through load, or this record resets on every restart (D3 · C).
    attribution: normalizeAttribution(raw?.attribution),
  };
}

/** Flat runtime config the bot scan loop expects */
export function resolveActiveConfig(store) {
  const mode = store?.mode === 'live' ? 'live' : 'paper';
  const strat = store?.profiles?.[mode] || (mode === 'live' ? defaultLiveStrategy() : defaultPaperStrategy());
  const defaultBankroll = getDefaultPaperBankroll();
  return {
    ...strat,
    mode,
    enabled: !!store?.enabled,
    paperBankroll: Number(store?.paperBankroll ?? store?.paperInitialDeposit ?? defaultBankroll),
    paperInitialDeposit: Number(store?.paperInitialDeposit ?? defaultBankroll),
  };
}

/**
 * Apply a patch. Strategy keys go into the active (or explicit) profile.
 * Shared keys update the store root.
 */
export function applyConfigPatch(store, patch = {}, opts = {}) {
  const next = {
    mode: store.mode === 'live' ? 'live' : 'paper',
    enabled: !!store.enabled,
    paperBankroll: store.paperBankroll,
    paperInitialDeposit: store.paperInitialDeposit,
    // Preserved, never written here — saveConfig stamps it from the diff.
    attribution: store.attribution,
    profiles: {
      paper: { ...(store.profiles?.paper || defaultPaperStrategy()) },
      live: { ...(store.profiles?.live || defaultLiveStrategy()) },
    },
  };

  const explicitPatchMode = patch.mode === 'live' || patch.mode === 'paper' ? patch.mode : null;
  const targetMode = opts.targetMode || explicitPatchMode || next.mode;

  for (const [k, v] of Object.entries(patch || {})) {
    if (k === 'profiles') continue;
    if (SHARED_KEYS.has(k)) {
      next[k] = v;
      continue;
    }
    if (STRATEGY_KEYS.includes(k)) {
      const m = targetMode || next.mode;
      next.profiles[m][k] = v;
      continue;
    }
    // Unknown keys: stash on active profile so we don't lose LLM knobs
    const m = targetMode || next.mode;
    next.profiles[m][k] = v;
  }

  if (patch.mode === 'live' || patch.mode === 'paper') {
    next.mode = patch.mode;
  }
  if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;

  next.profiles.paper = normalizeSizing(next.profiles.paper);
  next.profiles.live = normalizeSizing(next.profiles.live);

  return next;
}

export function profilesSummary(store) {
  return {
    mode: store?.mode || 'paper',
    paper: pickStrategy(store?.profiles?.paper || {}),
    live: pickStrategy(store?.profiles?.live || {}),
  };
}

/**
 * Declarative validation of strategy configurations (Item 5).
 * Enforces valid combinations and bounds dangerous settings.
 */
export function validateConfig(cfg = {}) {
  const next = { ...cfg };
  // Can't force pure arb while turning off the arb engine
  if (next.forceArbOnly === true && next.clobArbEnabled === false) {
    next.clobArbEnabled = true;
  }
  if (typeof next.entryWindowFrac === 'number') {
    next.entryWindowFrac = Math.max(0.1, Math.min(1.0, next.entryWindowFrac));
  }
  if (typeof next.minArbGap === 'number') {
    next.minArbGap = Math.max(0.003, next.minArbGap);
  }
  if (typeof next.maxArbPerSlug === 'number') {
    // Paper multi-slice walks need >5 packages/slug to drain a thick gap in $10–$20 bites.
    next.maxArbPerSlug = Math.max(1, Math.min(12, Math.round(next.maxArbPerSlug)));
  }
  if (typeof next.arbSliceUsd === 'number') {
    next.arbSliceUsd = Math.max(3, Math.min(Number(next.arbMaxUsd || 100), next.arbSliceUsd));
  }
  return next;
}

/**
 * Continuous live risk cap assertion (D11 Dimension 4 & Item 19/28).
 * Ensures live blast radius does not exceed safety ceilings without explicit authorization.
 */
export function assertLiveSafetyCaps(liveCfg = {}) {
  const violations = [];
  const maxCap = Number(liveCfg.maxPositionCap ?? 1);
  if (maxCap > 50) {
    violations.push(`maxPositionCap $${maxCap} exceeds safety ceiling ($50)`);
  }
  const maxUsd = Number(liveCfg.certaintyMaxUsd ?? 2);
  if (maxUsd > 100) {
    violations.push(`certaintyMaxUsd $${maxUsd} exceeds safety ceiling ($100)`);
  }
  const maxArb = Number(liveCfg.arbMaxUsd ?? 1);
  if (maxArb > 50) {
    violations.push(`arbMaxUsd $${maxArb} exceeds safety ceiling ($50)`);
  }
  const maxOpen = Number(liveCfg.maxOpenPositions ?? 1);
  if (maxOpen > 5) {
    violations.push(`maxOpenPositions ${maxOpen} exceeds safety ceiling (5)`);
  }
  return {
    ok: violations.length === 0,
    violations,
  };
}


