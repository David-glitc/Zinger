// @ts-nocheck
import { savePackage, loadPackages, getActivePackages, resetPackages } from './arbPersistence.js';
import {
  closeProceedsWithFee,
  arbBreakEvenGap,
  peekClobFeeParams,
  takerFeeUsdc,
} from './fees.js';
import { executeCtfMerge } from './ctf/merge.js';
import { emitEvent } from './telemetry/events.js';
import {
  evaluateArbOpportunity,
  cloneDepth,
  consumeOpportunityDepth,
  hasRealAskLadders,
} from './arbDepth.js';
import {
  evaluateArbSurfaces,
  evaluateReverseBidOpportunity,
} from './arbSurfaces.js';
import { resolveArbGates } from './arbGates.js';
import type { ArbPackage } from './arbPersistence.js';

export type { ArbPackage };
export { getActivePackages, loadPackages, resetPackages };
export { evaluateArbSurfaces, evaluateReverseBidOpportunity, resolveArbGates };

/**
 * True when both legs are complementary outcomes of one binary condition, so
 * holding the pair to settlement redeems exactly $1.00.
 */
export function isComplementaryBinary(market): boolean {
  if (!market?.conditionId) return false;
  if (!Array.isArray(market.outcomes) || market.outcomes.length !== 2) return false;
  const up = market.tokenIds?.up;
  const down = market.tokenIds?.down;
  return Boolean(up && down && up !== down);
}

function resolveShareBudget(cfg, mode, readiness) {
  const arbBank = mode === 'paper'
    ? Number(cfg.paperInitialDeposit || cfg.paperBankroll || 0)
    : Number(readiness?.spendableBalance ?? readiness?.clobBalance ?? 0);

  const baseArbCap = Number(cfg.arbMaxUsd ?? 100);
  const baseFrac = Number(cfg.arbBankrollFrac ?? 0.20);
  let arbIsGuaranteed = false;
  try {
    const allPkgs = loadPackages().filter((p) => p.mode === mode);
    const settled = allPkgs.filter((p) => p.status === 'SETTLED' || p.status === 'MERGED');
    if (settled.length >= 5) {
      const wins = settled.filter((p) => Number(p.lockedProfitUsd || 0) > 0).length;
      arbIsGuaranteed = wins === settled.length;
    }
  } catch { /* ignore */ }

  const effectiveArbMaxUsd = arbIsGuaranteed ? baseArbCap * 2 : baseArbCap;
  const effectiveFrac = arbIsGuaranteed ? Math.min(0.30, baseFrac * 1.5) : baseFrac;
  const shareBudget = Math.max(
    Number(cfg.minPositionSize ?? 0.5) * 2,
    Math.min(arbBank * effectiveFrac, effectiveArbMaxUsd),
  );
  // Preferred per-package notional. Small slices (e.g. $10–$20) walk the ask
  // ladder across maxArbPerSlug fills so we capture more of a thick gap instead
  // of one fat take that vacuums the best levels and leaves nothing.
  const rawSlice = Number(cfg.arbSliceUsd);
  const floorPkg = Number(cfg.minArbPackageUsd ?? cfg.arbPackageUsdFloor ?? 5);
  const sliceUsd = Number.isFinite(rawSlice) && rawSlice > 0
    ? Math.min(effectiveArbMaxUsd, Math.max(floorPkg, rawSlice))
    : effectiveArbMaxUsd;
  return {
    shareBudget,
    packageCap: effectiveArbMaxUsd,
    sliceUsd,
  };
}

/**
 * Detect + execute up to maxArbPerSlug packages on one market in a single pass,
 * consuming ask depth between packages so multi-fill captures remaining edge.
 */
export async function detectAndExecuteArbPackages(args) {
  const {
    market, depth, prices, cfg, mode = 'paper', readiness, log,
    executeTrade, adjustPaperCash, saveTrade, botState,
  } = args;

  if (cfg.clobArbEnabled === false) return [];
  if (!isComplementaryBinary(market)) return [];
  if (!hasRealAskLadders(depth)) {
    if (log) {
      log(`⏭️ ARB SKIP ${market.symbol} — no real ask ladder (refuse synthetic touch)`, 'scan', {
        slug: market.slug,
      });
    }
    return [];
  }

  const working = cloneDepth(depth);
  const maxPerSlug = Math.max(1, Number(cfg.maxArbPerSlug ?? 1));
  const maxPkgs = Number(cfg.maxArbPackages ?? 4);
  const locked = [];

  for (let i = 0; i < maxPerSlug; i++) {
    const active = getActivePackages(mode);
    if (active.length >= maxPkgs) break;
    const slugActive = active.filter((p) => p.slug === market.slug).length;
    if (slugActive >= maxPerSlug) break;

    const pkg = await detectAndExecuteArbPackage({
      market,
      depth: working,
      prices,
      cfg,
      mode,
      readiness,
      log,
      executeTrade,
      adjustPaperCash,
      saveTrade,
      botState,
      _fromMulti: true,
    });

    if (!pkg) break;
    if (pkg.status === 'LOCKED' || pkg.status === 'MERGED') {
      locked.push(pkg);
      if (pkg._opp) consumeOpportunityDepth(working, pkg._opp);
      delete pkg._opp;
    } else {
      // Abort / skip — stop slicing this book this scan
      break;
    }
  }

  return locked;
}

/**
 * Stage-2 reverse arb: when bid(UP)+bid(DOWN) > 1 + sell fees, mint a $1 pair
 * and sell both into bids. Paper simulates mint+dual-sell atomically.
 * Live requires CTF split — deferred until wallet split path is wired.
 */
