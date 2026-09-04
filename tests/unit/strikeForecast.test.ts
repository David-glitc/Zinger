// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  normalCdf,
  realizedVolPerMinute,
  forecastAboveStrike,
  strikeEdge,
  MIN_TAU_SEC,
  MAX_PROB,
  MAX_SPOT_AGE_MS,
  MAX_PLAUSIBLE_EDGE,
  volPerMinuteFromSignal,
  ATR_TO_SIGMA,
} from '../../src/polymarket/strikeForecast.js';

describe('normalCdf', () => {
  it('is 0.5 at zero and symmetric', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1) + normalCdf(-1)).toBeCloseTo(1, 5);
  });

  it('matches known standard normal values', () => {
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-2.576)).toBeCloseTo(0.005, 3);
  });

  it('does not blow up in the tails', () => {
    expect(normalCdf(10)).toBeCloseTo(1, 6);
    expect(normalCdf(-10)).toBeCloseTo(0, 6);
  });

  it('returns 0.5 rather than NaN on bad input', () => {
    expect(normalCdf(undefined)).toBe(0.5);
  });
});

describe('realizedVolPerMinute', () => {
  const flat = Array.from({ length: 40 }, () => ({ close: 100 }));
  const noisy = Array.from({ length: 40 }, (_, i) => ({ close: 100 * (1 + 0.001 * ((i % 2) ? 1 : -1)) }));

  it('returns null on a perfectly flat series rather than zero', () => {
    // Zero vol would divide-by-zero downstream; null is the honest answer.
    expect(realizedVolPerMinute(flat)).toBeNull();
  });

  it('returns a positive stdev on a moving series', () => {
    const v = realizedVolPerMinute(noisy);
    expect(v).toBeGreaterThan(0);
  });

  it('scales with the size of the moves', () => {
    const big = Array.from({ length: 40 }, (_, i) => ({ close: 100 * (1 + 0.01 * ((i % 2) ? 1 : -1)) }));
    expect(realizedVolPerMinute(big)).toBeGreaterThan(realizedVolPerMinute(noisy));
  });

  it('returns null without enough candles', () => {
    expect(realizedVolPerMinute([{ close: 1 }, { close: 2 }])).toBeNull();
  });
});

describe('forecastAboveStrike', () => {
  const base = { spot: 100, strike: 100, secondsRemaining: 300, volPerMinute: 0.001 };

  it('is a coin flip when spot sits exactly on the strike', () => {
    expect(forecastAboveStrike(base).probUp).toBeCloseTo(0.5, 6);
  });

  it('is above 0.5 when spot is above the strike', () => {
    expect(forecastAboveStrike({ ...base, spot: 100.2 }).probUp).toBeGreaterThan(0.5);
  });

  it('is below 0.5 when spot is below the strike', () => {
    expect(forecastAboveStrike({ ...base, spot: 99.8 }).probUp).toBeLessThan(0.5);
  });

  // The core of the model: the same gap is more decisive with less time left.
  it('becomes more confident as time runs out for a fixed gap', () => {
    const far = forecastAboveStrike({ ...base, spot: 100.2, secondsRemaining: 300 });
    const near = forecastAboveStrike({ ...base, spot: 100.2, secondsRemaining: 60 });
    expect(near.probUp).toBeGreaterThan(far.probUp);
  });

  // And less decisive when the market is moving around more.
  it('becomes less confident as volatility rises for a fixed gap', () => {
    const calm = forecastAboveStrike({ ...base, spot: 100.2, volPerMinute: 0.0005 });
    const wild = forecastAboveStrike({ ...base, spot: 100.2, volPerMinute: 0.005 });
    expect(wild.probUp).toBeLessThan(calm.probUp);
  });

  it('caps certainty so a near-decided window cannot claim 0.999', () => {
    const f = forecastAboveStrike({ ...base, spot: 130, secondsRemaining: 25 });
    expect(f.probUp).toBeLessThanOrEqual(MAX_PROB);
  });

  it('probUp and probDown sum to one', () => {
    const f = forecastAboveStrike({ ...base, spot: 100.1 });
    expect(f.probUp + f.probDown).toBeCloseTo(1, 9);
  });

  describe('refuses rather than guessing', () => {
    it('returns null below the minimum horizon', () => {
      expect(forecastAboveStrike({ ...base, secondsRemaining: MIN_TAU_SEC - 1 })).toBeNull();
    });

    it('returns null on stale spot', () => {
      expect(forecastAboveStrike({ ...base, spotAgeMs: MAX_SPOT_AGE_MS + 1 })).toBeNull();
    });

    it('returns null on a missing strike or spot', () => {
      expect(forecastAboveStrike({ ...base, strike: 0 })).toBeNull();
      expect(forecastAboveStrike({ ...base, spot: undefined })).toBeNull();
    });

    it('returns null when vol is unavailable', () => {
      expect(forecastAboveStrike({ ...base, volPerMinute: null })).toBeNull();
    });
  });
});

