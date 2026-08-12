# Zinger: A Real-Time LSTM-Driven Trading Terminal for Polymarket Binary Options

**Author:** Zinger Engineering  
**Date:** July 2026  
**Version:** 1.0

---

## Abstract

We present Zinger, a production-grade automated trading system for Polymarket binary "Up/Down" options. The system combines a 12-model LSTM ensemble with a real-time React terminal, an ONNX inference engine, a reinforcement-learning (PPO) signal fuser, and a write-atomic persistence layer. Over a 20-hour paper-trading session (81 trades), the system generated a profit of +$11.75 with a 43.2% win rate and a profit factor of 1.16. All 12 ONNX models achieve a mean inference latency of 67.7 ms, enabling sub-second ensemble scoring on every tick. The RL fuser (10K PPO timesteps over 6 BTC models) achieves 87% of the rule-based baseline profit and deploys as a live inference endpoint. This thesis documents the architecture, the ML pipeline, the RL fuser, the frontend engineering, and the empirical performance of the system.

---

## 1. System Architecture

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────┐
│  Binance     │────▶│  Zinger Backend      │────▶│  Polymarket  │
│  (OHLCV)     │     │  (Express 5 / SSE)   │     │  (Binary CTF)│
└──────────────┘     │                      │     └──────────────┘
                     │  ┌─────────────────┐ │
                     │  │  Model Registry │ │
                     │  │  (12 ONNX lstm) │ │
                     │  │  + model health │ │
                     │  └─────────────────┘ │
                     │  ┌─────────────────┐ │
                     │  │  Persistence    │ │
                     │  │  (Atomic Writes)│ │
                     │  └─────────────────┘ │
                     │  ┌─────────────────┐ │
                     │  │  Signal Fuser   │ │
                     │  │  (Kelly Sizing) │ │
                     │  └─────────────────┘ │
                     └─────────────────────┘
                              │ SSE stream
                              ▼
                     ┌─────────────────────┐
                     │  Frontend           │
                     │  (React 19 / Vite)  │
                     │                     │
                     │  ┌───────────────┐  │
                     │  │ PolyDashboard │  │
                     │  │ + SystemFlow  │  │
                     │  │ + MlBay       │  │
                     │  + LadderPanel   │  │
                     │  │ + OrderPanel  │  │
                     │  └───────────────┘  │
                     └─────────────────────┘
```

### 1.1 Backend (Express 5)

The backend runs on port 3000 with a single-page architecture. All data flows through:

- **`/api/poly/state`** — Full system state (balances, positions, ladder prices, model health, trades) assembled by `bot.js::getState()`
- **`/api/poly/stream`** — Server-Sent Events (SSE) endpoint pushing incremental state updates at 200 ms intervals
- **`/api/poly/models`** — Per-model inference states (direction, confidence, status, error, run count)
- **WebSocket** — Order execution and position management

### 1.2 Frontend (React 19 + Vite 5)

The frontend is a single-page React application bundled with Vite. Key components:

| Component | Lines | Role |
|---|---|---|
| `PolyDashboard.jsx` | ~500 | Main orchestrator; fetches state, routes between Ladder/MlBay/SystemFlow/Charts |
| `SystemFlow.jsx` | ~300 | Excalidraw-style canvas with animated nodes and edges |
| `MlBay.jsx` | ~200 | ML dashboard showing per-model pills and asset-level signals |
| `LadderPanel.jsx` | ~300 | Polymarket order-book ladder UI |
| `ChartPanel.jsx` | ~250 | OHLCV chart with order annotations |

#### CLS (Cumulative Layout Shift) Optimization

The frontend was engineered for Core Web Vitals compliance:

| Technique | Implementation | Impact |
|---|---|---|
| Non-blocking font load | `<link rel="preconnect">` + `<link rel="preload">` + stylesheet with `media="print"` onload trick | Eliminated font-induced CLS |
| Content-visibility | `.poly-panel { content-visibility: auto; contain-intrinsic-size: 400px }` | Off-screen panels skip layout |
| Aspect-ratio containers | `.poly-chart-slot { aspect-ratio: 16/9; min-height: 300px }` | Charts don't collapse before data |
| CSS containment | Sidebar: `contain: layout size style` | Sidebar changes don't reflow main content |
| Layout-matched skeleton | Skeleton mirrors actual panel grid: `.poly-kpi-grid` 4-column, `.poly-panel` 2-column | No layout jump on state load |
| Scroll anchoring | `overflow-anchor: auto` on scrollable viewports | No jump during SSE updates |
| Manual chunk splitting | Vendor splitting: react, radix, icons, web3, query | 5 separate chunks, parallel download |

### 1.3 Persistence Layer

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  State Mut.  │────▶│  Write Queue  │────▶│  Disk (JSON)│
│  (bot.js)    │     │  (microtask)  │     │  atomic     │
└─────────────┘     └──────────────┘     │  write +    │
                                         │  rename     │
                                         └─────────────┘
```

