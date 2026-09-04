// @ts-nocheck
/**
 * Dynamic arb entry gates — relax crumb floors based on window clock and
 * touch dislocation so we don't sit idle waiting for textbook gaps.
 *
 * Base cfg is the ceiling of strictness; dynamics only loosen (never tighten
 * beyond the operator's explicit floors when arbDynamicGates is off).
 */

/**
 * @param {object} cfg
 * @param {{ remainingSec?: number, touchGap?: number, touchBidPremium?: number }} [ctx]
 */
export function resolveArbGates(cfg = {}, ctx = {}) {
  const dynamic = cfg.arbDynamicGates !== false;
  const baseGap = Number(cfg.minArbGap ?? 0.006);
  const baseMargin = Number(cfg.arbMinMarginPct ?? 0.003);
  const baseLockUsd = Number(cfg.minArbLockedProfitUsd ?? 0.4);
  const baseLockPct = Number(cfg.minArbLockedProfitPct ?? 0.5);
  const basePkgUsd = Number(cfg.minArbPackageUsd ?? 10);

  if (!dynamic) {
    return {
      minGap: baseGap,
      marginPct: baseMargin,
      minLockedUsd: baseLockUsd,
      minLockedPct: baseLockPct,
      minPackageUsd: basePkgUsd,
      reason: 'static',
    };
  }

  const rem = Number(ctx.remainingSec);
  const touchGap = Number(ctx.touchGap);
  const bidPrem = Number(ctx.touchBidPremium);

  // Window clock: early = hunt more aggressively; late = take thinner edges
  // (capital frees via merge anyway). Mid stays near base.
  let gapScale = 1;
  let lockScale = 1;
  let phase = 'mid';
  if (Number.isFinite(rem)) {
    if (rem >= 180) {
      phase = 'early';
      gapScale = 0.55;
      lockScale = 0.45;
    } else if (rem >= 60) {
      phase = 'mid';
      gapScale = 0.75;
      lockScale = 0.65;
    } else if (rem >= 20) {
      phase = 'late';
      gapScale = 0.5;
      lockScale = 0.4;
    } else {
      phase = 'ending';
      gapScale = 0.4;
      lockScale = 0.3;
    }
  }

  // Visible dislocation: if touch already looks juicy, don't demand fat locks
  if (Number.isFinite(touchGap) && touchGap >= 0.012) {
    gapScale *= 0.7;
    lockScale *= 0.55;
  } else if (Number.isFinite(touchGap) && touchGap >= 0.006) {
    gapScale *= 0.85;
    lockScale *= 0.75;
  }
  if (Number.isFinite(bidPrem) && bidPrem >= 0.012) {
    gapScale *= 0.7;
    lockScale *= 0.55;
  }

  const floorGap = Number(cfg.arbGapFloor ?? 0.003);
  const floorMargin = Number(cfg.arbMarginFloor ?? 0.0015);
  const floorLockUsd = Number(cfg.arbLockUsdFloor ?? 0.25);
  const floorLockPct = Number(cfg.arbLockPctFloor ?? 0.25);
  const floorPkg = Number(cfg.arbPackageUsdFloor ?? 5);

  return {
    minGap: Math.max(floorGap, baseGap * gapScale),
    marginPct: Math.max(floorMargin, baseMargin * gapScale),
    minLockedUsd: Math.max(floorLockUsd, baseLockUsd * lockScale),
    minLockedPct: Math.max(floorLockPct, baseLockPct * lockScale),
    minPackageUsd: Math.max(floorPkg, basePkgUsd * Math.min(1, 0.5 + lockScale * 0.5)),
    reason: `dynamic:${phase}`,
    phase,
  };
}
