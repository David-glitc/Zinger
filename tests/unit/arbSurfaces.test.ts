import { describe, expect, it } from 'vitest';
import {
  evaluateArbSurfaces,
  evaluateReverseBidOpportunity,
} from '../../src/polymarket/arbSurfaces.js';

describe('arbSurfaces two-stage', () => {
  it('flags stage1 ask complementary when ask sum < 1', () => {
    const depth = {
      up: { bestAsk: 0.42, bestBid: 0.40, asks: [{ price: 0.42, size: 100 }], bids: [{ price: 0.40, size: 100 }] },
      down: { bestAsk: 0.50, bestBid: 0.48, asks: [{ price: 0.50, size: 100 }], bids: [{ price: 0.48, size: 100 }] },
    };
    const s = evaluateArbSurfaces(depth, {}, { rate: 0.07, exponent: 2 }, { minGap: 0.05, marginPct: 0.01 });
    expect(s.stage1Ask.sum).toBeCloseTo(0.92, 5);
    expect(s.stage1Ask.gap).toBeCloseTo(0.08, 5);
    expect(s.stage1Ask.actionable).toBe(true);
    expect(s.up.spread).toBeCloseTo(0.02, 5);
    expect(s.up.crossable).toBe(false);
  });

  it('flags stage2 reverse when bid sum > 1 after fees', () => {
    const depth = {
      up: { bestAsk: 0.55, bestBid: 0.54, asks: [{ price: 0.55, size: 80 }], bids: [{ price: 0.54, size: 80 }] },
      down: { bestAsk: 0.52, bestBid: 0.51, asks: [{ price: 0.52, size: 80 }], bids: [{ price: 0.51, size: 80 }] },
    };
    // feeParams rate 0 so sell fees don't kill the 0.05 premium
    const s = evaluateArbSurfaces(depth, {}, { rate: 0, exponent: 1 }, { minBidPremium: 0.02, marginPct: 0.01 });
    expect(s.stage2Bid.sum).toBeCloseTo(1.05, 5);
    expect(s.stage2Bid.actionable).toBe(true);
    expect(s.bestStage).toBe('bid');

    const opp = evaluateReverseBidOpportunity({
      depth,
      maxBudgetUsd: 40,
      feeParams: { rate: 0, exponent: 1 },
      minBidPremium: 0.02,
      marginPct: 0.01,
      minPackageUsd: 10,
    });
    expect(opp).not.toBeNull();
    expect(opp!.lockedProfitUsd).toBeGreaterThan(0);
    expect(opp!.mintCost).toBe(opp!.shares);
  });

  it('does not treat single-leg bid/ask as locked arb', () => {
    const depth = {
      up: { bestAsk: 0.60, bestBid: 0.50 },
      down: { bestAsk: 0.50, bestBid: 0.40 },
    };
    const s = evaluateArbSurfaces(depth, {}, 'crypto', { minGap: 0.2 });
    expect(s.up.crossable).toBe(false);
    expect(s.stage1Ask.actionable).toBe(false);
  });
});