The persistence module (`src/polymarket/persistence.js`) provides:

- **Write queue** — Mutations are enqueued and flushed on microtask (synchronous within the same tick)
- **Atomic writes** — Files are written to `.tmp` suffix, then `rename()` — the OS guarantees the final path is either the old or new content, never partial
- **Per-file coalescing** — Within a flush cycle, only the latest value per file key is written
- **Read-through with TTL fallback** — On read, stale data is served with a warning; no hard crash on corruption
- **`getAllPersisted()`** — Bulk load across all data type keys

This replaces the original ad-hoc `fs.writeFileSync` calls that risked partial writes on crash.

---

## 2. ML Pipeline

### 2.1 Data Pipeline

```
Binance OHLCV ──▶ features.py ──▶ dataset.py ──▶ train_lstm.py ──▶ .pt model
                     │                                                │
                     │                                        export_onnx.py
                     │                                                │
                     └──▶ onnxInference.js ◀─── .onnx ────────────────┘
```

**Data sources**: 6 parquet files covering BTC and ETH at 1m, 5m, and 1h resolutions (1000 rows each, Jul–Sep 2021). Live inference fetches 500 candles from Binance via CCXT.

### 2.2 Feature Engineering

The feature pipeline (`ml/features.py`, 269 lines) computes ~50 technical indicators per candle:

| Category | Indicators | Count |
|---|---|---|
| Moving Averages | SMA(5,10,20,50,100,200), EMA(5,10,20,50,100,200) | 12 |
| Crossover Signals | MA cross (10/50, 20/100), price-to-MA ratio | 4 |
| RSI | RSI(6,14,21) | 3 |
| MACD | MACD, signal, histogram | 3 |
| Bollinger Bands | Upper, lower, width, position, squeeze | 6 |
| Volatility | ATR, ATR%, volatility(5,10,20) | 5 |
| Trend Strength | ADX, PDI, NDI, trend signal | 4 |
| Momentum | Mom(1,3,5,10,20) | 5 |
| Rate of Change | ROC(5,10,20) | 3 |
| Volume | Vol SMA(5,10,20), ratio, spike flag | 5 |
| Price Action | HL range, gap, body, candle direction | 4 |

**Targets** (horizon-based forward returns):
- `fwd_ret_{h}` — Forward return over h steps
- `target_dir_{h}` — Sign of forward return (+1 / 0 / -1)

**Meta-features** (market regime classifier):
- `regime` — Trending up/down/ranging (-2 to +2)
- `vol_regime` — Volatility regime (high/medium/low)
- `liq_regime` — Liquidity regime (high/normal/low)
- `rsi_regime` — Overbought/oversold/neutral
- `dir_consistency_{5,10}` — Rolling directional consistency

### 2.3 Model Architecture

Each model is a 3-layer LSTM with meta-feature injection:

```
Input Sequence (seq_len × feat_dim)
         │
    ┌────┴────┐
    │  LSTM   │  hidden=256, layers=3, dropout=0.25
    │  Layer 1│
    └────┬────┘
         │
    ┌────┴────┐
    │  LSTM   │
    │  Layer 2│
    └────┬────┘
         │
    ┌────┴────┐
    │  LSTM   │
    │  Layer 3│
    └────┬────┘
         │
         ├─── Meta Embedder ────┐
         │    (meta_dim→64)     │
         └────────┬─────────────┘
                  │
           [LSTM_out ⊕ Meta_embed]
                  │
              ┌───┴───┐
              │  FC   │
              │  (3)  │
              └───┬───┘
                  │
            [p_down, p_neutral, p_up]
                  │
              ┌───┴───┐
              │  FC   │
              │  (1)  │  confidence
              └───┬───┘
                  │
              ┌───┴───┐
              │  FC   │
              │  (1)  │  expected_return
              └───────┘
```

