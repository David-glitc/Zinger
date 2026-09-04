// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { buildDynamicPlan } from '../../src/polymarket/kelly.js';

/**
 * The 0.42–0.50 hole between the underdog and favorite hold-to-settle bands.
 *
 * Measured on 20 live paper closes 2026-08-30: every -20% loser entered in that
 * hole and was cut by the mid-window stop, while six of seven winners reached
 * 0.97–0.99. These tests pin the bands contiguous so an entry cannot silently
 * fall through to the stop grind again.
 */
const cfg = {
  holdToSettleUnderdogs: true,
  holdToSettleFavorites: true,
  underdogMaxPrice: 0.42,
  favoriteMinPrice: 0.50,
  favoriteMaxPrice: 0.72,
  minConfidence: 0.60,
  holdToSettleDisasterSlPct: 48,
  slPct: 21,
};
const plan = (price, confidence = 0.62) => buildDynamicPlan({
  cfg, price, analysis: {}, signal: { confidence },
});

describe('hold-to-settle price bands', () => {
  it('holds a cheap underdog below underdogMaxPrice', () => {
    expect(plan(0.38).holdToSettle).toBe(true);
  });

  it('holds a confident favorite inside the favorite band', () => {
    expect(plan(0.55).holdToSettle).toBe(true);
  });

  it.each([0.44, 0.45, 0.46, 0.47, 0.49])(
    'holds an entry at %s that used to fall into the dead zone',
    (price) => {
      const p = plan(price);
      expect(p.holdToSettle).toBe(true);
      // A dead-zone entry took slPct 21 and was cut for a certain loss.
      expect(p.slPct).toBe(48);
    },
  );

  it('leaves no price between the two bands unclaimed', () => {
    for (let price = 0.05; price <= 0.72; price += 0.01) {
      const rounded = Math.round(price * 100) / 100;
      expect(plan(rounded).holdToSettle, `price ${rounded} fell through`).toBe(true);
    }
  });

  it('still gates a rich favorite on confidence', () => {
    expect(plan(0.60, 0.40).holdToSettle).toBe(false);
  });

  it('does not extend the underdog ceiling when favorites are disabled', () => {
    const p = buildDynamicPlan({
      cfg: { ...cfg, holdToSettleFavorites: false },
      price: 0.46,
      analysis: {},
      signal: { confidence: 0.62 },
    });
    expect(p.holdToSettle).toBe(false);
  });

  it('targets settlement rather than a percentage take-profit when holding', () => {
    const p = plan(0.46);
    // 0.99 / 0.46 - 1 ≈ 115%
    expect(p.tpPct).toBeGreaterThan(100);
    expect(p.trailActivatePct).toBe(999);
  });
});
