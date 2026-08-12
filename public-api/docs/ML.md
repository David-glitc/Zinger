# ML methodology (public summary)

The private Zinger bot can fuse classical TA signals with an optional **LSTM + RL fuser** stack. The **public API you are looking at publishes the TA ensemble** (always-on, no GPU required). This doc describes the ML path at a level safe for public review — weights and private training dumps are **not** shipped here.

## Architecture (private bot)

1. **Feature pipeline** — rolling OHLCV + derived TA features, meta features (funding, window progress).
2. **LSTM encoder** — bidirectional LSTM over the feature window → direction / confidence / expected return heads.
3. **RL fuser** — learns when to trust TA vs model under short-horizon 5m settlement noise.
4. **ONNX export** — inference path for the Node bot (`onnxruntime`).

## Training data (shape, not dumps)

- Source: public Binance candles (e.g. BTCUSDT / ETHUSDT 1m–1h).
- Labels: short-horizon direction / return over the prediction horizon aligned to market windows.
- No customer PII; no wallet addresses; no CLOB credentials.

## Inference ops (standard)

1. Build feature tensor from latest candles.
2. Run ONNX / Torch session → logits.
3. Fuse with TA score + risk gates (edge gate, geoblock, min shares).
4. Emit the same signal schema as `/api/v1/signals`.

## What is open here

| Open | Closed (private repo) |
|------|------------------------|
| TA signal code (`lib/signal.js`) | Trained weights / checkpoints |
| Kelly + edge math | Full RL training loops + dumps |
| Live Binance market helpers | Operator auth, wallets, CLOB keys |
| This methodology note | Raw `data/ml/*.parquet` if labeled proprietary |

If you later open-source the ML trainers, scrub paths, absolute machine names, and any keys from notebooks first.