### 2.4 Model Training

- **Framework**: PyTorch with Adam optimizer (lr=1e-4)
- **Batch size**: 256, **Epochs**: up to 100 with early stopping (patience=15)
- **Loss**: Cross-entropy on 3-class direction + MSE on expected return
- **Training history**: 12 models trained per-symbol per-timeframe per-horizon

### 2.5 ONNX Export & Inference

Each `.pt` model is exported to ONNX via `ml/export_onnx.py`:

- **Export architecture**: Auto-detects `feat_dim` and `meta_dim` from saved state dict via weight probing
- **Zero 1m models**: The 1m model failed (no .onnx in manifest); gracefully skipped
- **12 successful exports**: All 5m and 1h models for BTC and ETH

Inference runs via `onnxruntime-node` (`src/polymarket/onnxInference.js`):

```javascript
const { onnxInfer, onnxInferFromLive } = require('./onnxInference');
// Returns { probs: Float32Array(3), confidence: Float32Array(1), expectedReturn: Float32Array(1) }
```

---

## 3. Inference Performance

### 3.1 ONNX Latency Benchmark

All 12 models tested with 10 iterations each on live Binance data (2026-07-23):

| Model | Latency (ms) | p99 (ms) | t/put (ips) | Direction | Confidence |
|---|---|---|---|---|---|
| BTC/1h h1 | 37.61 | 84.44 | 26.6 | UP | 63.32% |
| BTC/1h h24 | 44.43 | 68.48 | 22.5 | UP | 37.40% |
| BTC/1h h4 | 46.90 | 126.04 | 21.3 | UP | 63.05% |
| BTC/5m h1 | 79.96 | 137.20 | 12.5 | UP | 63.00% |
| BTC/5m h12 | 80.76 | 117.79 | 12.4 | DOWN | 27.44% |
| BTC/5m h3 | 74.44 | 131.81 | 13.4 | DOWN | 50.19% |
| ETH/1h h1 | 41.09 | 71.21 | 24.3 | DOWN | 39.55% |
| ETH/1h h24 | 46.06 | 91.66 | 21.7 | DOWN | 30.01% |
| ETH/1h h4 | 47.71 | 67.58 | 21.0 | DOWN | 68.20% |
| ETH/5m h1 | 52.56 | 83.79 | 19.0 | UP | 66.57% |
| ETH/5m h12 | 123.18 | 151.26 | 8.1 | UP | 38.21% |
| ETH/5m h3 | 137.24 | 259.46 | 7.3 | UP | 38.88% |

**Aggregate:**

| Metric | Value |
|---|---|
| Mean latency | 67.66 ms |
| Min latency | 37.61 ms (BTC/1h h1) |
| Max latency | 137.24 ms (ETH/5m h3) |
| Mean throughput | 17.5 inferences/sec per model |
| Total sequential throughput | 210.1 ips |

**Key insight**: 1h models (avg 43.97 ms) are 2.1× faster than 5m models (avg 91.36 ms) due to shorter sequence length (64 vs 96) — the computational cost scales with `seq_len × hidden_dim`.

### 3.2 Practical Implications

At 200 ms polling, the system can run all 12 models serially in ~813 ms, or with 2× parallelization in ~407 ms — well within the 5-minute candle window. On a 5m candle boundary, there are 300 seconds to compute; even a worst-case 813 ms ensemble run occupies only 0.27% of the available time budget.

---

## 4. Trade Performance

### 4.1 Overall Results (20-hour paper trading session)

| Metric | Value |
|---|---|
| Total trades | 81 |
| Date range | 2026-07-21 14:36 UTC → 2026-07-22 10:15 UTC |
| Total PnL | **+$11.75** |
| Win rate | **43.2%** (35W / 46L) |
| Average win | +$2.42 |
| Average loss | -$1.58 |
| Profit factor | **1.16** |
| Max win | +$4.90 |
| Max loss | -$2.45 |

### 4.2 Symbol Breakdown

```
BTC: 40 trades  PnL=+$15.57  WR=50.0%
ETH: 41 trades  PnL= -$3.82  WR=36.6%
```

BTC trades generated all the profit. ETH underperformed with a negative PnL and a sub-40% win rate, suggesting the ETH model ensemble needs recalibration or alternate feature engineering.

### 4.3 Exit Analysis

