// @ts-nocheck
/**
 * Directional engine — the gate and the sizing for signal-driven trades.
 *
 * D1 splits the two strategies at the *decision* layer: this module owns whether
 * a directional trade is taken and how large it is. The arb engine
 * (`arbEngine.ts`) owns its own equivalents. They share market discovery, order
 * execution, the cash ledger and persistence, and nothing else.
 *
 * **Both exports are pure functions.** They read no module state, no clock and
 * no store — same inputs, same answer, every time. That is the property that
 * makes them testable against fixtures rather than against whatever happens to
 * be in `data/` (slice 0's first convention), and it is why `buildDecision`
 * takes a `portfolio` argument instead of reaching into `botState`: the three
 * facts it needs about the book are supplied by the caller, which owns that
 * state.
 *
 * Extracted verbatim from `bot.ts` in slice 1. The scoring weights, thresholds
 * and reason strings are unchanged — that commit was deliberately
 * behaviour-neutral, so a regression in the paper run could only be an
 * extraction bug.
 */
import {
  computeKellySize,
  computeCertaintyKelly,
  resolveDynamicLimits,
} from '../kelly.js';
import {
  heuristicForTrade,
  resolveEntryWindows,
} from '../heuristics/fundHeuristics.js';
import { dataAssuranceBuyBlockReason } from '../dataAssurance.js';
import { CONF_GATE } from '../confidenceScale.js';
import { clampConfidence } from '../confidenceScale.js';
import { strikeEdge } from '../strikeForecast.js';
import { readBook, bookQuality, estimateBuyCost } from '../bookMicrostructure.js';
import { vetoForOutcome } from '../targetContext.js';
import { sessionTA } from '../sessionTA.js';
import { POLY_MIN_ORDER_USD, POLY_WINDOW_SECONDS } from '../config.js';

/**
 * Dynamic entry price — computes required edge on the fly instead of a fixed band.
 * Hard min/max (0.05/0.95) are absolute floor/ceiling. Everything else is:
 *   netEdge = modelProb - price - fees
 *   required = base (1.5c) + timePressure + volPenalty - confidenceDiscount
 */
function dynamicEntryPrice({ price, forecast, signal, remaining, bookMeta, cfg, windowSec, outcome }) {
  const p = Number(price);
  if (!(p > 0) || !(p < 1) || !forecast?.probUp) return { eligible: true, reason: 'no forecast' };
  const side = outcome || (signal?.direction === 'down' ? 'down' : 'up');
  const edgeInfo = strikeEdge({ probUp: forecast.probUp, price: p, outcome: side, feeRate: Number(cfg.feeRate ?? 0.07), exitIsSettlement: cfg.holdToSettleFavorites !== false });
  if (!edgeInfo) return { eligible: true };
  const netEdge = Number(edgeInfo.netEdge || 0);
  const z = Math.abs(Number(forecast.z || 0));
  const rem = Number(remaining || 0);
  const win = Number(windowSec || 300);
  const frac = win > 0 ? rem / win : 1;
  // Base required edge: 1.2c in mid window, 2.5c near expiry (time pressure), -1c discount for high conf
  const conf = Number(signal?.confidence || 0.2);
  const base = 0.012;
  const timeAdd = (1 - frac) * 0.018; // +0 to 1.8c near expiry
  const volAdd = z > 1.0 ? 0.008 : 0; // decisive geometry needs more edge (noise)
  const confDiscount = Math.max(0, (conf - 0.22) * 0.04); // high conf reduces required by up to ~1.7c
  const required = base + timeAdd + volAdd - confDiscount;
  // Liquidity add: wide spread needs more edge
  const spreadPct = Number(bookMeta?.spreadPct || 0);
  const spreadAdd = spreadPct > 2 ? 0.01 : 0;
  const need = required + spreadAdd;
  if (netEdge < need) {
    return { eligible: false, reason: `need ${(need*100).toFixed(1)}c edge have ${(netEdge*100).toFixed(1)}c (z=${Number(forecast.z).toFixed(2)} rem=${rem}s)` };
  }
  // Also veto if price is too rich for underdog without forecast edge — dynamic ceiling
  if (p > 0.72 && netEdge < 0.025 && conf < 0.35) {
    return { eligible: false, reason: `fav $${p.toFixed(2)} needs 2.5c edge have ${(netEdge*100).toFixed(1)}c` };
  }
  return { eligible: true, edgeNote: `dyn edge ${(netEdge*100).toFixed(1)}c >= ${(need*100).toFixed(1)}c need`, netEdge, required: need };
}