export async function detectAndExecuteReverseBidPackage({
  market,
  depth,
  prices,
  cfg,
  mode = 'paper',
  log,
  adjustPaperCash,
  saveTrade,
  botState,
}) {
  if (cfg.clobArbEnabled === false) return null;
  if (cfg.arbReverseEnabled === false) return null;
  if (!isComplementaryBinary(market)) return null;

  const feeParams = (cfg.useClobMarketFees !== false && peekClobFeeParams(market.tokenIds?.up))
    || (cfg.feeCategory || 'crypto');
  const activePkgs = getActivePackages(mode);
  const maxPkgs = Number(cfg.maxArbPackages ?? 4);
  if (activePkgs.length >= maxPkgs) return null;

  const remSec = market?.endTime
    ? Math.max(0, (Number(market.endTime) * 1000 - Date.now()) / 1000)
    : Number(market?.remainingSec ?? market?.remaining);
  const touchBidUp = Number(depth?.up?.bestBid || 0);
  const touchBidDown = Number(depth?.down?.bestBid || 0);
  const gates = resolveArbGates(cfg, {
    remainingSec: remSec,
    touchBidPremium: touchBidUp && touchBidDown ? touchBidUp + touchBidDown - 1 : undefined,
  });

  const { shareBudget, packageCap, sliceUsd } = resolveShareBudget(cfg, mode, null);
  const opp = evaluateReverseBidOpportunity({
    depth,
    prices,
    maxBudgetUsd: Math.min(shareBudget, packageCap, sliceUsd),
    feeParams,
    marginPct: gates.marginPct,
    minBidPremium: gates.minGap,
    minPackageUsd: gates.minPackageUsd,
  });
  if (!opp) return null;

  if (gates.minLockedUsd > 0 && opp.lockedProfitUsd < gates.minLockedUsd) return null;
  if (gates.minLockedPct > 0 && opp.lockedProfitPct < gates.minLockedPct) return null;

  if (mode !== 'paper') {
    if (log) {
      log(
        `⏭️ ARB REV SKIP ${market.symbol} — live CTF split not wired yet (bidΣ=${opp.sum?.toFixed(3)} net/sh $${opp.netPerShare?.toFixed(4)})`,
        'scan',
        { slug: market.slug, stage: 2, bidSum: opp.sum },
      );
    }
    return null;
  }

  if (Number(cfg.paperBankroll ?? 0) < opp.mintCost + 0.01) return null;

  const packageId = `pkg-rev-${market.symbol.toLowerCase()}-${Date.now().toString(36)}`;
  const pkg: ArbPackage = {
    packageId,
    symbol: market.symbol,
    slug: market.slug,
    windowKey: market.windowKey || `slug-${market.slug}`,
    shares: opp.shares,
    upCost: Math.round(opp.shares * 0.5 * 100) / 100,
    downCost: Math.round(opp.shares * 0.5 * 100) / 100,
    totalCost: opp.mintCost,
    expectedPayout: opp.netProceeds,
    lockedProfitUsd: opp.lockedProfitUsd,
    lockedProfitPct: Math.round(opp.lockedProfitPct * 100) / 100,
    feesEstUsd: opp.feesEstUsd,
    gap: Math.round((opp.premium || 0) * 100000) / 100000,
    status: 'PENDING_FILL',
    mode,
    createdAt: Date.now(),
    legs: {
      up: {
        outcome: 'up',
        tokenId: market.tokenIds?.up || null,
        entryPrice: 0.5,
        cost: Math.round(opp.shares * 0.5 * 100) / 100,
        shares: opp.shares,
        filled: true,
      },
      down: {
        outcome: 'down',
        tokenId: market.tokenIds?.down || null,
        entryPrice: 0.5,
        cost: Math.round(opp.shares * 0.5 * 100) / 100,
        shares: opp.shares,
        filled: true,
      },
    },
  };
  (pkg as any).arbStage = 2;
  (pkg as any).arbKind = 'reverse_bid';

  if (typeof adjustPaperCash === 'function') {
    adjustPaperCash(-opp.mintCost, `ARB_REV_MINT ${market.symbol}`);
    adjustPaperCash(opp.netProceeds, `ARB_REV_SELL ${market.symbol}`);
  }

  const now = Date.now();
  for (const outcome of ['up', 'down'] as const) {
    const bid = outcome === 'up' ? opp.upBid : opp.downBid;
    const entry = 0.5;
    const feeHalf = Math.round((opp.feesEstUsd / 2) * 1e5) / 1e5;
    const pnl = Math.round(((bid - entry) * opp.shares - feeHalf) * 100) / 100;
    const trade = {
      id: `${packageId}-${outcome}`,
      symbol: market.symbol,
      slug: market.slug,
      outcome,
      entryPrice: entry,
      exitPrice: bid,
      shares: opp.shares,
      costBasis: Math.round(opp.shares * entry * 100) / 100,
      pnl,
      closed: true,
      mode: 'paper',
      packageId,
      isArbLeg: true,
      engine: 'arb',
      exitReason: 'arb_reverse_bid',
      arbStage: 2,
      timestamp: now,
      entryTime: now,
    };
    if (typeof saveTrade === 'function') saveTrade(trade);
  }

  pkg.status = 'MERGED';
  pkg.mergedAt = now;
  (pkg as any).mergeMethod = 'paper_reverse_bid';
  savePackage(pkg);

  emitEvent('package.settlement', {
    packageId,
    symbol: market.symbol,
    slug: market.slug,
    action: 'paper_reverse_bid',
    shares: opp.shares,
    lockedProfitUsd: opp.lockedProfitUsd,
    bidSum: opp.sum,
    mode: 'paper',
  });

  if (log) {
    log(
      `📦 ARB STAGE2 REV ${market.symbol} bidΣ=$${opp.sum.toFixed(3)} · mint $${opp.mintCost.toFixed(2)} → sell $${opp.netProceeds.toFixed(2)} · +$${opp.lockedProfitUsd.toFixed(2)}`,
      'buy',
      {
        packageId,
        slug: market.slug,
        stage: 2,
        bidSum: opp.sum,
        lockedProfitUsd: opp.lockedProfitUsd,
        shares: opp.shares,
      },
    );
  }

  void botState;
  return pkg;
}