| Exit | Trades | PnL | WR | Interpretation |
|---|---|---|---|---|
| TP (take profit) | 33 | +$83.30 | 100% | TP hits as designed |
| SL (stop loss) | 32 | -$72.81 | 0% | SLs are tight but precise |
| Panic | 13 | +$1.26 | 15.4% | Early exits salvage small wins |
| Rapid | 3 | $0.00 | 0% | Immediate reversals |

The TP/SL ratio is nearly 1:1 (33 vs 32), but the system's PnL is positive because average win ($2.42) exceeds average loss ($1.58). This is the hallmark of a system with positive expectancy despite a sub-50% win rate.

### 4.4 Confidence Calibration

| Confidence Band | Samples | Win Rate | PnL |
|---|---|---|---|
| 0.30–0.50 (low) | 69 | 46.4% | +$11.50 |
| 0.50–0.70 (medium) | 11 | 27.3% | +$0.25 |
| 0.70–0.90 (high) | 1 | 0.0% | $0.00 |

Most trades triggered at low-confidence signals (<0.50), which ironically had the best performance (46.4% WR, +$11.50). The small sample of high-confidence trades (1 trade above 0.70) suggests the confidence threshold needs adjustment — the system trades too eagerly on weak signals.

---

## 5. Model Consensus Analysis

Live inference on 2026-07-23 data reveals directional consensus:

### BTC Ensemble
```
4 models → UP
2 models → DOWN (5m h12, 5m h3)
Average confidence: 50.73%
Expected return: all positive (+0.0092 to +0.0981)
```
**Interpretation**: BTC has a bullish lean across timeframes. The 5m models show mixed signals (h1→UP, h12/h3→DOWN), which may reflect short-term mean reversion expectations within an upward trend.

### ETH Ensemble
```
3 models → UP (all 5m)
3 models → DOWN (all 1h)
Average confidence: 46.90%
Expected return: 1h negative, 5m positive
```
**Interpretation**: ETH exhibits a clear timeframe disagreement. The 1h models (long-term) predict downward movement while 5m models (short-term) predict upward — a classic trend-conflict pattern. The signal fuser must weigh these conflicting signals.

### Highest Conviction Predictions

| Model | Direction | Confidence | E[r] |
|---|---|---|---|
| ETH/1h h4 | DOWN | 68.20% | -0.076 |
| ETH/5m h1 | UP | 66.57% | +0.185 |
| BTC/1h h1 | UP | 63.32% | +0.098 |
| BTC/1h h4 | UP | 63.05% | +0.095 |
| BTC/5m h1 | UP | 63.00% | +0.009 |

The ETH/1h h4 model has the strongest conviction (68.2%), predicting a large down move. This conflicts with ETH/5m h1 (66.6% UP), creating a tie-breaking challenge for the signal fuser.

---

## 6. Risk Management Framework

### 6.1 Position Sizing

The system uses **Kelly Criterion** sizing with a conservative fraction:

| Parameter | Value |
|---|---|
| Kelly fraction | 0.38 |
| Bankroll reserve | 4% |
| Min position | $0.40 |
| Max position | $50.00 |
| Max position % of bankroll | 48% |
| Max position cap | $50.00 |

The 0.38 Kelly fraction means the system bets 38% of the theoretically optimal Kelly stake, a common conservative approach for live trading to account for estimation error in win probabilities.

### 6.2 Exit Rules

| Exit Type | Trigger | Effect |
|---|---|---|
| Take Profit (TP) | +18% to +42% gain | Full exit (or partial at 18%) |
| Stop Loss (SL) | -14% | Full exit |
| Partial TP | +18% (partialPct) | 30% position sold |
| Panic | Remaining time ≤20s / Adverse move | Emergency exit |
| Rapid | Immediate reversal after entry (<1 candle) | Flat exit |

### 6.3 Entry Filters

- **Min confidence**: 0.30 (any signal below this is rejected)
- **Max concurrent**: 3 positions per slug
- **Tight spread**: Order book spread must be narrow
- **Order book bias**: Directional bias from order book depth is factored in
- **Remaining time**: Trades only enter if ≥20 seconds remain in the candle

---

## 7. Reinforcement Learning Signal Fuser

### 7.1 Motivation

The rule-based ensemble fuser (Section 6) uses hardcoded timeframe weights (`1.5×` for 1m, `1.0×` for 5m, `0.7×` for 1h) that do not adapt to changing market conditions. In trending markets, short-term models should dominate; in ranging markets, longer-term models provide better signal. A static weighting scheme leaves PnL on the table.

