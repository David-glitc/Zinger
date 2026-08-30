# Zinger ML — Emit a live regime signal consumed by the JS governor.
# Fits the statistical jump model on the latest cached OHLCV and writes the
# current regime label, idio-vol tilt, and enough context for the governor to
# override its heuristic.
#
# Written through the shared SQLite store (data/zinger.db, docs table) under the
# key `regime_signal.json`, matching every other ML script and — crucially — the
# path `loadFileOrStore` reads on the Node side. Writing a bare JSON file here
# left the governor permanently blind on Node 22, where the store is sqlite.
#
# Usage: python3 ml/regime_emit.py [LINK/USDT|BTC/USDT|ETH/USDT] [1h|5m]

import sys
import json
import os

import numpy as np

sys.path.insert(0, "ml")
from data import load_cached
from regime_jump import StatisticalJumpModel, downside_deviation
from sqlite_store import store_save

STORE_KEY = "regime_signal.json"


def main():
    symbol = sys.argv[1] if len(sys.argv) > 1 else "BTC/USDT"
    tf = sys.argv[2] if len(sys.argv) > 2 else "1h"
    df = load_cached(symbol, tf)
    if df is None or len(df) < 200:
        print(f"No cached data for {symbol} {tf}")
        return 1

    close = df["close"].values.astype(np.float64)
    r = np.zeros(len(close)); r[1:] = np.diff(close) / close[:-1]

    mdl = StatisticalJumpModel(n_states=2, penalty=0.05, n_iter=30, seed=42)
    states = mdl.fit_predict(r)
    cur = int(states[-1])
    high_vol = cur == mdl.high_vol_state

    # realized downside vol over last ~6h for the tilt guardrail
    win = min(12, len(r))
    rv = downside_deviation(r[-win:], half_life=win)
    calm = downside_deviation(r[:win], half_life=win) if len(r) >= win else None

    regime = "high-vol" if high_vol else "trend"
    out = {
        "symbol": symbol,
        "timeframe": tf,
        "at": df.index[-1].isoformat(),
        "regime": regime,
        "highVol": high_vol,
        "flips": mdl.flips_,
        "highVolFraction": float((states == mdl.high_vol_state).mean()),
        "realizedVol": float(rv),
        "calmBaseline": None if calm is None else float(calm),
        "downsideDev": float(downside_deviation(r[-1:])),
        "lastPrice": float(close[-1]),
        "source": "statistical-jump-model",
    }
    store_save(STORE_KEY, out)
    print(json.dumps(out, indent=2))
    print(f"\nwrote {STORE_KEY} to the shared store")


if __name__ == "__main__":
    main()
