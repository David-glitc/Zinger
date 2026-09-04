import { describe, expect, it } from 'vitest';
import { covarianceFromReturns, markowitzWeights, portfolioSharpe } from '../../src/polymarket/markowitz.js';

describe('markowitzWeights', () => {
  it('allocates more to the higher-expectancy asset when covariance is equal', () => {
    const w = markowitzWeights([0.08, 0.04], [[0.01, 0], [0, 0.01]], 1);
    expect(w.length).toBe(2);
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[0] + w[1]).toBeCloseTo(1, 5);
  });

  it('down-weights correlated assets', () => {
    const w = markowitzWeights([0.06, 0.06], [[0.01, 0.009], [0.009, 0.01]], 1);
    expect(w[0]).toBeCloseTo(0.5, 1);
    expect(portfolioSharpe(w, [0.06, 0.06], [[0.01, 0.009], [0.009, 0.01]])).toBeGreaterThan(0);
  });

  it('builds covariance from return series', () => {
    const cov = covarianceFromReturns([[0.01, -0.02, 0.01], [0.005, -0.01, 0.008]]);
    expect(cov[0][0]).toBeGreaterThan(0);
    expect(cov[1][1]).toBeGreaterThan(0);
  });
});