/**
 * Soft tilt against a chronically one-sided book.
 *
 * Takes the side mix as an argument rather than computing it, because deriving
 * it means reading open positions and recent trades — state this module
 * deliberately does not own.
 */
export function sideBalanceBonus(outcome, cfg, stats) {
  if (cfg.sideBalanceEnabled === false) return { bonus: 0, note: null };
  const weight = Number(cfg.sideBalanceWeight ?? 12);
  const { up = 0, down = 0, total = 0, upShare = 0.5 } = stats || {};
  if (total < 5) return { bonus: 0, note: null, up, down, upShare };

  // Soft tilt only — never hard-force a side (FORCE DOWN caused live SL massacre)
  if (outcome === 'down' && upShare > 0.62) {
    return { bonus: weight * (upShare - 0.5) * 1.6, note: `soft-balance DOWN (+${((upShare - 0.5) * 100).toFixed(0)}% UP skew)`, up, down, upShare };
  }
  if (outcome === 'up' && upShare < 0.38) {
    return { bonus: weight * (0.5 - upShare) * 1.6, note: `soft-balance UP`, up, down, upShare };
  }
  if (outcome === 'up' && upShare > 0.70) {
    return { bonus: -weight * (upShare - 0.5) * 1.2, note: `UP overtraded soft`, up, down, upShare };
  }
  if (outcome === 'down' && (1 - upShare) > 0.70) {
    return { bonus: -weight * ((1 - upShare) - 0.5) * 1.2, note: `DOWN overtraded soft`, up, down, upShare };
  }
  return { bonus: 0, note: null, up, down, upShare };
}

/**
 * How much to stake on a directional entry.
 *
 * Already pure before the extraction — every input it reads (`cfg`, `readiness`,
 * `stats`) was passed in. Moved unchanged.
 */