An RL agent learns *which models to trust in which regime* through trial and error.

### 7.2 Architecture

```
6 LSTM Models ──┐
                 │
  Predictions    │  State: 6×3 + 5 + 1 = 24-dim
  (dir, conf,   ├──▶ PPO Policy ──▶ Action {DOWN, NEUTRAL, UP}
   expected_ret) │
                 │
  Regime         │
  Features ──────┘
```

The state vector encodes:
- **18 dims**: 6 models × {direction (-1/0/+1), confidence (0–1), expected_return}
- **5 dims**: market regime (trend dir, volatility, liquidity, RSI, directional consistency)
- **1 dim**: last action (temporal consistency)

The agent outputs one of three actions: DOWN (0), NEUTRAL (1), or UP (2). Reward is the directional PnL: `+magnitude` for correct, `-magnitude×0.8` for wrong, `0` for NEUTRAL.

### 7.3 Training Pipeline

```
1. Fetch fresh Binance data (3.5 days BTC 5m + 42 days BTC 1h)
2. Run all 6 LSTM models on every 5m position (batched: 1 pass/model)
3. Store model outputs + actual forward return → 545 training steps
4. Demean returns to remove trend bias
5. Train PPO (MlpPolicy, 24-dim state, 3 actions)
   10,000 timesteps, 80/20 train/eval split
```

**Training speed**: Batched inference generates all 545 positions × 6 models in ~80s total (vs ~3.8 hours if done sequentially). PPO training runs at ~50 FPS on CPU.

### 7.4 Performance Comparison

Evaluation on 20% holdout (109 steps):

| Metric | Rule-Based | RL Fuser | Delta |
|---|---|---|---|
| Win rate | 57.41% | 53.70% | -3.71% |
| Total profit | 1.876 | 1.627 | -0.249 |
| Profit factor | 2.05 | 1.92 | -0.13 |
| Sharpe ratio | 0.273 | 0.244 | -0.029 |
| Max drawdown | 0.408 | 0.408 | — |

