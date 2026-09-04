import { describe, expect, it } from 'vitest';
import { resolveArbGates } from '../../src/polymarket/arbGates.js';

describe('resolveArbGates', () => {
  it('loosens floors in early window vs static base', () => {
    const cfg = {
      arbDynamicGates: true,
      minArbGap: 0.006,
      arbMinMarginPct: 0.003,
      minArbLockedProfitUsd: 0.4,
      minArbLockedProfitPct: 0.45,
      minArbPackageUsd: 8,
    };
    const early = resolveArbGates(cfg, { remainingSec: 240, touchGap: 0.01 });
    const staticG = resolveArbGates({ ...cfg, arbDynamicGates: false }, {});
    expect(early.minGap).toBeLessThan(staticG.minGap);
    expect(early.minLockedUsd).toBeLessThan(staticG.minLockedUsd);
    expect(early.phase).toBe('early');
  });

  it('never drops below absolute floors', () => {
    const g = resolveArbGates({
      arbDynamicGates: true,
      minArbGap: 0.006,
      minArbLockedProfitUsd: 0.4,
      arbGapFloor: 0.003,
      arbLockUsdFloor: 0.2,
    }, { remainingSec: 10, touchGap: 0.02 });
    expect(g.minGap).toBeGreaterThanOrEqual(0.003);
    expect(g.minLockedUsd).toBeGreaterThanOrEqual(0.2);
  });
});