/**
 * Detects an orderbook gap and executes one atomic ArbPackage.
 */
export async function detectAndExecuteArbPackage({
  market,
  depth,
  prices,
  cfg,
  mode = 'paper',
  readiness,
  log,
  executeTrade,
  adjustPaperCash,
  saveTrade,
  botState,
  _fromMulti = false,
}) {
  if (cfg.clobArbEnabled === false) return null;
  if (!isComplementaryBinary(market)) return null;

  if (!_fromMulti && !hasRealAskLadders(depth)) {
    if (log) {
      log(`⏭️ ARB SKIP ${market.symbol} — no real ask ladder`, 'scan', { slug: market.slug });
    }
    return null;
  }

  const feeParams = (cfg.useClobMarketFees !== false && peekClobFeeParams(market.tokenIds?.up))
    || (cfg.feeCategory || 'crypto');
  const remSec = market?.endTime
    ? Math.max(0, (Number(market.endTime) * 1000 - Date.now()) / 1000)
    : Number(market?.remainingSec ?? market?.remaining);
  const touchUp = Number(depth?.up?.bestAsk || prices?.up || 0);
  const touchDown = Number(depth?.down?.bestAsk || prices?.down || 0);
  const touchBidUp = Number(depth?.up?.bestBid || 0);
  const touchBidDown = Number(depth?.down?.bestBid || 0);
  const gates = resolveArbGates(cfg, {
    remainingSec: remSec,
    touchGap: touchUp && touchDown ? 1 - touchUp - touchDown : undefined,
    touchBidPremium: touchBidUp && touchBidDown ? touchBidUp + touchBidDown - 1 : undefined,
  });
  const marginPct = gates.marginPct;
  const minGap = gates.minGap;
  const minPackageUsd = gates.minPackageUsd;

  const { shareBudget, packageCap, sliceUsd } = resolveShareBudget(cfg, mode, readiness);

  const opp = evaluateArbOpportunity({
    depth,
    prices,
    maxBudgetUsd: shareBudget,
    targetBudgetUsd: sliceUsd,
    feeParams,
    marginPct,
    minGap,
    minShares: 0.5,
    requireRealLadder: true,
    minPackageUsd,
  });

  if (!opp) {
    const touchGap = 1 - touchUp - touchDown;
    if (log && touchGap > 0 && !_fromMulti) {
      const breakEvenGap = arbBreakEvenGap(touchUp, touchDown, feeParams);
      log(
        `⏭️ ARB SKIP ${market.symbol} touch gap ${(touchGap * 100).toFixed(2)}% — ladder walk found no fee-positive size (break-even ${(breakEvenGap * 100).toFixed(2)}% + margin ${(marginPct * 100).toFixed(2)}% · ${gates.reason})`,
        'scan',
        { slug: market.slug, touchGap, breakEvenGap, touchUp, touchDown, gates },
      );
    }
    return null;
  }

  const minLockedUsd = gates.minLockedUsd;
  const minLockedPct = gates.minLockedPct;
  if (minLockedUsd > 0 && Number(opp.lockedProfitUsd) < minLockedUsd) {
    if (log && !_fromMulti) {
      log(
        `⏭️ ARB SKIP ${market.symbol} locked +$${Number(opp.lockedProfitUsd).toFixed(2)} < min $${minLockedUsd.toFixed(2)} (${gates.reason})`,
        'scan',
        { slug: market.slug, lockedProfitUsd: opp.lockedProfitUsd, minLockedUsd, gates },
      );
    }
    return null;
  }
  if (minLockedPct > 0 && Number(opp.lockedProfitPct) < minLockedPct) {
    if (log && !_fromMulti) {
      log(
        `⏭️ ARB SKIP ${market.symbol} locked +${Number(opp.lockedProfitPct).toFixed(2)}% < min ${minLockedPct.toFixed(2)}% (${gates.reason})`,
        'scan',
        { slug: market.slug, lockedProfitPct: opp.lockedProfitPct, minLockedPct, gates },
      );
    }
    return null;
  }

  const { upAsk, downAsk, gap, breakEvenGap, shares } = opp;
  const sum = upAsk + downAsk;
  const activePkgs = getActivePackages(mode);
  const maxPkgs = Number(cfg.maxArbPackages ?? 4);
  const maxPerSlug = Math.max(1, Number(cfg.maxArbPerSlug ?? 1));
  if (activePkgs.length >= maxPkgs) return null;

  const slugActive = activePkgs.filter((p) => p.slug === market.slug).length;
  if (slugActive >= maxPerSlug) return null;

  let costUp = Math.round(opp.shares * upAsk * 100) / 100;
  let costDown = Math.round(opp.shares * downAsk * 100) / 100;
  let totalCost = Math.round((costUp + costDown) * 100) / 100;

  if (mode === 'paper' && Number(cfg.paperBankroll ?? 0) < totalCost + 0.01) {
    return null;
  }

  const packageId = `pkg-${market.symbol.toLowerCase()}-${Date.now().toString(36)}`;
  let expectedPayout = Math.round(opp.shares * 1.00 * 100) / 100;
  const feesEstUsd = Math.round(opp.feesEstUsd * 100) / 100;
  let lockedProfitUsd = Math.round(opp.lockedProfitUsd * 100) / 100;
  let lockedProfitPct = Math.round(opp.lockedProfitPct * 100) / 100;

  const pkg: ArbPackage = {
    packageId,
    symbol: market.symbol,
    slug: market.slug,
    windowKey: market.windowKey || `slug-${market.slug}`,
    shares: opp.shares,
    upCost: costUp,
    downCost: costDown,
    totalCost,
    expectedPayout,
    lockedProfitUsd,
    lockedProfitPct,
    feesEstUsd,
    breakEvenGap,
    gap: Math.round(gap * 100000) / 100000,
    status: 'PENDING_FILL',
    mode,
    createdAt: Date.now(),
    legs: {
      up: { outcome: 'up', tokenId: market.tokenIds?.up || null, entryPrice: upAsk, cost: costUp, shares, filled: false },
      down: { outcome: 'down', tokenId: market.tokenIds?.down || null, entryPrice: downAsk, cost: costDown, shares, filled: false },
    },
  };
  // Internal: residual depth consumption after LOCKED
  (pkg as any)._opp = opp;

  savePackage(pkg);

  const prevMax = botState?.config?.maxConcurrentPerSlug;
  const slugCap = Math.max(2, maxPerSlug * 2);
  if (botState?.config) botState.config.maxConcurrentPerSlug = slugCap;
  let upShares = 0;
  let downShares = 0;

  try {
    upShares = await executeArbLeg({
      outcome: 'up', price: upAsk, cost: costUp, shares, pkg, market, executeTrade, mode, cfg, botState, log,
    });

    if (upShares > 0) {
      await new Promise((r) => setTimeout(r, 40));
      // Size leg 2 from what leg 1 ACTUALLY matched (share parity).
      const downCostActual = Math.round(upShares * downAsk * 100) / 100;
      downShares = await executeArbLeg({
        outcome: 'down',
        price: downAsk,
        cost: downCostActual,
        shares: upShares,
        pkg,
        market,
        executeTrade,
        mode,
        cfg,
        botState,
        log,
      });
    }
  } catch (err) {
    if (log) log(`⚠️ Arb leg execution error: ${err.message}`, 'error', { packageId, error: err.message });
  } finally {
    if (botState?.config && prevMax != null) botState.config.maxConcurrentPerSlug = prevMax;
  }

  // Record fills before branching so abortReason and flags agree.
  pkg.legs.up.filled = upShares > 0;
  pkg.legs.up.shares = upShares;
  pkg.legs.down.filled = downShares > 0;
  pkg.legs.down.shares = downShares;

  try {
    if (upShares > 0 && downShares > 0) {
      const matched = Math.min(upShares, downShares);
      const residual = Math.round(Math.abs(upShares - downShares) * 1000) / 1000;
      const legTolerance = Math.max(0.05, matched * 0.02);

      if (residual > legTolerance) {
        pkg.residualShares = residual;
        pkg.residualOutcome = upShares > downShares ? 'up' : 'down';
        if (log) {
          log(
            `⚠️ ARB LEG PARITY BREACH ${market.symbol} — UP ${upShares}sh vs DOWN ${downShares}sh · ${residual}sh unhedged ${pkg.residualOutcome.toUpperCase()}`,
            'error',
            { packageId, slug: market.slug, upShares, downShares, residual, tolerance: legTolerance },
          );
        }
      }

      pkg.shares = matched;
      pkg.expectedPayout = Math.round(matched * 1.00 * 100) / 100;
      costUp = Math.round(matched * upAsk * 100) / 100;
      costDown = Math.round(matched * downAsk * 100) / 100;
      totalCost = Math.round((costUp + costDown) * 100) / 100;
      pkg.upCost = costUp;
      pkg.downCost = costDown;
      pkg.totalCost = totalCost;
      lockedProfitUsd = Math.round((pkg.expectedPayout - totalCost - feesEstUsd) * 100) / 100;
      lockedProfitPct = totalCost > 0 ? Math.round((lockedProfitUsd / totalCost) * 10000) / 100 : 0;
      pkg.lockedProfitUsd = lockedProfitUsd;
      pkg.lockedProfitPct = lockedProfitPct;
      pkg.status = 'LOCKED';
      savePackage(pkg);

      if (log) {
        log(
          `📦 ATOMIC ARB PACKAGE LOCKED ${market.symbol} UP@$${upAsk.toFixed(3)} + DN@$${downAsk.toFixed(3)} = $${sum.toFixed(3)} · Net +$${lockedProfitUsd.toFixed(2)} (+${lockedProfitPct.toFixed(1)}%) · ${matched} sh/leg`,
          'buy',
          { packageId, slug: market.slug, totalCost, expectedPayout: pkg.expectedPayout, lockedProfitUsd, lockedProfitPct },
        );
      }

      // Capture locked edge without waiting for window settle (capital velocity).
      // merge = CTF burn (live) / paper sim; spread_or_settle waits for bid reconvergence.
      const exitMode = String(cfg?.arbExitMode || (cfg?.instantCtfMerge === false ? 'settlement' : 'merge'));
      if (exitMode === 'merge' || (exitMode !== 'settlement' && cfg?.instantCtfMerge !== false)) {
        await captureArbPackage({
          pkg,
          market,
          mode,
          cfg,
          botState,
          log,
          adjustPaperCash,
          saveTrade,
          prefer: 'merge',
        });
      }

      return pkg;
    }

    pkg.status = 'ABORTED';
    pkg.unwoundAt = Date.now();
    pkg.abortReason = `Leg execution mismatch: UP=${upShares > 0 ? 'OK' : 'FAIL'}, DOWN=${downShares > 0 ? 'OK' : 'FAIL'}`;

    if (upShares > 0 && downShares <= 0) {
      await unwindLeg({ outcome: 'up', pkg, market, mode, cfg, botState, log, adjustPaperCash, saveTrade });
    } else if (downShares > 0 && upShares <= 0) {
      await unwindLeg({ outcome: 'down', pkg, market, mode, cfg, botState, log, adjustPaperCash, saveTrade });
    }

    savePackage(pkg);
    if (log) {
      log(`⚠️ ABORTED ARB PACKAGE ${market.symbol} (${pkg.abortReason}) — emergency unwound filled leg`, 'sl', { packageId, slug: market.slug });
    }
    return pkg;
  } catch (err) {
    pkg.status = 'ABORTED';
    pkg.abortReason = err.message;
    savePackage(pkg);
    if (log) log(`⚠️ ABORTED ARB PACKAGE ${market.symbol} error: ${err.message}`, 'error');
    return pkg;
  }
}

