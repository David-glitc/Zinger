import { describe, it, expect } from 'vitest';
import {
  evaluateArbOpportunity,
  touchArbGap,
  cloneDepth,
  consumeOpportunityDepth,
  hasRealAskLadders,
  consumeAskShares,
} from '../../src/polymarket/arbDepth.js';

const ladder = (levels) => levels.map(([price, size]) => ({ price, size, value: price * size }));

describe('arbDepth', () => {
  it('touchArbGap reports gap at best ask', () => {
    const g = touchArbGap({ up: { bestAsk: 0.34 }, down: { bestAsk: 0.62 } }, {});
    expect(g.gap).toBeCloseTo(0.04, 3);
  });

  it('finds arb after walking both ladders', () => {
    const depth = {
      up: {
        bestAsk: 0.34,
        asks: ladder([[0.34, 200], [0.36, 100]]),
      },
      down: {
        bestAsk: 0.62,
        asks: ladder([[0.62, 200], [0.64, 100]]),
      },
    };
    const opp = evaluateArbOpportunity({
      depth,
      maxBudgetUsd: 50,
      feeParams: 'crypto',
      marginPct: 0.003,
      minGap: 0.006,
    });
    expect(opp).not.toBeNull();
    expect(opp.shares).toBeGreaterThan(0);
    expect(opp.lockedProfitUsd).toBeGreaterThan(0);
    expect(opp.upAsk).toBeGreaterThanOrEqual(0.34);
    expect(opp.downAsk).toBeGreaterThanOrEqual(0.62);
  });

  it('rejects when ask sum is above parity', () => {
    const depth = {
      up: { bestAsk: 0.51, asks: ladder([[0.51, 50]]) },
      down: { bestAsk: 0.50, asks: ladder([[0.50, 50]]) },
    };
    const opp = evaluateArbOpportunity({
      depth,
      maxBudgetUsd: 40,
      feeParams: 'crypto',
      marginPct: 0.005,
      minGap: 0.008,
    });
    expect(opp).toBeNull();
  });

  it('refuses synthetic touch ladders when requireRealLadder', () => {
    const depth = {
      up: { bestAsk: 0.34 },
      down: { bestAsk: 0.62 },
    };
    expect(hasRealAskLadders(depth)).toBe(false);
    const opp = evaluateArbOpportunity({
      depth,
      maxBudgetUsd: 100,
      feeParams: 'crypto',
      marginPct: 0.002,
      minGap: 0.005,
      requireRealLadder: true,
    });
    expect(opp).toBeNull();
  });

  it('respects targetBudgetUsd for package slicing', () => {
    const depth = {
      up: { bestAsk: 0.40, asks: ladder([[0.40, 500]]) },
      down: { bestAsk: 0.55, asks: ladder([[0.55, 500]]) },
    };
    const opp = evaluateArbOpportunity({
      depth,
      maxBudgetUsd: 200,
      targetBudgetUsd: 100,
      feeParams: 'crypto',
      marginPct: 0.002,
      minGap: 0.005,
    });
    expect(opp).not.toBeNull();
    expect(opp.totalCost).toBeLessThanOrEqual(105);
  });

  it('rejects packages below minPackageUsd', () => {
    const depth = {
      up: { bestAsk: 0.40, asks: ladder([[0.40, 5]]) },
      down: { bestAsk: 0.55, asks: ladder([[0.55, 5]]) },
    };
    const opp = evaluateArbOpportunity({
      depth,
      maxBudgetUsd: 100,
      feeParams: 'crypto',
      marginPct: 0.002,
      minGap: 0.005,
      minPackageUsd: 50,
    });
    expect(opp).toBeNull();
  });

  it('consumeOpportunityDepth leaves residual for a second package', () => {
    const depth = cloneDepth({
      up: { bestAsk: 0.40, asks: ladder([[0.40, 400]]) },
      down: { bestAsk: 0.55, asks: ladder([[0.55, 400]]) },
    });
    const first = evaluateArbOpportunity({
      depth,
      maxBudgetUsd: 100,
      targetBudgetUsd: 100,
      feeParams: 'crypto',
      marginPct: 0.002,
      minGap: 0.005,
    });
    expect(first).not.toBeNull();
    consumeOpportunityDepth(depth, first);
    const second = evaluateArbOpportunity({
      depth,
      maxBudgetUsd: 100,
      targetBudgetUsd: 100,
      feeParams: 'crypto',
      marginPct: 0.002,
      minGap: 0.005,
    });
    expect(second).not.toBeNull();
    expect(second.shares).toBeGreaterThan(0);
  });

  it('consumeAskShares removes size from top of book', () => {
    const side = { asks: ladder([[0.4, 10], [0.41, 10]]), bestAsk: 0.4 };
    const taken = consumeAskShares(side, 12);
    expect(taken).toBeCloseTo(12, 5);
    expect(side.asks[0].price).toBeCloseTo(0.41, 5);
    expect(side.asks[0].size).toBeCloseTo(8, 5);
  });
});
