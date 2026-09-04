// @ts-nocheck
/**
 * Depth-aware arb evaluation — walks both ask ladders before locking a package.
 *
 * Finds fee-positive equal-share packages after real ladder slippage on BOTH
 * legs, and supports multi-package slicing by consuming filled ask size from a
 * working depth copy between packages.
 */
import { estimateBuyForShares } from './bookMicrostructure.js';
import { arbBreakEvenGap, takerFeeUsdc } from './fees.js';

function cloneLevels(levels = []) {
  return (levels || []).map((l) => ({
    price: Number(l.price),
    size: Number(l.size),
    value: Number(l.value ?? Number(l.price) * Number(l.size)),
  }));
}

/** Deep-enough copy for multi-package residual walks in one scan. */
export function cloneDepth(depth) {
  if (!depth) return { up: { asks: [], bestAsk: 0 }, down: { asks: [], bestAsk: 0 } };
  const copySide = (side) => {
    if (!side) return { asks: [], bestAsk: 0 };
    const asks = cloneLevels(side.asks);
    return {
      ...side,
      asks,
        bestAsk: asks[0]?.price ?? (Number(side.bestAsk) || 0),
    };
  };
  return {
    up: copySide(depth.up),
    down: copySide(depth.down),
  };
}

/**
 * True when both sides expose a real ask ladder (not a synthetic touch stub).
 */
export function hasRealAskLadders(depth) {
  const upAsks = depth?.up?.asks;
  const downAsks = depth?.down?.asks;
  return Array.isArray(upAsks) && upAsks.length > 0
    && Array.isArray(downAsks) && downAsks.length > 0
    && upAsks.some((l) => Number(l.size) > 0)
    && downAsks.some((l) => Number(l.size) > 0);
}

/**
 * Subtract `shares` from the ask ladder (best levels first). Mutates `side`.
 */
export function consumeAskShares(side, shares) {
  let left = Number(shares) || 0;
  if (!(left > 0) || !side?.asks?.length) return 0;
  const next = [];
  let taken = 0;
  for (const level of side.asks) {
    if (left <= 1e-9) {
      next.push(level);
      continue;
    }
    const avail = Number(level.size) || 0;
    if (avail <= 1e-9) continue;
    const use = Math.min(avail, left);
    taken += use;
    left -= use;
    const rem = avail - use;
    if (rem > 1e-9) {
      next.push({
        price: level.price,
        size: rem,
        value: level.price * rem,
      });
    }
  }
  side.asks = next;
  side.bestAsk = next[0]?.price ?? side.bestAsk ?? 0;
  side.askCount = next.length;
  return taken;
}

function touchAsks(side, touchPrice, { allowSynthetic = false } = {}) {
  const asks = side?.asks || [];
  if (asks.length) return asks;
  if (!allowSynthetic) return [];
  const p = Number(touchPrice);
  if (!(p > 0)) return [];
  return [{ price: p, size: 1e9, value: p * 1e9 }];
}

/**
 * Fee-positive equal-share arb the visible books can support.
 *
 * @param {object} opts
 * @param {number} [opts.maxBudgetUsd]  hard cap on total package notional
 * @param {number} [opts.targetBudgetUsd] preferred package size (default = max)
 * @param {boolean} [opts.requireRealLadder=true] refuse synthetic infinite touch
 * @param {number} [opts.minPackageUsd=0] skip if best fee-positive size is below floor
 */