describe('volPerMinuteFromSignal', () => {
  it('converts ATR percent to a sigma, discounting the range-to-stdev factor', () => {
    const v = volPerMinuteFromSignal({ volatility: { atrPct: 0.03 } });
    expect(v).toBeCloseTo((0.03 / 100) / ATR_TO_SIGMA, 10);
  });

  // Using ATR directly as sigma would overstate vol and flatten every forecast.
  it('yields a smaller sigma than the raw ATR fraction', () => {
    expect(volPerMinuteFromSignal({ volatility: { atrPct: 0.03 } })).toBeLessThan(0.0003);
  });

  it('prefers measured candle vol when it is available', () => {
    const candles = Array.from({ length: 40 }, (_, i) => ({ close: 100 * (1 + 0.01 * ((i % 2) ? 1 : -1)) }));
    const measured = volPerMinuteFromSignal({ volatility: { atrPct: 0.03 } }, candles);
    expect(measured).toBeGreaterThan(0.001);
  });

  it('returns null when neither source is present', () => {
    expect(volPerMinuteFromSignal({}, null)).toBeNull();
    expect(volPerMinuteFromSignal({ volatility: { atrPct: 0 } })).toBeNull();
  });
});

describe('strikeEdge', () => {
  it('is positive when the model is more bullish than the price', () => {
    const e = strikeEdge({ probUp: 0.70, price: 0.55, outcome: 'up' });
    expect(e.grossEdge).toBeCloseTo(0.15, 6);
    expect(e.netEdge).toBeLessThan(e.grossEdge);
  });

  it('inverts the model probability for the down side', () => {
    const e = strikeEdge({ probUp: 0.70, price: 0.25, outcome: 'down' });
    expect(e.modelProb).toBeCloseTo(0.30, 6);
    expect(e.grossEdge).toBeCloseTo(0.05, 6);
  });

  // The measured failure mode: a gross edge smaller than the fee is a loss.
  it('turns a thin gross edge negative once fees are charged', () => {
    const e = strikeEdge({ probUp: 0.53, price: 0.50, outcome: 'up' });
    expect(e.grossEdge).toBeCloseTo(0.03, 6);
    expect(e.netEdge).toBeLessThan(0);
  });

  it('charges less on a settlement exit than on a round trip', () => {
    const settle = strikeEdge({ probUp: 0.7, price: 0.5, exitIsSettlement: true });
    const round = strikeEdge({ probUp: 0.7, price: 0.5, exitIsSettlement: false });
    expect(settle.feeFrac).toBeLessThan(round.feeFrac);
    expect(round.feeFrac).toBeCloseTo(settle.feeFrac * 2, 9);
  });

  // Fee is rate * (1 - p), so expensive contracts are cheaper to trade.
  it('charges a smaller fee fraction at a higher price', () => {
    const cheap = strikeEdge({ probUp: 0.9, price: 0.80 });
    const dear = strikeEdge({ probUp: 0.9, price: 0.40 });
    expect(cheap.feeFrac).toBeLessThan(dear.feeFrac);
  });

  // A large edge means our spot disagrees with the resolution feed, not that
  // the market is wrong. Observed live: model 67% against a 7.5c ask.
  describe('plausibility bound', () => {
    it('flags an edge too large to be a real mispricing', () => {
      const e = strikeEdge({ probUp: 0.674, price: 0.075, outcome: 'up' });
      expect(e.grossEdge).toBeGreaterThan(0.5);
      expect(e.implausible).toBe(true);
    });

    it('flags an implausibly negative edge too, since one bad spot causes both', () => {
      const e = strikeEdge({ probUp: 0.326, price: 0.925, outcome: 'up' });
      expect(e.grossEdge).toBeLessThan(-0.5);
      expect(e.implausible).toBe(true);
    });

    it('leaves a realistic few-cent edge usable', () => {
      const e = strikeEdge({ probUp: 0.56, price: 0.52, outcome: 'up' });
      expect(e.implausible).toBe(false);
    });

    it('keeps an edge just inside the boundary and rejects one just outside', () => {
      const inside = strikeEdge({ probUp: 0.50 + MAX_PLAUSIBLE_EDGE - 0.005, price: 0.50 });
      const outside = strikeEdge({ probUp: 0.50 + MAX_PLAUSIBLE_EDGE + 0.005, price: 0.50 });
      expect(inside.implausible).toBe(false);
      expect(outside.implausible).toBe(true);
    });

    // The decided-window case, where model and market genuinely agree.
    it('treats close agreement on a near-settled window as plausible', () => {
      const e = strikeEdge({ probUp: 0.03, price: 0.005, outcome: 'up' });
      expect(e.implausible).toBe(false);
    });
  });

  it('returns null on an out-of-domain price', () => {
    expect(strikeEdge({ probUp: 0.6, price: 0 })).toBeNull();
    expect(strikeEdge({ probUp: 0.6, price: 1 })).toBeNull();
  });
});