/**
 * @returns {number} matched shares (0 on failure)
 */
async function executeArbLeg({
  outcome, price, cost, shares, pkg, market, executeTrade, mode = 'paper', cfg, botState, log,
}) {
  const plan = {
    symbol: market.symbol,
    slug: market.slug,
    outcome,
    price,
    entryPrice: price,
    shares,
    costEst: cost,
    sizeUsd: cost,
    packageId: pkg.packageId,
    isArbLeg: true,
    holdToSettle: true,
    exitMode: String(cfg?.arbExitMode || 'merge') === 'settlement' ? 'settlement' : 'arb_capture',
    planMethod: 'arb_hold',
    adaptiveSlEnabled: false,
  };

  const pending = {
    id: `${pkg.packageId}-${outcome}`,
    status: 'pending',
    symbol: market.symbol,
    slug: market.slug,
    outcome,
    tokenId: market.tokenIds?.[outcome] || null,
    negRisk: !!market.negRisk,
    tickSize: market.tickSize || '0.01',
    minShares: 1,
    plan,
  };

  const res = await executeTrade(pending);
  if (res?.ok !== true) return 0;

  const filled = Number(res.position?.shares ?? res.shares ?? shares);
  return Number.isFinite(filled) && filled > 0 ? filled : 0;
}

