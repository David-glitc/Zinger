// @ts-nocheck
/**
 * Mean-variance (Markowitz) portfolio weights for multi-asset directional exposure.
 *
 * Used when the bot holds correlated BTC/ETH positions simultaneously: instead of
 * sizing each leg independently, allocate bankroll across assets by expected
 * return vs covariance — higher Sharpe, lower concentration in one direction.
 *
 * This is exploratory scaffolding; the scan loop still sizes per-market today.
 * Wire-in point: after signal collection in scan/inputs, before directional entries.
 */

/**
 * Solve unconstrained mean-variance weights: w ∝ Σ⁻¹ μ, then normalize to simplex.
 * @param {number[]} expectedReturns — per-asset expected edge (e.g. confidence-adjusted)
 * @param {number[][]} covariance — symmetric positive (semi)definite
 * @param {number} [riskAversion=1] — λ; higher → smaller positions
 * @returns {number[]} weights summing to 1 (or zeros if degenerate)
 */
export function markowitzWeights(expectedReturns, covariance, riskAversion = 1) {
  const n = expectedReturns.length;
  if (!n || n !== covariance.length) return [];
  const mu = expectedReturns.map(Number);
  const cov = covariance.map((row) => row.map(Number));
  const inv = invertMatrix(regularize(cov, 1e-6));
  if (!inv) return uniform(n);

  const raw = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) raw[i] += inv[i][j] * mu[j];
  }
  const scale = Math.max(riskAversion, 1e-6);
  const scaled = raw.map((w) => w / scale);
  return projectSimplex(scaled.map((w) => Math.max(0, w)));
}

/** Sharpe of a weight vector under μ, Σ (annualization factor optional). */
export function portfolioSharpe(weights, expectedReturns, covariance, rf = 0) {
  const muP = dot(weights, expectedReturns) - rf;
  const varP = quadraticForm(weights, covariance);
  const sd = Math.sqrt(Math.max(varP, 1e-12));
  return muP / sd;
}

function uniform(n) {
  return new Array(n).fill(1 / n);
}

function dot(a, b) {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function quadraticForm(w, cov) {
  let s = 0;
  for (let i = 0; i < w.length; i++) {
    for (let j = 0; j < w.length; j++) s += w[i] * cov[i][j] * w[j];
  }
  return s;
}

function regularize(m, eps) {
  return m.map((row, i) => row.map((v, j) => v + (i === j ? eps : 0)));
}

function projectSimplex(v) {
  const n = v.length;
  const sorted = [...v].sort((a, b) => b - a);
  let cssv = 0;
  let rho = -1;
  let theta = 0;
  for (let i = 0; i < n; i++) {
    cssv += sorted[i];
    const t = (cssv - 1) / (i + 1);
    if (sorted[i] - t > 0) {
      rho = i;
      theta = t;
    }
  }
  return v.map((x) => Math.max(0, x - theta));
}

/** Gauss-Jordan invert (small n only — BTC/ETH is n=2). */
function invertMatrix(m) {
  const n = m.length;
  const aug = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }
    if (Math.abs(aug[pivot][col]) < 1e-12) return null;
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map((row) => row.slice(n));
}

/**
 * Build a 2×2 covariance from recent return series (e.g. 1m log returns).
 * @param {number[][]} returnSeries — [asset][t]
 */
export function covarianceFromReturns(returnSeries) {
  const n = returnSeries.length;
  const out = Array.from({ length: n }, () => new Array(n).fill(0));
  const means = returnSeries.map((rs) => rs.reduce((a, b) => a + b, 0) / Math.max(1, rs.length));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let c = 0;
      const len = Math.min(returnSeries[i].length, returnSeries[j].length);
      for (let t = 0; t < len; t++) {
        c += (returnSeries[i][t] - means[i]) * (returnSeries[j][t] - means[j]);
      }
      c /= Math.max(1, len - 1);
      out[i][j] = out[j][i] = c;
    }
  }
  return out;
}