export function resolveOrderSize(cfg, { price, signal, readiness, stats, remaining, windowSec, duration, symbol }) {
  const paperBankroll = Number(cfg.paperBankroll ?? cfg.paperInitialDeposit ?? 100);
  const liveBankroll = readiness?.spendableBalance ?? readiness?.clobBalance ?? 0;
  // Never pretend cash is $100 when paper ledger is empty/negative — that over-bought to -cash
  if (cfg.mode === 'paper' && !(paperBankroll > 0.05)) {
    return { sizeUsd: 0, kelly: null, limits: resolveDynamicLimits(cfg, 0), reason: 'no_paper_cash' };
  }
  const bankroll = cfg.mode === 'paper' ? paperBankroll : liveBankroll;
  if (!(bankroll > 0)) {
    return { sizeUsd: 0, kelly: null, limits: resolveDynamicLimits(cfg, 0), reason: 'no_bankroll' };
  }

  // Offline-trained duration/conf/price heuristics (when available)
  const heur = heuristicForTrade({
    duration: duration || (windowSec >= 3600 ? '1h' : windowSec >= 1800 ? '30m' : windowSec >= 900 ? '15m' : '5m'),
    confidence: signal?.confidence,
    entryPrice: price,
    symbol: symbol || signal?.asset,
  });
  const kellyFraction = Number(
    heur?.kellyFraction ?? cfg.kellyFraction ?? 0.50,
  );
  const maxPositionPct = Number(
    heur?.maxPositionPct ?? cfg.maxPositionPct ?? 0.10,
  );

  const limits = resolveDynamicLimits(cfg, bankroll);
  const { minUsd, maxUsd } = limits;
  const cashFrac = Math.min(0.95, Math.max(0.01, maxPositionPct));
  const hardCap = cfg.mode === 'paper'
    ? Math.min(maxUsd, Math.max(0, paperBankroll * cashFrac))
    : maxUsd;

  if (!cfg.useKellySizing) {
    return {
      sizeUsd: Math.min(hardCap, maxUsd),
      kelly: null,
      limits,
      heuristic: heur?.source || null,
    };
  }

  const kelly = computeKellySize({
    bankroll: limits.spendable || bankroll,
    price,
    signalConfidence: signal?.confidence ?? 0.35,
    historicalWinRate: stats?.totalTrades > 0 ? stats.wins / stats.totalTrades : null,
    tradeCount: stats?.totalTrades ?? 0,
    minUsd,
    maxUsd: hardCap,
    kellyFraction,
    maxPositionPct,
  });

  let sizeUsd = kelly.sizeUsd;
  if (cfg.useAggressiveScaling && sizeUsd > 0) {
    const mul = Number(cfg.aggScaleMultiplier ?? 1.0);
    sizeUsd = Math.min(sizeUsd * mul, hardCap);
  }
  sizeUsd = Math.min(sizeUsd, hardCap);

  // Certainty-aware upsizing: near-guaranteed favorites late in the window earn a
  // bigger stake than flat historical Kelly allows. This runs its own, higher cap
  // (certaintyMaxPct of bankroll) so a "10% away, 20s left" entry can be $10–30 on
  // a $100 book instead of a $2 token bet — while ordinary trades stay conservative.
  let certainty = null;
  if (cfg.certaintySizing !== false && remaining != null) {
    const certMaxPct = Number(cfg.certaintyMaxPct ?? 0.35);
    const certCap = Math.min(
      Math.max(maxUsd, bankroll * certMaxPct),
      Number(cfg.certaintyMaxUsd ?? 40),
      cfg.mode === 'paper' ? paperBankroll * cashFrac : bankroll,
    );
    certainty = computeCertaintyKelly({
      price,
      confidence: signal?.confidence,
      remaining,
      windowSec: Number(windowSec) || POLY_WINDOW_SECONDS,
      bankroll: limits.spendable || bankroll,
      kellyFraction,
      minUsd,
      maxUsd: certCap,
      maxPct: certMaxPct,
    });
    if (certainty && certainty.sizeUsd > sizeUsd) {
      sizeUsd = Math.min(certainty.sizeUsd, certCap);
    }
  }

  // Paper directional recovery: if historical Kelly is negative, still allow tiny probes
  // (live stays blocked by edge gate / zero size)
  if ((!sizeUsd || sizeUsd <= 0) && cfg.mode === 'paper' && cfg.arbOnlyUntilEdge === false && hardCap >= minUsd) {
    const conf = clampConfidence(Number(signal?.confidence || 0.35));
    sizeUsd = Math.round(Math.max(minUsd, Math.min(hardCap, 1.2 + conf * 2.5)) * 100) / 100;
    return {
      sizeUsd,
      kelly: { ...(kelly || {}), limits, method: 'paper_probe' },
      limits,
      reason: 'paper_probe',
    };
  }

  if (!sizeUsd || sizeUsd <= 0) {
    return { sizeUsd: 0, kelly: { ...kelly, limits }, limits, reason: kelly?.method || 'zero_size' };
  }

  const usedCertainty = certainty && Math.abs(sizeUsd - certainty.sizeUsd) < 0.005;
  return {
    sizeUsd,
    kelly: {
      ...kelly,
      ...(usedCertainty ? { method: 'certainty_kelly' } : {}),
      certainty: certainty || null,
      limits,
      heuristic: heur?.source || null,
    },
    limits,
    heuristic: heur,
  };
}