async function unwindLeg({ outcome, pkg, market, mode, cfg, botState, log, adjustPaperCash, saveTrade }) {
  const pos = botState.positions.find((p) => p.packageId === pkg.packageId && p.outcome === outcome && !p.closed);
  if (!pos) return { ok: false, closed: false, missing: true };

  const shares = Number(pos.shares || 0);
  const price = Number(pos.entryPrice || 0);
  const feeOn = cfg?.simulateClobFees !== false;
  const pack = closeProceedsWithFee(shares, price, cfg?.feeCategory || 'crypto', 'arb_rollback');
  const exitFee = feeOn ? pack.fee : 0;
  const entryFee = Number(pos.entryFee || 0);

  if (mode === 'live' && pos.tokenId) {
    try {
      const { placeMarketSell, sellFloor } = await import('./trade.js');
      const mark = Number(pos.currentPrice || pos.entryPrice || 0);
      const sellRes = await placeMarketSell({
        tokenId: pos.tokenId,
        shares,
        minPrice: sellFloor(mark, { tickSize: pos.tickSize || '0.01' }),
        markPrice: mark,
        negRisk: !!pos.negRisk,
        tickSize: pos.tickSize || '0.01',
      });
      pos.unwindAttempts = 0;
      if (sellRes?.fillPrice > 0) {
        pos.exitPrice = sellRes.fillPrice;
      }
      if (log) {
        log(`⚡ LIVE ARB UNWIND: Sold ${shares}sh back to CLOB cash (order: ${sellRes?.id || 'ok'})`, 'system', { orderId: sellRes?.id });
      }
    } catch (err) {
      const maxAttempts = Math.max(1, Number(cfg?.arbUnwindMaxAttempts ?? 3));
      pos.unwindAttempts = Number(pos.unwindAttempts || 0) + 1;
      pos.lastUnwindError = String(err?.message || err).slice(0, 200);
      pos.lastUnwindAt = Date.now();
      pos.unwindBlocked = pos.unwindAttempts >= maxAttempts;

      if (log) {
        log(
          pos.unwindBlocked
            ? `🛑 LIVE ARB UNWIND GAVE UP after ${pos.unwindAttempts} attempts — ${pos.symbol} ${outcome.toUpperCase()} ${shares}sh STILL HELD · ${pos.lastUnwindError}`
            : `⚠️ LIVE ARB UNWIND FAILED (attempt ${pos.unwindAttempts}/${maxAttempts}) — position left open: ${pos.lastUnwindError}`,
          'error',
          {
            packageId: pkg.packageId, slug: market?.slug, outcome,
            attempts: pos.unwindAttempts, blocked: pos.unwindBlocked, err: pos.lastUnwindError,
          },
        );
      }
      return { ok: false, closed: false, attempts: pos.unwindAttempts, blocked: pos.unwindBlocked };
    }
  }

  pos.closed = true;
  pos.exitPrice = pos.exitPrice || price;
  pos.exitReason = 'arb_rollback';
  pos.exitFee = exitFee;
  pos.feesPaid = Math.round((entryFee + exitFee) * 1e5) / 1e5;
  pos.pnl = Math.round(-(entryFee + exitFee) * 100) / 100;

  if (mode === 'paper' && typeof adjustPaperCash === 'function') {
    const refund = Math.round((pack.premium - exitFee) * 100) / 100;
    adjustPaperCash(refund, `ROLLBACK ${pos.symbol} ${outcome.toUpperCase()}`);
  }

  if (saveTrade) {
    saveTrade({ ...pos, timestamp: Date.now() });
  }

  if (log) {
    log(
      `🔄 ROLLBACK UNWIND ${pos.symbol} ${outcome.toUpperCase()} · returned $${pack.premium.toFixed(2)} − fee $${exitFee.toFixed(4)} · cost $${(entryFee + exitFee).toFixed(4)}`,
      'system',
      { packageId: pkg.packageId, slug: market?.slug, outcome, entryFee, exitFee, pnl: pos.pnl },
    );
  }

  return { ok: true, closed: true };
}

