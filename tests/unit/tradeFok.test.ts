import { describe, it, expect } from 'vitest';
import { sellFloor, readSellFill } from '../../src/polymarket/trade.js';

describe('trade FOK helpers', () => {
  it('sellFloor ticks below mark', () => {
    expect(sellFloor(0.50, { tickSize: 0.01, slippagePct: 0.2 })).toBeCloseTo(0.40, 5);
    expect(sellFloor(0, { tickSize: 0.01 })).toBeCloseTo(0.01, 5);
  });

  it('readSellFill recovers price from receipt amounts', () => {
    // 10 shares sold for $4 → fill 0.40 (scale-invariant ratio)
    const fill = readSellFill({ makingAmount: '10', takingAmount: '4' }, 10);
    expect(fill.fillPrice).toBeCloseTo(0.4, 5);
    expect(fill.filledShares).toBeCloseTo(10, 5);
  });
});
