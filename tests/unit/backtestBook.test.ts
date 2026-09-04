import { describe, it, expect } from 'vitest';
import { fairProbUp, simulateMarketBooks } from '../../src/polymarket/backtest/bookSim.js';
import { evaluateArbOpportunity } from '../../src/polymarket/arbDepth.js';

describe('backtest bookSim', () => {
  it('fairProbUp rises when spot above strike', () => {
    const below = fairProbUp({ spot: 99_000, strike: 100_000, secondsRemaining: 120, atrPct: 0.03 });
    const above = fairProbUp({ spot: 101_000, strike: 100_000, secondsRemaining: 120, atrPct: 0.03 });
    expect(above).toBeGreaterThan(below);
  });

  it('injects arb gap when mispriceSeed is high', () => {
    const calm = simulateMarketBooks({ spot: 100_000, strike: 100_000, secondsRemaining: 180, mispriceSeed: 0.1 });
    const hot = simulateMarketBooks({ spot: 100_000, strike: 100_000, secondsRemaining: 180, mispriceSeed: 0.95 });
    expect(hot.gap).toBeGreaterThan(calm.gap);
    const opp = evaluateArbOpportunity({
      depth: hot.depth,
      prices: hot.prices,
      maxBudgetUsd: 200,
      marginPct: 0.003,
      minGap: 0.006,
    });
    if (hot.gap > 0.01) {
      expect(opp).not.toBeNull();
    }
  });

  it('builds ladder depth on both sides', () => {
    const book = simulateMarketBooks({ spot: 50_000, strike: 50_000, secondsRemaining: 200 });
    expect(book.depth.up.asks.length).toBeGreaterThan(2);
    expect(book.depth.down.asks.length).toBeGreaterThan(2);
    expect(book.depth.up.bestAsk).toBeGreaterThan(book.depth.up.bestBid);
  });
});