export async function reconcilePendingPackages({
  mode = 'paper',
  positions = [],
  trades = [],
  minAgeMs = 120_000,
  cfg = {},
  botState = null,
  log = null,
  adjustPaperCash = null,
  saveTrade = null,
}: any = {}) {
  const now = Date.now();
  const all = loadPackages().filter((p) => (
    p.mode === mode && (now - Number(p.createdAt || 0)) > minAgeMs
  ));
  const stuck = all.filter((p) => p.status === 'PENDING_FILL');
  if (!stuck.length) {
    // Also retry ABORTED packages that still have an open orphan leg
    const abortedOrphans = all.filter((p) => p.status === 'ABORTED');
    let retried = 0;
    for (const pkg of abortedOrphans) {
      const openLeg = ['up', 'down'].find((o) => positions.some(
        (pos) => pos.packageId === pkg.packageId && pos.outcome === o && !pos.closed,
      ));
      if (!openLeg) continue;
      const pos = positions.find((p) => p.packageId === pkg.packageId && p.outcome === openLeg && !p.closed);
      if (pos?.unwindBlocked) continue;
      try {
        await unwindLeg({
          outcome: openLeg, pkg, market: { slug: pkg.slug }, mode, cfg, botState, log, adjustPaperCash, saveTrade,
        });
        retried += 1;
      } catch (err) {
        if (log) log(`⚠️ ARB RECONCILE orphan unwind failed ${pkg.packageId}: ${err?.message}`, 'error');
      }
    }
    return { checked: 0, locked: 0, aborted: 0, discarded: 0, orphanRetries: retried };
  }

  const present = (pkg, outcome) => (
    positions.some((p) => p.packageId === pkg.packageId && p.outcome === outcome)
    || trades.some((t) => t.packageId === pkg.packageId && t.outcome === outcome)
  );

  const result = { checked: stuck.length, locked: 0, aborted: 0, discarded: 0, orphanRetries: 0 };

  for (const pkg of stuck) {
    const upOk = present(pkg, 'up');
    const downOk = present(pkg, 'down');
    const ageH = ((now - Number(pkg.createdAt || 0)) / 3_600_000).toFixed(1);

    if (upOk && downOk) {
      pkg.legs.up.filled = true;
      pkg.legs.down.filled = true;
      pkg.status = 'LOCKED';
      savePackage(pkg);
      result.locked += 1;
      if (log) log(`🔧 ARB RECONCILE ${pkg.symbol} ${pkg.packageId} → LOCKED · both legs found after ${ageH}h stuck`, 'system', { packageId: pkg.packageId, slug: pkg.slug });
      continue;
    }

    if (upOk !== downOk) {
      const filledLeg = upOk ? 'up' : 'down';
      pkg.status = 'ABORTED';
      pkg.unwoundAt = now;
      pkg.abortReason = `Reconciled after ${ageH}h PENDING_FILL: only the ${filledLeg.toUpperCase()} leg filled`;
      pkg.legs[filledLeg].filled = true;
      savePackage(pkg);
      result.aborted += 1;
      if (log) log(`🔧 ARB RECONCILE ${pkg.symbol} ${pkg.packageId} → ABORTED · naked ${filledLeg.toUpperCase()} leg after ${ageH}h — unwinding`, 'sl', { packageId: pkg.packageId, slug: pkg.slug });
      try {
        await unwindLeg({ outcome: filledLeg, pkg, market: { slug: pkg.slug }, mode, cfg, botState, log, adjustPaperCash, saveTrade });
      } catch (err) {
        if (log) log(`⚠️ ARB RECONCILE unwind failed ${pkg.packageId}: ${err?.message}`, 'error');
      }
      continue;
    }

    pkg.status = 'ABORTED';
    pkg.unwoundAt = now;
    pkg.abortReason = `Reconciled after ${ageH}h PENDING_FILL: neither leg filled`;
    savePackage(pkg);
    result.discarded += 1;
    if (log) log(`🔧 ARB RECONCILE ${pkg.symbol} ${pkg.packageId} → ABORTED · no legs filled after ${ageH}h · capacity freed`, 'system', { packageId: pkg.packageId, slug: pkg.slug });
  }

  return result;
}

/**
 * Net proceeds if we dual-sell both legs into current bids (after exit fees).
 * Prefer CTF merge when available — merge returns $1/share with no CLOB exit fee.
 */
export function evaluateSpreadCapture({
  pkg,
  bidUp,
  bidDown,
  feeParams = 'crypto',
  minBidSum = 0.985,
  minCaptureFrac = 0.70,
}) {
  const shares = Number(pkg?.shares || 0);
  const totalCost = Number(pkg?.totalCost || 0);
  const locked = Number(pkg?.lockedProfitUsd || 0);
  const entryFees = Number(pkg?.feesEstUsd || 0);
  if (!(shares > 0) || !(totalCost > 0)) return { ok: false, reason: 'bad_pkg' };

  const up = Number(bidUp || 0);
  const down = Number(bidDown || 0);
  const bidSum = up + down;
  if (!(up > 0.01 && down > 0.01)) return { ok: false, reason: 'no_bids', bidSum };

  const feeUp = takerFeeUsdc(shares, up, feeParams);
  const feeDown = takerFeeUsdc(shares, down, feeParams);
  const exitFees = feeUp + feeDown;
  const gross = shares * bidSum;
  const netProceeds = Math.round((gross - exitFees) * 100) / 100;
  const settleProceeds = Math.round(shares * 1.0 * 100) / 100;
  const earlyPnl = Math.round((netProceeds - totalCost - entryFees) * 100) / 100;
  const settlePnl = Math.round((settleProceeds - totalCost - entryFees) * 100) / 100;
  const captureFrac = settlePnl > 0 ? earlyPnl / settlePnl : (earlyPnl > 0 ? 1 : 0);

  const ok = bidSum >= Number(minBidSum)
    && earlyPnl > 0
    && captureFrac >= Number(minCaptureFrac)
    && earlyPnl >= Math.min(0.25, Math.max(0.05, locked * 0.25));

  return {
    ok,
    reason: ok ? 'capture' : (bidSum < minBidSum ? 'bid_sum_low' : 'edge_thin'),
    bidSum,
    netProceeds,
    settleProceeds,
    earlyPnl,
    settlePnl,
    captureFrac,
    exitFees,
  };
}