The RL fuser achieves 87% of the rule-based baseline's profit with similar risk characteristics. This gap exists because:
1. **Limited training data**: 436 training steps (~36 hours of market data) is insufficient for the agent to learn nuanced regime-dependent fusion
2. **Equalized returns**: Demeaning removes trend bias but also removes a real signal (the agent can't learn "the trend is your friend")
3. **No GPU**: PPO training on CPU limits depth of exploration

### 7.5 Degeneracy Analysis

Without demeaning, the RL agent converges to an always-UP policy that achieves 1.80 profit (vs 1.91 baseline) — competitive but fragile. With demeaned returns, the agent learns a slightly DOWN-biased policy (103/108 DOWN actions) achieving 1.63 profit.

The degenerate convergence is a known PPO failure mode on financial time series, where the optimal policy on a finite sample is to exploit the dominant trend rather than learn genuine signal fusion. Solutions include:
- **Adversarial validation split**: Ensure train and eval have opposite trends
- **Synthetic data augmentation**: Bootstrap resample returns to balance directions
- **Regime-conditioned reward**: Penalize excessive directional concentration

### 7.6 Production Integration

The trained RL policy is deployed as a Python subprocess (`ml/rl_fuser_infer.py`) callable from Node.js via `predict.js::getRLSignal()`:

```javascript
const signal = await getRLSignal('BTC');
// { rl_direction, rl_label, rl_confidence, models, regime }
```

The inference pipeline:
1. Fetch live BTC 5m + 1h data from Binance (200 candles)
2. Compute features and run all 6 LSTM models
3. Build 24-dim state vector
4. Load PPO policy from `data/ml/models/rl_fuser_best/best_model.zip`
5. Return fused signal alongside per-model diagnostics

### 7.7 Future RL Improvements

1. **Multi-asset training**: Combine BTC + ETH data (12 models, 36-dim state) for a single cross-asset policy
2. **Recurrent PPO**: Use sb3_contrib's RecurrentPPO to give the agent memory of past states
3. **Position sizing head**: Add a continuous action head for Kelly fraction (not just direction)
4. **Online learning**: Fine-tune the policy on live trade outcomes
5. **CuDNN training**: GPU training would enable 100K+ timesteps in minutes

### 7.8 Key Files

| File | Purpose |
|---|---|
| `ml/rl_fuser_env.py` | Gymnasium environment (state/action/reward) |
| `ml/train_rl_fuser.py` | PPO training + baseline comparison |
| `ml/rl_fuser_infer.py` | Live inference for production bot |
| `data/ml/rl_fuser_steps.json` | 545 cached training steps |
| `data/ml/models/rl_fuser_best/best_model.zip` | Trained PPO policy |

---

## 8. Frontend Engineering

### 7.1 SystemFlow Visualization

The `SystemFlow.jsx` component renders an Excalidraw-style canvas with:

- **12 individual model pills** organized in 2 group nodes (BTC MODELS, ETH MODELS)
- Each pill shows: model label, direction arrow (↑/↓), confidence %, color-coded by status (running/success/error/idle)
- **Animated SVG edges** connecting models to signal fuser
- **HUD overlay** showing model count, active count, and health percentage
- **Hand/zoom controls** and fullscreen toggle

This replaces the original monolithic "ML LADDER" node, giving the operator per-model visibility.

### 7.2 MlBay Dashboard

The `MlBay.jsx` component provides a tabular view with:

- Asset-level columns (BTC, ETH)
- Signal direction arrows with color coding
- Confidence percentage bars
- Per-model pills expanded under each asset heading
- Live-updating via SSE pushes

### 7.3 CLS & Web Vitals

The frontend scored zero CLS (confirmed via Chrome DevTools Layout Shift tracking) through:

1. **Font loading**: `Inter` and `JetBrains Mono` loaded via `<link rel="preconnect">` to Google Fonts CDN, `<link rel="preload">` for the font files, and `<link rel="stylesheet">` with `media="print"` that swaps to `media="all"` on load
2. **Skeleton screens**: Exact layout match between skeleton state and loaded state, using the same grid structure (`.poly-kpi-grid` with `grid-template-columns: repeat(4, 1fr)`)
3. **CSS containment**: `contain: layout size style` on sidebar panels prevents layout reflow
4. **Content visibility**: `content-visibility: auto` with `contain-intrinsic-size` on lazy panels
5. **Manual code splitting**: Vite config splits vendor code into 5 logical chunks (`vendor-react`, `vendor-radix`, `vendor-icons`, `vendor-web3`, `vendor-query`) for parallel download

---

## 9. Data Integrity

### 8.1 From Ad-Hoc to Atomic

The original implementation used raw `fs.writeFileSync` for state persistence. This had two critical flaws:

1. **Partial writes**: If the process crashed mid-write, the JSON file could be truncated or corrupted
2. **No write ordering**: Concurrent mutations could interleave, producing garbage output

The new persistence module provides:

```
Mutation → Queue(microtask) → Coalesce per key → Write .tmp → rename → Done
```

The OS-level `rename()` syscall is atomic on POSIX filesystems — the target path either contains the old content or the new content, never partial data.

### 8.2 Model Registry & Health Tracking

The model registry (`modelRegistry.js`) maintains per-model state:

```javascript
{
  symbol,       // "BTC" | "ETH"
  timeframe,    // "5m" | "1h"
  horizon,      // 1 | 3 | 12 | 4 | 24
  status,       // "idle" | "running" | "success" | "error"
  direction,    // "up" | "down" | "neutral"
  confidence,   // 0.0 – 1.0
  error,        // last error message or null
  runCount,     // total invocations
}
```

The registry implements a listener pattern: `onModelChange(fn)` registers callbacks that fire on every state transition, which feeds directly into the SSE stream for real-time frontend updates.

---

## 10. Conclusions

### 9.1 What Worked

1. **Positive expectancy despite low win rate**: The system generated +$11.75 across 81 trades with a 43.2% win rate and 1.16 profit factor. This validates the risk-management approach: letting winners run and cutting losers short.

2. **ONNX inference performance**: 67.7 ms mean latency across 12 models enables real-time ensemble scoring on every tick. The 2:1 latency advantage of 1h models over 5m models (44 vs 91 ms) justifies the shorter sequence length design.

3. **CLS-free frontend**: Through a combination of non-blocking font loading, layout-matched skeletons, and CSS containment, the terminal achieves zero CLS.

4. **Atomic persistence**: The write-queue + temp-file + rename pattern eliminates data corruption risks.

### 9.2 What Didn't Work

1. **Confidence calibration**: The highest-performing trades clustered at low confidence (0.30–0.50), while high-confidence trades were rare and underperformed. This suggests the confidence output head needs recalibration — possibly through temperature scaling or Platt scaling on validation data.

2. **ETH underperformance**: ETH trades lost -$3.82 with a 36.6% win rate vs BTC's +$15.57 and 50.0% win rate. The ETH model ensemble shows a clear timeframe disagreement (1h→DOWN, 5m→UP), which the signal fuser may be handling incorrectly.

3. **1m models excluded**: The 1m model failed ONNX export and was excluded from the ensemble. The current architecture handles 5m–1h timeframes well, but sub-5m resolution (for the ultra_short window) remains uncovered.

4. **Edge-case handling**: "Rapid" exits (3 trades exited flat immediately after entry) and "Panic" exits (13 with 15.4% WR) indicate entry timing or signal decay issues on certain market regimes.

### 10.3 Recommendations

1. **Confidence recalibration**: Implement temperature scaling on validation data to align confidence outputs with empirical accuracy
2. **ETH model retraining**: Augment ETH feature set with ETH-specific indicators (DeFi TVL, gas prices, L2 activity) and retrain
3. **Per-model stop-out**: Implement per-model drawdown limits in the model registry — if a model's running accuracy drops below threshold, exclude it from ensemble voting
4. **Live mode transition**: Switch from paper to live mode at the current Kelly fraction (0.38) with a reduced max position cap ($10.00) for the first 100 live trades
5. **1m model resurrection**: Debug the 1m model export (likely feature-dimension mismatch) and re-export
6. **RL production deployment**: The PPO fuser is wired into `predict.js::getRLSignal()` but needs more training data (6+ months, GPU-backed) before it consistently beats the rule-based baseline. Short-term: use RL as a tiebreaker when rule-based signal is near threshold (±0.2)

---

## Appendix A: File Inventory

```
/home/david/Zinger/
├── index.js                          # Express 5 entry point
├── src/
│   ├── server.js                     # API routes, SSE, WS
│   ├── polymarket/
│   │   ├── bot.js                    # Bot orchestrator, getState()
│   │   ├── persistence.js            # Atomic write queue
│   │   ├── modelRegistry.js          # 12-model tracker + listeners
│   │   ├── onnxInference.js          # onnxruntime-node bridge
│   │   ├── predict.js               # Signal fuser, model invocation
│   │   └── index.js                  # Re-exports
│   └── ...                           # Polymarket API client, WS, order mgmt
├── frontend/
│   ├── index.html                    # Non-blocking font loading
│   ├── src/
│   │   ├── index.css                 # CLS utilities, skeleton classes
│   │   ├── PolyDashboard.jsx         # Main orchestrator
│   │   ├── SystemFlow.jsx            # 12-model node canvas
│   │   ├── MlBay.jsx                 # ML dashboard
│   │   ├── LadderPanel.jsx           # Order book ladder
│   │   └── ChartPanel.jsx            # OHLCV chart
│   └── vite.config.js                # Manual chunk splitting
├── ml/
│   ├── features.py                   # 50+ technical indicators
│   ├── model.py                      # LSTM architecture
│   ├── train_lstm.py                 # Training loop
│   ├── export_onnx.py                # .pt → .onnx converter
│   ├── onnxInference.js              # Node.js ONNX runner
│   └── benchmark.py                  # Performance test suite
├── data/
│   ├── poly_trades.json              # 81 trade records
│   ├── poly_positions.json           # 91 position records
│   ├── poly_config.json              # Bot configuration
│   ├── ml/models/                    # 12 .pt models, 13 .onnx models
│   └── ...
└── THESIS.md                         # This document
```

## Appendix B: Benchmark Methodology

All inference benchmarks were run on a single machine (Linux x86_64, 12th Gen Intel). The test procedure:

1. Fetch 500 candles of live data from Binance for each symbol/timeframe pair via CCXT
2. Compute all 50 technical indicators through `features.py`
3. Trim to the trailing `seq_len` (64 for 1h, 96 for 5m) samples
4. Load ONNX model from disk (cold start — load time measured)
5. Warmup: 3 inference passes (not counted)
6. Measurement: 10 inference passes, recording wall-clock time via `time.perf_counter()`
7. Onnxruntime configured for CPU execution (no CUDA)

Trade backtest uses the full historical trade log (`data/poly_trades.json`) with no forward-looking bias — all trades were executed by the bot at their recorded timestamps.

---

*Zinger — July 2026*