export function evaluateArbOpportunity({
  depth,
  prices = {},
  maxBudgetUsd = 100,
  targetBudgetUsd = null,
  feeParams = 'crypto',
  marginPct = 0.005,
  minGap = 0.008,
  minShares = 0.5,
  requireRealLadder = true,
  minPackageUsd = 0,
} = {}) {
  const touchUp = Number(depth?.up?.bestAsk || prices?.up || 0);
  const touchDown = Number(depth?.down?.bestAsk || prices?.down || 0);
  if (!(touchUp > 0.01 && touchDown > 0.01 && touchUp < 0.99 && touchDown < 0.99)) return null;

  if (requireRealLadder && !hasRealAskLadders(depth)) return null;

  const upAsks = touchAsks(depth?.up, touchUp, { allowSynthetic: !requireRealLadder });
  const downAsks = touchAsks(depth?.down, touchDown, { allowSynthetic: !requireRealLadder });
  if (!upAsks.length || !downAsks.length) return null;

  const sumTouch = touchUp + touchDown;
  const touchGap = 1 - sumTouch;

  const maxUpSh = upAsks.reduce((s, l) => s + (Number(l.size) || 0), 0);
  const maxDownSh = downAsks.reduce((s, l) => s + (Number(l.size) || 0), 0);
  const maxByBook = Math.min(maxUpSh, maxDownSh);

  const hardCap = Number(maxBudgetUsd) || 0;
  const prefer = Number(targetBudgetUsd ?? hardCap) || hardCap;
  const budget = Math.min(hardCap, prefer);
  if (!(budget > 0) || !(sumTouch > 0)) return null;

  const maxByBudget = budget / sumTouch;
  let shares = Math.min(maxByBook, maxByBudget);
  if (!(shares >= minShares)) return null;

  let best = null;
  for (let i = 0; i < 12 && shares >= minShares; i++) {
    const up = estimateBuyForShares(upAsks, shares);
    const down = estimateBuyForShares(downAsks, shares);
    if (!up || !down || up.exhausted || down.exhausted) {
      shares *= 0.75;
      continue;
    }

    const upAsk = up.avgPrice;
    const downAsk = down.avgPrice;
    const sum = upAsk + downAsk;
    const gap = 1 - sum;
    const breakEvenGap = arbBreakEvenGap(upAsk, downAsk, feeParams);
    const requiredGap = breakEvenGap + Number(marginPct || 0);

    if (gap > requiredGap && gap >= Number(minGap)) {
      const totalCost = up.spent + down.spent;
      const feesEstUsd = takerFeeUsdc(shares, upAsk, feeParams) + takerFeeUsdc(shares, downAsk, feeParams);
      const expectedPayout = shares;
      const lockedProfitUsd = expectedPayout - totalCost - feesEstUsd;
      if (lockedProfitUsd > 0) {
        if (Number(minPackageUsd) > 0 && totalCost + 1e-9 < Number(minPackageUsd)) {
          return null;
        }
        best = {
          shares,
          upAsk,
          downAsk,
          touchUp,
          touchDown,
          touchGap,
          gap,
          breakEvenGap,
          requiredGap,
          totalCost,
          feesEstUsd,
          lockedProfitUsd,
          lockedProfitPct: totalCost > 0 ? (lockedProfitUsd / totalCost) * 100 : 0,
          upSlippagePct: up.slippagePct,
          downSlippagePct: down.slippagePct,
          depthLimited: shares < maxByBudget * 0.99,
        };
        break;
      }
    }
    shares *= 0.82;
  }

  return best;
}

/**
 * Apply a locked opportunity's share take to a working depth copy.
 */
export function consumeOpportunityDepth(depth, opp) {
  if (!depth || !opp?.shares) return depth;
  consumeAskShares(depth.up, opp.shares);
  consumeAskShares(depth.down, opp.shares);
  return depth;
}

/**
 * Quick touch-only check for UI badges (may overstate edge vs ladder walk).
 */
export function touchArbGap(depth, prices = {}) {
  const upAsk = Number(depth?.up?.bestAsk || prices?.up || 0);
  const downAsk = Number(depth?.down?.bestAsk || prices?.down || 0);
  if (!(upAsk > 0 && downAsk > 0)) return null;
  const sum = upAsk + downAsk;
  return {
    upAsk,
    downAsk,
    sum: Math.round(sum * 1000) / 1000,
    gap: Math.round((1 - sum) * 1000) / 1000,
    edgePct: Math.round((1 - sum) * 1000) / 10,
  };
}