function openPackageLegs(botState, packageId) {
  return (botState?.positions || []).filter(
    (p) => p.packageId === packageId && !p.closed,
  );
}

/** Close both open legs at $0.50 (pair redeems $1) — fee-free merge/settle sim. */
async function closePairAtRedeem({
  pkg,
  botState,
  adjustPaperCash,
  saveTrade,
  exitReason = 'arb_merge',
  exitPrice = 0.5,
  log,
}) {
  const legs = openPackageLegs(botState, pkg.packageId);
  if (legs.length < 2) return { ok: false, closed: 0, reason: 'missing_legs' };

  let closed = 0;
  let netPnl = 0;
  for (const pos of legs) {
    const shares = Number(pos.shares || 0);
    if (!(shares > 0)) continue;
    const entry = Number(pos.entryPrice || 0);
    const entryFee = Number(pos.entryFee || 0);
    const proceeds = Math.round(shares * exitPrice * 100) / 100;
    pos.exitPrice = exitPrice;
    pos.closed = true;
    pos.exitReason = exitReason;
    pos.exitFee = 0;
    pos.feesPaid = Math.round(entryFee * 1e5) / 1e5;
    pos.pnl = Math.round(((exitPrice - entry) * shares - entryFee) * 100) / 100;
    pos.unrealizedPnl = 0;
    pos.gainPct = entry > 0 ? ((exitPrice - entry) / entry) * 100 : 0;
    netPnl += pos.pnl;
    if (pos.mode === 'paper' && typeof adjustPaperCash === 'function') {
      adjustPaperCash(proceeds, `${exitReason.toUpperCase()} ${pos.symbol} ${String(pos.outcome || '').toUpperCase()}`);
    }
    if (typeof saveTrade === 'function') {
      saveTrade({ ...pos, timestamp: Date.now(), exitReason });
    }
    closed += 1;
  }

  if (closed < 2) return { ok: false, closed, reason: 'partial_close', netPnl };

  if (log) {
    log(
      `📦 ARB ${exitReason.toUpperCase()} ${pkg.symbol} · ${pkg.shares} sh/leg → $${Number(pkg.expectedPayout).toFixed(2)} · net ~$${netPnl.toFixed(2)}`,
      'tp',
      { packageId: pkg.packageId, slug: pkg.slug, netPnl, exitReason },
    );
  }
  return { ok: true, closed, netPnl };
}

/**
 * Realize locked arb edge without waiting for window settle.
 * prefer 'merge' → CTF (live) or paper $1 redeem; 'spread' → dual bid sell when book reconverges.
 */
export async function captureArbPackage({
  pkg,
  market = null,
  mode = 'paper',
  cfg = {},
  botState,
  log,
  adjustPaperCash,
  saveTrade,
  prefer = 'merge',
  depth = null,
  prices = null,
}) {
  if (!pkg || pkg.status !== 'LOCKED') return { ok: false, reason: 'not_locked' };

  const exitMode = String(cfg?.arbExitMode || 'merge');
  if (exitMode === 'settlement') return { ok: false, reason: 'settlement_only' };

  const wantMerge = prefer === 'merge' || exitMode === 'merge';

  if (wantMerge && mode === 'live' && (botState?.walletClient || botState?.signer) && market?.conditionId) {
    const mergeRes = await executeCtfMerge({
      conditionId: market.conditionId,
      shares: Number(pkg.shares || 0),
      collateralToken: market.collateralToken,
      walletClient: botState.walletClient || botState.signer,
      publicClient: botState.publicClient,
    });
    if (mergeRes?.ok) {
      await closePairAtRedeem({
        pkg, botState, adjustPaperCash, saveTrade, exitReason: 'arb_merge', exitPrice: 0.5, log,
      });
      pkg.status = 'MERGED';
      pkg.mergedAt = Date.now();
      pkg.mergeTxHash = mergeRes.txHash;
      savePackage(pkg);
      emitEvent('package.settlement', {
        packageId: pkg.packageId,
        symbol: pkg.symbol,
        slug: pkg.slug,
        action: 'instant_ctf_merge',
        shares: pkg.shares,
        lockedProfitUsd: pkg.lockedProfitUsd,
        txHash: mergeRes.txHash,
        mode: 'live',
      });
      if (log) {
        log(
          `📦 INSTANT CTF MERGE: ${pkg.shares} sh burned on-chain → $${Number(pkg.shares).toFixed(2)} USDC (tx: ${mergeRes.txHash})`,
          'system',
          { packageId: pkg.packageId, txHash: mergeRes.txHash },
        );
      }
      return { ok: true, method: 'ctf_merge', pkg };
    }
  }

  if (wantMerge && mode === 'paper') {
    const closed = await closePairAtRedeem({
      pkg, botState, adjustPaperCash, saveTrade, exitReason: 'arb_merge', exitPrice: 0.5, log,
    });
    if (closed.ok) {
      pkg.status = 'MERGED';
      pkg.mergedAt = Date.now();
      pkg.mergeMethod = 'paper_ctf_sim';
      savePackage(pkg);
      emitEvent('package.settlement', {
        packageId: pkg.packageId,
        symbol: pkg.symbol,
        slug: pkg.slug,
        action: 'paper_ctf_merge',
        shares: pkg.shares,
        lockedProfitUsd: pkg.lockedProfitUsd,
        mode: 'paper',
      });
      return { ok: true, method: 'paper_merge', pkg, netPnl: closed.netPnl };
    }
  }

  if (exitMode === 'spread_or_settle' || prefer === 'spread') {
    const bidUp = Number(depth?.up?.bestBid ?? prices?.up ?? 0);
    const bidDown = Number(depth?.down?.bestBid ?? prices?.down ?? 0);
    const feeParams = (cfg.useClobMarketFees !== false && peekClobFeeParams(pkg.legs?.up?.tokenId))
      || (cfg.feeCategory || 'crypto');
    const ev = evaluateSpreadCapture({
      pkg,
      bidUp,
      bidDown,
      feeParams,
      minBidSum: Number(cfg.arbSpreadMinBidSum ?? 0.985),
      minCaptureFrac: Number(cfg.arbSpreadMinCaptureFrac ?? 0.70),
    });
    if (!ev.ok) return { ok: false, reason: ev.reason, eval: ev };

    const legs = openPackageLegs(botState, pkg.packageId);
    if (legs.length < 2) return { ok: false, reason: 'missing_legs' };

    let netPnl = 0;
    for (const pos of legs) {
      const outcome = String(pos.outcome || '').toLowerCase();
      const fill = outcome === 'up' ? bidUp : bidDown;
      const shares = Number(pos.shares || 0);
      const pack = closeProceedsWithFee(shares, fill, feeParams, 'arb_spread_capture');
      const entryFee = Number(pos.entryFee || 0);
      pos.exitPrice = fill;
      pos.closed = true;
      pos.exitReason = 'arb_spread_capture';
      pos.exitFee = pack.fee;
      pos.feesPaid = Math.round((entryFee + pack.fee) * 1e5) / 1e5;
      pos.pnl = Math.round(((fill - Number(pos.entryPrice || 0)) * shares - entryFee - pack.fee) * 100) / 100;
      netPnl += pos.pnl;
      if (pos.mode === 'paper' && typeof adjustPaperCash === 'function') {
        adjustPaperCash(pack.net, `ARB_SPREAD ${pos.symbol} ${String(pos.outcome || '').toUpperCase()}`);
      }
      if (typeof saveTrade === 'function') {
        saveTrade({ ...pos, timestamp: Date.now(), exitReason: 'arb_spread_capture' });
      }
    }

    pkg.status = 'SETTLED';
    pkg.settledAt = Date.now();
    pkg.settleMethod = 'spread_capture';
    pkg.realizedPnlUsd = Math.round(netPnl * 100) / 100;
    savePackage(pkg);
    if (log) {
      log(
        `📦 ARB SPREAD CAPTURE ${pkg.symbol} bidΣ=${ev.bidSum.toFixed(3)} · net +$${netPnl.toFixed(2)} (${(ev.captureFrac * 100).toFixed(0)}% of settle edge)`,
        'tp',
        { packageId: pkg.packageId, ...ev, netPnl },
      );
    }
    return { ok: true, method: 'spread', pkg, netPnl, eval: ev };
  }

  return { ok: false, reason: 'no_capture_path' };
}

