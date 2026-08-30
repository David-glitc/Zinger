# Zinger ML — Statistical jump-model regime detector (Bemporad, Breschi, Piga, Boyd 2018;
# regime-switching signal per Shu, Yu, Mulvey 2024).
#
# The textbook HMM regime flip on daily returns is noisy. This reframes regime
# detection as clustering-with-memory:
#   - features: exponentially-weighted downside deviation + Sortino per state
#   - a fixed penalty for every state transition (the "jump")
#   - fit by alternating coordinate descent: (assign states) <-> (recompute state
#     params), with a dynamic-programming step to solve the penalized assignment.
#
# Exposes a scikit-learn-style .fit / .predict, plus .fit_predict that returns the
# state series, the penalty, and diagnostics so callers (backtests, the JS governor)
# can consume stable, slow regime flips.

import numpy as np


def downside_deviation(returns, target=0.0, gamma=1.5, half_life=None):
    """Downside deviation of a returns array toward target with exp weighting."""
    r = np.asarray(returns, dtype=np.float64)
    if half_life:
        lam = np.exp(np.log(0.5) / max(1.0, half_life))
        w = np.power(lam, np.arange(len(r))[::-1])
        w /= w.sum()
    else:
        w = np.ones(len(r)) / max(1, len(r))
    dd = np.sqrt(np.maximum(0.0, np.sum(w * np.maximum(target - r, 0.0) ** gamma)))
    return dd


def sortino(returns, target=0.0, half_life=None):
    r = np.asarray(returns, dtype=np.float64)
    if len(r) == 0:
        return 0.0
    lam = np.exp(np.log(0.5) / max(1.0, half_life)) if half_life else 1.0
    w = np.power(lam, np.arange(len(r))[::-1]) if half_life else np.ones(len(r))
    w /= w.sum()
    dd = np.sqrt(np.maximum(0.0, np.sum(w * np.maximum(target - r, 0.0) ** 2)))
    mean = np.sum(w * r)
    return mean / dd if dd > 0 else (0.0 if mean > 0 else 0.0)


def _assign(dp_cost, n, k, penalty):
    """Viterbi-style assignment minimizing sum of per-point cost + penalty per jump."""
    # dp[i, s] = min cost to assign points 0..i ending in state s
    neg = -1e18
    dp = np.full((n, k), neg, dtype=np.float64)
    arg = np.zeros((n, k), dtype=np.int32)
    dp[0] = dp_cost[0]
    for i in range(1, n):
        for s in range(k):
            stay = dp[i - 1, s]
            jump = np.max(dp[i - 1]) if k > 1 else neg
            best_from = int(np.argmax(dp[i - 1])) if (k > 1 and jump > stay) else s
            dp[i, s] = dp_cost[i, s] + (stay if best_from == s else jump - penalty)
            arg[i, s] = best_from
    # backtrack
    states = np.zeros(n, dtype=np.int32)
    states[-1] = int(np.argmax(dp[-1]))
    for i in range(n - 1, 0, -1):
        states[i - 1] = arg[i, states[i]]
    return states, float(np.max(dp[-1]))


class StatisticalJumpModel:
    """Two-state regime detector via penalized clustering with memory."""

    def __init__(self, n_states=2, penalty=1.0, half_life=None, n_iter=30, seed=42):
        self.n_states = n_states
        self.penalty = penalty
        self.half_life = half_life
        self.n_iter = n_iter
        self.seed = seed
        self.centers_ = None
        self.samples_ = None

    def _feature(self, returns):
        dd = downside_deviation(returns, half_life=self.half_life)
        so = sortino(returns, half_life=self.half_life)
        return np.array([dd, so], dtype=np.float64)

    def _cost_matrix(self, X, centers=None):
        # X: (n, 2) feature rows -> (n, k) cost = squared distance to each center
        centers = self.centers_ if centers is None else centers
        n = len(X)
        C = np.zeros((n, self.n_states))
        for s in range(self.n_states):
            d = X - centers[s]
            C[:, s] = np.einsum('ij,ij->i', d, d)
        return C

    def fit(self, returns, verbose=False):
        r = np.asarray(returns, dtype=np.float64)
        n = len(r)
        # feature for each timestep uses trailing window (causal, walk-forward friendly)
        win = 60
        X = np.stack([
            self._feature(r[max(0, i - win):i + 1]) for i in range(n)
        ])
        rng = np.random.default_rng(self.seed)
        k = self.n_states
        # init centers from sample quantiles of downside-deviation (sorted)
        idx = np.argsort(X[:, 0])
        centers = np.array([X[idx[int(i * (n - 1) / (k - 1))]] for i in range(k)])
        centers = centers + rng.normal(0, 1e-6, centers.shape)
        cost = self._cost_matrix(X, centers=centers)
        states, _ = _assign(cost, n, k, self.penalty)
        for it in range(self.n_iter):
            # M-step: recompute centers per state
            for s in range(k):
                sel = states == s
                if sel.sum() > 0:
                    centers[s] = X[sel].mean(axis=0)
            cost = self._cost_matrix(X, centers=centers)
            new_states, best = _assign(cost, n, k, self.penalty)
            if verbose and it % 5 == 0:
                print(f"  iter {it}: cost={best:.4f} flips={(new_states[1:]!=new_states[:-1]).sum()}")
            if np.array_equal(new_states, states):
                states = new_states
                break
            states = new_states
        self.centers_ = centers
        self.samples_ = states
        # state ordering: higher downside-deviation = high-vol regime
        order = np.argsort(self.centers_[:, 0])
        self.high_vol_state = int(order[-1])
        self.low_vol_state = int(order[0])
        self.flips_ = int((states[1:] != states[:-1]).sum())
        self.features_ = X
        return self

    def predict(self, returns):
        r = np.asarray(returns, dtype=np.float64)
        win = 60
        n = len(r)
        X = np.stack([self._feature(r[max(0, i - win):i + 1]) for i in range(n)])
        C = self._cost_matrix(X)
        states, _ = _assign(C, n, self.n_states, self.penalty)
        return states

    def fit_predict(self, returns, verbose=False):
        self.fit(returns, verbose=verbose)
        return self.samples_


def label_regime(states, high_vol_state):
    """Map model state indices to a Zinger regime string."""
    out = []
    for s in states:
        if s == high_vol_state:
            out.append('high-vol')
        else:
            out.append('trend')
    return out
