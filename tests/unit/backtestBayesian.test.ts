import { describe, it, expect } from 'vitest';
import {
  createBayesianState,
  recordTradeSample,
  suggestConfigPatches,
  applyBayesianLoop,
} from '../../src/polymarket/backtest/bayesian.js';

describe('backtest bayesian', () => {
  it('tightens config after losing streak', () => {
    const state = createBayesianState();
    const baseCfg = { minConfidence: 0.18, kellyFraction: 0.12, maxPrice: 0.35 };
    for (let i = 0; i < 35; i++) {
      recordTradeSample(state, {
        asset: 'BTC',
        confidence: 0.2,
        entryPrice: 0.30,
        netPnl: -8,
        method: 'directional',
      });
    }
    const { patches } = suggestConfigPatches(state, baseCfg);
    expect(patches.minConfidence).toBeGreaterThan(baseCfg.minConfidence);
    expect(patches.kellyFraction).toBeLessThan(baseCfg.kellyFraction);
  });

  it('applyBayesianLoop patches at interval', () => {
    const state = createBayesianState();
    let cfg = { minConfidence: 0.18, kellyFraction: 0.12 };
    for (let i = 0; i < 40; i++) {
      recordTradeSample(state, { asset: 'ETH', confidence: 0.16, entryPrice: 0.28, netPnl: -5 });
      cfg = applyBayesianLoop(state, cfg, { every: 40 });
    }
    expect(state.updates.length).toBeGreaterThanOrEqual(1);
  });
});