/**
 * Retry merge / spread capture for LOCKED packages still holding both legs.
 * Called from arbHousekeeping so failed live merges and delayed paper closes clear capacity.
 */
export async function captureLockedArbPackages({
  mode = 'paper',
  cfg = {},
  botState,
  markets = [],
  log,
  adjustPaperCash,
  saveTrade,
  depthBySlug = null,
}) {
  const exitMode = String(cfg?.arbExitMode || 'merge');
  if (exitMode === 'settlement') return { attempted: 0, captured: 0 };

  const locked = loadPackages().filter((p) => p.mode === mode && p.status === 'LOCKED');
  let captured = 0;
  for (const pkg of locked) {
    const legs = openPackageLegs(botState, pkg.packageId);
    if (legs.length < 2) continue;
    const market = (markets || []).find((m) => m.slug === pkg.slug) || null;
    const depth = depthBySlug?.[pkg.slug] || null;
    const prefer = exitMode === 'spread_or_settle' ? 'spread' : 'merge';
    const res = await captureArbPackage({
      pkg,
      market,
      mode,
      cfg,
      botState,
      log,
      adjustPaperCash,
      saveTrade,
      prefer,
      depth,
      prices: market?.prices || null,
    });
    if (res?.ok) captured += 1;
  }
  return { attempted: locked.length, captured };
}

export function syncPackageSettlements(trades = [], mode = 'paper') {
  const packages = loadPackages().filter((p) => p.mode === mode && p.status === 'LOCKED');
  let updated = false;

  for (const pkg of packages) {
    const pkgTrades = trades.filter((t) => t.packageId === pkg.packageId && t.closed);
    if (pkgTrades.length >= 2) {
      pkg.status = 'SETTLED';
      pkg.settledAt = Date.now();
      savePackage(pkg);
      updated = true;
    }
  }

  return updated;
}

export function getArbPackageMetrics(mode = 'paper', trades = []) {
  const all = loadPackages().filter((p) => p.mode === mode);
  const settled = all.filter((p) => p.status === 'SETTLED' || p.status === 'MERGED');
  const locked = all.filter((p) => p.status === 'LOCKED');
  const aborted = all.filter((p) => p.status === 'ABORTED');

  const realizedFor = (pkg) => {
    const legTrades = trades.filter((t) => t.packageId === pkg.packageId && t.closed && t.pnl != null);
    if (legTrades.length >= 2) {
      return Math.round(legTrades.reduce((s, t) => s + Number(t.pnl || 0), 0) * 100) / 100;
    }
    return Number(pkg.lockedProfitUsd || 0);
  };

  const concludedCount = settled.length + aborted.length;
  const netProfitUsd = Math.round(settled.reduce((sum, p) => sum + realizedFor(p), 0) * 100) / 100;
  const winCount = settled.filter((p) => realizedFor(p) > 0).length;
  const winRatePct = concludedCount > 0 ? Math.round((winCount / concludedCount) * 1000) / 10 : 0;

  return {
    totalPackages: all.length,
    activeLocked: locked.length,
    settledCount: settled.length,
    abortedCount: aborted.length,
    concludedCount,
    winCount,
    winRatePct,
    netProfitUsd: Math.round(netProfitUsd * 100) / 100,
  };
}
