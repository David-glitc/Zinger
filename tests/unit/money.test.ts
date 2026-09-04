// @ts-nocheck
/**
 * A loss must never be printable as a gain.
 *
 * The bug this pins: `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}` rendered
 * a $1.44 loss as `$1.44` and a $1.44 gain as `+$1.44` — the only difference a
 * single leading character, in the scan log an operator reads to decide whether
 * the strategy is working.
 */
import { describe, it, expect } from 'vitest';
import { signedUsd, usd } from '../../src/lib/money.js';

describe('signedUsd', () => {
  it('always shows the sign, outside the currency symbol', () => {
    expect(signedUsd(1.44)).toBe('+$1.44');
    expect(signedUsd(-1.44)).toBe('-$1.44');
  });

  it('never renders a loss the same as a gain of equal magnitude', () => {
    for (const v of [0.01, 0.5, 1.44, 12.5, 999.99]) {
      expect(signedUsd(-v)).not.toBe(signedUsd(v));
      expect(signedUsd(-v).startsWith('-')).toBe(true);
      expect(signedUsd(v).startsWith('+')).toBe(true);
    }
  });

  it('never emits a sign inside the amount', () => {
    for (const v of [-1.44, -0.01, -1000]) {
      expect(signedUsd(v)).not.toContain('$-');
    }
  });

  it('treats zero and negative zero as a non-negative zero', () => {
    expect(signedUsd(0)).toBe('+$0.00');
    expect(signedUsd(-0)).toBe('+$0.00');
  });

  it('degrades non-finite input to zero rather than printing NaN', () => {
    for (const v of [NaN, Infinity, -Infinity, null, undefined, 'abc']) {
      expect(signedUsd(v)).toBe('+$0.00');
    }
  });
});

describe('usd', () => {
  it('omits the plus on gains but keeps the minus outside the symbol', () => {
    expect(usd(1.44)).toBe('$1.44');
    expect(usd(-1.44)).toBe('-$1.44');
    expect(usd(-0)).toBe('$0.00');
  });
});