/**
 * Score one side of one market, and say whether it is tradable.
 *
 * `portfolio` carries the three facts about current holdings this decision
 * depends on. Supplying them rather than reading them is what keeps this
 * function pure:
 *
 *   hasOpenOnSlug   bool    already at the per-slug concurrency cap
 *   sideBalance     { up, down, total, upShare }   recent UP/DOWN mix
 *   dataAssurance   { canBuy, note, ... } | null   feed-health gate
 *
 * Absent, the gate degrades open: an omitted `portfolio` means "nothing open,
 * balanced book, no assurance signal", which is the same answer `botState` gives
 * on a cold start.
 */
export function buildDecision({
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
  portfolio = null,
  forecast = null,
}) {
  const hasOpenOnSlug = portfolio?.hasOpenOnSlug === true;
  const sideBalance = portfolio?.sideBalance || null;
  const dataAssurance = portfolio?.dataAssurance || null;

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

  // Hard absolute bounds only — dynamic entry governs the real gate
  const hardMin = Number(cfg.hardMinPrice ?? cfg.minPrice ?? 0.05);
  const hardMax = Number(cfg.hardMaxPrice ?? cfg.maxPrice ?? 0.95);
  if (eligible && price < hardMin) {
    eligible = false;
    reasons.push(`below hard min $${hardMin.toFixed(2)}`);
  }
  if (eligible && price > hardMax) {
    eligible = false;
    reasons.push(`above hard max $${hardMax.toFixed(2)}`);
  }
  // Dynamic price — edge + time pressure (book check later after bookMeta is built)
  if (eligible && cfg.dynamicEntry !== false && forecast && signal) {
    const dyn = dynamicEntryPrice({ price, forecast, signal, remaining, bookMeta: null, cfg, windowSec: market?.windowSeconds, outcome });
    if (!dyn.eligible) {
      eligible = false;
      reasons.push(`dynamic price block — ${dyn.reason}`);
    } else if (dyn.edgeNote) {
      reasons.push(dyn.edgeNote);
    }
  } else if (eligible && cfg.dynamicEntry !== false && !forecast) {
    // No forecast = no dynamic price — fall back to soft band but wider
    const softMin = Number(cfg.minPrice ?? 0.12);
    const softMax = Number(cfg.maxPrice ?? 0.88);
    if (price < softMin || price > softMax) {
      // don't hard block without forecast, just score penalty
      score -= 6;
      reasons.push(`soft band $${softMin.toFixed(2)}-$${softMax.toFixed(2)} no forecast`);
    }
  }

  const entryWin = resolveEntryWindows(market?.duration || '5m', cfg);
  if (eligible && remaining < entryWin.minRemainingSec) {
    eligible = false;
    reasons.push(`${remaining}s left < ${entryWin.minRemainingSec}s min (${entryWin.duration})`);
  }

  // Hard stop on expired / resolved windows (slug clock can lag a few seconds)
  if (eligible && remaining <= 0) {
    eligible = false;
    reasons.push('window expired');
  }

  if (
    eligible
    && cfg.requireDataAssurance !== false
    && dataAssurance
    && !dataAssurance.canBuy
  ) {
    eligible = false;
    reasons.push(dataAssuranceBuyBlockReason(dataAssurance) || 'data assurance blocked');
  }

  const maxEntry = entryWin.maxEntryRemainingSec ?? cfg.maxEntryRemainingSec ?? 298;
  if (eligible && remaining > maxEntry) {
    eligible = false;
    reasons.push(`${remaining}s left > ${maxEntry}s entry window (${entryWin.duration})`);
  }

  if (eligible && remaining >= 180) {
    const earlyBoost = Math.min(18, ((remaining - 180) / 120) * 18);
    score += earlyBoost;
    reasons.push(`early entry +${earlyBoost.toFixed(0)} (${remaining}s left)`);
  } else if (eligible && remaining >= 120) {
    score += 6;
    reasons.push(`mid-early ${remaining}s`);
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

  if (eligible && hasOpenOnSlug) {
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

    if (arbGap != null && arbGap > 0.01) {
      score += arbGap * 160;
      reasons.push(`arb gap +${(arbGap * 100).toFixed(1)}c`);
    }
    // Absolute cents also matter — mid-% can look fine while book is untradeable
    const spreadCents = side?.bestBid > 0 && side?.bestAsk > 0
      ? (side.bestAsk - side.bestBid) * 100
      : null;
    if (spreadPct != null && spreadPct < 0.8) {
      score += 12;
      reasons.push(`ultra-tight spread ${spreadPct.toFixed(2)}%`);
    } else if (spreadPct != null && spreadPct < 1.5) {
      score += 7;
      reasons.push(`tight spread ${spreadPct.toFixed(2)}%`);
    } else if (spreadPct != null && spreadPct > 3) {
      score -= 14;
      reasons.push(`wide spread ${spreadPct.toFixed(2)}%`);
      const blockPct = cfg.mode === 'paper' ? 12 : 6;
      if (spreadPct > blockPct && cfg.requireTightSpread !== false) {
        eligible = false;
        reasons.push('spread too wide — blocked');
      }
    }
    if (spreadCents != null && spreadCents > 8 && cfg.requireTightSpread !== false && cfg.mode !== 'paper') {
      eligible = false;
      reasons.push(`spread ${spreadCents.toFixed(1)}c too wide`);
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

  /**
   * Strike forecast — the only input here that is denominated in the same units
   * as the price it is being compared against.
   *
   * Every other term in this function is an unscaled score contribution whose
   * magnitude was hand-tuned (`+18` for early entry, `-22` for a counter
   * signal). This one is a probability, so `netEdge` is a direct answer to
   * "is this contract cheap", already net of fees. That makes it both the
   * highest-weight positive term and, more importantly, a veto: the measured
   * loss pattern was not failing to find winners, it was buying the side the
   * geometry already ruled out. A window whose spot sits a full sigma below its
   * strike with 90 seconds left is not a 50/50 that RSI can rescue.
   */
  let forecastMeta = null;
  if (cfg.useStrikeForecast !== false && forecast?.probUp != null) {
    const edgeInfo = strikeEdge({
      probUp: forecast.probUp,
      price,
      outcome,
      feeRate: Number(cfg.feeRate ?? 0.07),
      // Directional entries in these windows are held to settlement by default,
      // which pays no taker fee on the way out.
      exitIsSettlement: cfg.holdToSettleFavorites !== false,
    });

    if (edgeInfo) {
      forecastMeta = {
        probUp: forecast.probUp,
        modelProb: edgeInfo.modelProb,
        marketProb: edgeInfo.marketProb,
        netEdge: edgeInfo.netEdge,
        grossEdge: edgeInfo.grossEdge,
        feeFrac: edgeInfo.feeFrac,
        z: forecast.z,
        sigmaTau: forecast.sigmaTau,
        implausible: edgeInfo.implausible,
      };
    }

    /**
     * An implausible edge means our spot disagrees with the resolution feed, so
     * the forecast contributes nothing in either direction. Scoring it would buy
     * the wrong side on feed skew; vetoing on it would block the right side for
     * the same reason. Silence is the only safe response.
     */
    if (edgeInfo?.implausible) {
      reasons.push(
        `forecast ignored — ${(edgeInfo.grossEdge * 100).toFixed(0)}c vs market implies a spot-feed gap`,
      );
    } else if (edgeInfo) {
      const { netEdge } = edgeInfo;
      // |z| says how decisive the geometry is. A big edge computed from a
      // near-coin-flip is mostly vol-estimate error, so discount it.
      const decisiveness = Math.min(1, Math.abs(Number(forecast.z) || 0) / 1.5);
      const vetoEdge = -Number(cfg.strikeForecastVetoEdge ?? 0.04);

      if (netEdge <= vetoEdge && cfg.strikeForecastVeto !== false) {
        eligible = false;
        reasons.push(
          `forecast ${(edgeInfo.modelProb * 100).toFixed(0)}% vs ask ${(price * 100).toFixed(0)}c `
          + `— ${(netEdge * 100).toFixed(1)}c edge (z=${Number(forecast.z).toFixed(2)})`,
        );
      } else if (netEdge > 0) {
        // 120 puts a 5c net edge at +6 before decisiveness, comparable to the
        // strongest existing term. The plausibility bound caps this near +18,
        // which is deliberate: this term should be able to lead a decision, not
        // single-handedly decide one.
        const add = netEdge * 120 * (0.4 + 0.6 * decisiveness);
        score += add;
        reasons.push(
          `forecast edge +${(netEdge * 100).toFixed(1)}c `
          + `(model ${(edgeInfo.modelProb * 100).toFixed(0)}% vs ${(price * 100).toFixed(0)}c, z=${Number(forecast.z).toFixed(2)})`,
        );
      } else {
        score -= Math.abs(netEdge) * 60 * decisiveness;
        reasons.push(`forecast thin ${(netEdge * 100).toFixed(1)}c`);
      }
    }
  }

  /**
   * Depth-weighted book read, in addition to the top-of-book `imbalance` above.
   *
   * `readBook` returns its own confidence as `weight`, so a thin or wide book
   * contributes proportionally rather than being gated in or out — the ladder
   * was previously computed on every scan and discarded entirely.
   */
  let microMeta = null;
  if (cfg.useBookMicrostructure !== false && depth?.[outcome]) {
    const read = readBook(depth[outcome]);
    if (read && read.weight > 0) {
      microMeta = {
        vote: read.vote,
        weight: read.weight,
        weightedImbalance: read.weightedImbalance,
        microTilt: read.microTilt,
        levels: read.levels,
      };
      // `vote` is pressure toward this token settling YES, so it already points
      // the same way as `outcome` — no sign flip needed.
      const contribution = read.vote * read.weight * 20;
      score += contribution;
      if (Math.abs(contribution) > 1.5) {
        reasons.push(
          `book ${contribution > 0 ? 'supports' : 'opposes'} `
          + `${(read.weightedImbalance * 100).toFixed(0)}% imb, q=${read.weight.toFixed(2)}`,
        );
      }
    }
  }

  if (cfg.useSignals) {
    if (!signal) {
      eligible = false;
      reasons.push('signal unavailable');
    } else if (signal.tooVolatile || signal.skipTrade) {
      eligible = false;
      reasons.push(`volatility high (${signal.volatility?.atrPct?.toFixed?.(2) || 'n/a'}% ATR)`);
    } else if (signal.direction === 'neutral') {
      // Neutral: still allow book/arb-driven trades on either side
      const edge = Math.max(0, 0.55 - price);
      score += edge * 35;
      reasons.push('signal neutral — book/arb may lead');
      if (edge < 0.02 && !(bookMeta?.arbGap > 0.012)) {
        eligible = false;
        reasons.push('neutral + no edge');
      }
    } else {
      const expectedDirection = outcome === 'up' ? 'up' : 'down';
      const agrees = signal.direction === expectedDirection;
      const edge = Math.max(0, 0.55 - price);
      const skewSoft = cfg.sideBalanceEnabled !== false && Number(sideBalance?.upShare ?? 0.5) >= 0.68;
      if (!agrees) {
        // Soft mismatch ONLY — never hard-lock; explore lightly when skewed
        const arbRescue = bookMeta?.arbGap != null && bookMeta.arbGap >= Number(cfg.minArbGap ?? 0.015);
        const explore = (cfg.arbExploreRate > 0 && Math.random() < Number(cfg.arbExploreRate));
        score -= 22;
        reasons.push(`signal says ${signal.direction.toUpperCase()} (counter)`);
        if (arbRescue) {
          score += bookMeta.arbGap * 200;
          reasons.push('arb overrides mismatch');
        } else if (explore || skewSoft) {
          score += skewSoft ? 8 : 6;
          reasons.push(skewSoft ? 'soft skew explore' : 'explore opposite side');
        }
        // A counter entry is the cheap half of a near-even binary *by
        // construction*: when the signal reads DOWN, the UP side is always the
        // cheaper of the two. Gating it on price alone therefore lets a
        // confident signal be faded on essentially every scan, and the wider
        // `underdogMaxPrice` gets, the more completely the bot trades against
        // itself. Measured 2026-08-30 with underdogMaxPrice 0.52: 8 of 9 live
        // paper entries bought UP while BTC and ETH both read DOWN at ~0.72
        // confidence, and all nine closed at a loss.
        //
        // So a counter entry needs a real book reason (arb), or a genuine
        // long-shot price *and* a signal weak enough to be worth doubting.
        // A book gap justifies the *arb* engine buying both legs for a hedged
        // pair; it is not a reason to take a naked directional bet against our
        // own signal, so it cannot rescue a confident counter here.
        const counterConfCap = Number(cfg.counterMaxConfidence ?? CONF_GATE.LOOSE);
        const tooSureToFade = Number(signal.confidence || 0) >= counterConfCap;
        const underdogPrice = price > 0 && price <= Number(cfg.underdogMaxPrice ?? 0.42);
        if (tooSureToFade) {
          eligible = false;
          reasons.push(
            `counter blocked — signal ${(signal.confidence * 100).toFixed(0)}% ≥ ${(counterConfCap * 100).toFixed(0)}% confident`,
          );
        } else if (!arbRescue && !underdogPrice) {
          eligible = false;
          reasons.push('counter needs arb or underdog price');
        }
      } else if (signal.confidence < entryWin.minConfidence) {
        // The `&& !skewSoft` that used to be here waived the confidence floor
        // whenever the recent book was one-sided (`upShare >= 0.68`). Because
        // the signal pipeline was itself pinned to UP, that condition was
        // permanently true and the floor was therefore never enforced on an
        // agreeing entry — measured: `minConfidence` admitted 75.8% of
        // directional signals.
        //
        // Side balance and signal quality are separate concerns. Wanting more
        // DOWN entries is not a reason to accept a weak DOWN read; that is what
        // the `sideBalanceBonus` score tilt further down is for.
        eligible = false;
        reasons.push(
          `confidence ${(signal.confidence * 100).toFixed(0)}% < ${(entryWin.minConfidence * 100).toFixed(0)}% (${entryWin.source})`,
        );
      } else if (Number(cfg.maxConfidence ?? 0) > 0 && signal.confidence > Number(cfg.maxConfidence)) {
        eligible = false;
        reasons.push(
          `confidence ${(signal.confidence * 100).toFixed(0)}% > ${(Number(cfg.maxConfidence) * 100).toFixed(0)}% cap`,
        );
      } else {
        // Cap signal score contribution so soft balance can still nudge
        const confCap = clampConfidence(signal.confidence);
        score += (confCap * 40) + (edge * 45) + Math.min(Number(signal.score || 0), 6);
        reasons.push(`signal ${signal.direction.toUpperCase()} ${(confCap * 100).toFixed(0)}%`);
        if (edge > 0) reasons.push(`price edge +${(edge * 100).toFixed(1)}c`);
        if (price > 0 && price <= Number(cfg.underdogMaxPrice ?? 0.42)) {
          score += 12;
          reasons.push('underdog hold-to-settle candidate');
        }
        if (signal.confidenceBiasUsed && signal.confidenceBias?.traceAgree === true) {
          score += 3;
          reasons.push('ML short-trace agrees');
        } else if (signal.confidenceBias?.traceAgree === false) {
          score -= 8;
          reasons.push('ML short-trace disagrees');
        }
      }
    }
  } else {
    score += Math.max(0, 0.55 - price) * 40;
    reasons.push('signals disabled');
  }

  // Deterministic short-session TA horizon scaling (tau-aware)
  if (cfg.useSessionTA !== false && remaining != null && signal) {
    const winSec = Number(market?.windowSeconds || POLY_WINDOW_SECONDS);
    const sess = sessionTA({ signal, remaining, windowSec: winSec });
    if (sess.veto) {
      eligible = false;
      reasons.push(`sessionTA veto — ${sess.reasons.join(', ')}`);
    } else {
      score += sess.scoreAdj;
      if (sess.reasons.length) reasons.push(`sessionTA ${sess.scoreAdj>0?'+':''}${sess.scoreAdj} (${sess.reasons.join('; ')})`);
    }
  }

  // Hard orderbook probing — depth + slippage gate (not just score)
  if (eligible && depth?.[outcome] && cfg.requireTightSpread !== false) {
    const q = bookQuality(depth[outcome]);
    if (q < Number(cfg.bookQualityMin ?? 0.18) && !(bookMeta?.arbGap > 0.012)) {
      eligible = false;
      reasons.push(`book thin q=${q.toFixed(2)} < ${(cfg.bookQualityMin??0.18).toFixed(2)}`);
    } else {
      // Estimate actual fill for this ticket size
      const needUsd = Math.max(5, Number(cfg.minPositionSize ?? 5));
      const cost = estimateBuyCost(depth[outcome].asks || [], needUsd);
      if (cost && (cost.exhausted || cost.slippagePct > Number(cfg.liquiditySlippageMaxPct ?? 1.5))) {
        eligible = false;
        reasons.push(`liq fail fill ${(cost.fillRatio*100).toFixed(0)}% slip ${cost.slippagePct.toFixed(2)}%`);
      }
    }
  }

  // Target-context veto — strike unreachable or implausible feed gap
  // `forecast` here is the precomputed probUp; if not supplied we can't veto
  if (eligible && cfg.useStrikeForecast !== false && forecast?.probUp != null) {
    // also handle the targetContext path when caller supplied full market object
    const targetV = vetoForOutcome({ fc: forecast, z: forecast.z, remaining, spot: signal?.price }, price, outcome, cfg);
    if (targetV.veto && targetV.implausible) {
      // implausible was already silenced above; keep silent
    } else if (targetV.veto) {
      eligible = false;
      reasons.push(`target veto — ${targetV.reason}`);
    }
    // also veto extreme time pressure with no edge
    if (eligible && remaining < 50 && forecastMeta && Math.abs(Number(forecastMeta.z||0)) > 1.2 && forecastMeta.netEdge < -0.02) {
      eligible = false;
      reasons.push(`target unreachable z=${Number(forecastMeta.z).toFixed(2)} in ${remaining}s`);
    }
  }

  // Neutral signals must NOT trade directionally — only arb may rescue
  // Previously this branch scored +edge*35 and traded on noise; now hard block
  // This is re-enforced here in case earlier neutral handling slipped through
  if (eligible && cfg.useSignals && signal && signal.direction === 'neutral') {
    // already handled above, but double-guard: need forecast edge or arb gap
    const needArb = Number(cfg.minArbGap ?? 0.012);
    if (!(bookMeta?.arbGap > needArb) && !(forecastMeta && forecastMeta.netEdge > 0.02)) {
      eligible = false;
      reasons.push('neutral blocked — need arb gap or forecast edge');
    }
  }

  // Break chronic single-side bias
  const bal = sideBalanceBonus(outcome, cfg, sideBalance);
  if (bal.bonus) {
    score += bal.bonus;
    if (bal.note) reasons.push(bal.note);
  }

  if (eligible) reasons.push('tradable now');

  return {
    outcome,
    price,
    eligible,
    score,
    reasons,
    book: bookMeta,
    forecast: forecastMeta,
    micro: microMeta,
  };
}
