# Signal pipeline

Zinger publishes **advisory signals** for 5-minute BTC/ETH up/down binary markets. Clients decide whether and how to execute.

## Actions

| `action` | Meaning |
|----------|---------|
| `buy_up` | Prefer the UP outcome |
| `buy_down` | Prefer the DOWN outcome |
| `hold` | No directional edge / neutral |
| `take_profit` | *(client-side)* close when share price hits TP |
| `stop_loss` | *(client-side)* close when share price hits SL |
| `partial_tp` | *(client-side)* trim ~55% at halfway TP |

The REST/SSE payload currently emits `buy_up` / `buy_down` / `hold` plus **suggested** TP/SL levels. Exit actions are for your execution loop.

## Payload (abbreviated)

```json
{
  "id": "sig_btc_…",
  "asset": "BTC",
  "action": "buy_up",
  "direction": "up",
  "confidence": 0.48,
  "score": 4.2,
  "price": 97500.12,
  "entry": 0.5,
  "takeProfit": { "pct": 12.4, "price": 0.562 },
  "stopLoss": { "pct": 12, "price": 0.44 },
  "partial": { "pct": 55, "price": 0.531 },
  "sizing": { "sizeUsd": 4.2, "method": "confidence_scaling" },
  "indicators": { "rsi": 41.2, "macdHist": 12.1, "adx": 28.4 },
  "tags": ["mom1_up", "rsi_low", "taker_buy_dom"],
  "skipTrade": false,
  "window": { "start": 0, "end": 0, "remaining": 142, "windowSec": 300 }
}
```

## How direction is formed

1. Pull 1m Binance OHLCV (+ futures funding/premium).
2. Score votes from RSI, MACD, Bollinger position, ADX, EMA stack, volume surge, taker buy ratio, funding crowd, optional BTC→ETH lead.
3. `direction = up` if score > 2.5, `down` if < −2.5, else `neutral`.
4. `confidence` scales with |score|, capped at **0.65**.
5. `skipTrade` when ATR% is extreme (> 0.5%).

## TP / SL defaults (share price)

- TP: **8–16%** of entry, scaled by confidence
- SL: **12%**
- Partial: **50% of TP path**, sell **55%** of position

Entry for sizing math defaults to **0.5** (fair coin) unless you pass a book price into `/sizing/calculate`.

## Sizing bounds (replicate ours)

These are the **paper strategy defaults** used by the private bot. Live is stricter (see bottom).

### Hard bounds (paper)

| Bound | Value |
|-------|-------|
| `minPositionSize` | **$0.50** |
| `maxPositionSize` / `maxPositionCap` | **$14** |
| `maxPositionPct` | **15%** of bankroll |
| Paper hard cap | `min(maxUsd, cash × 0.95)` |
| `bankrollReservePct` | **8%** |
| `maxOpenPositions` | **3** |
| `maxConcurrentPerSlug` | **1** |
| `allowScaleIn` | **false** |
| Entry price band | **0.38 – 0.88** |
| Window remaining | **30s – 270s** |
| `minConfidence` | **0.30** |
| `kellyFraction` | **0.10** (10% of raw Kelly) |
| Certainty cap | **12%** of bankroll / **$14** |

### Size formula

1. `maxUsd = min(bankroll × 0.15, 14)`
2. `hardCap = min(maxUsd, bankroll × 0.95)`
3. `conf = min(confidence, 0.65)`
4. If `tradeCount < 10` → confidence scaling:
   `size = minUsd + (hardCap − minUsd) × (0.15 + conf × 0.25)`
5. If Kelly edge ≤ 0 → size **0** (live). Paper probe: `1.2 + conf × 2.5` clamped to `[minUsd, hardCap]`
6. If Kelly edge > 0 →
   `betPct = clamp(kellyRaw × 0.10, 1%, 50%)`
   `size = bankroll × betPct × (0.35 + conf × 0.5)` then clamp to `[minUsd, hardCap]`
7. Certainty favorites (ask > 0.5, time left): optional upsize to `min(bankroll × 0.12, 14)`

```js
function sizeUsd({ bankroll, confidence, kellyRaw = null, tradeCount = 0 }) {
  const minUsd = 0.5;
  const maxUsd = Math.min(bankroll * 0.15, 14);
  const hardCap = Math.min(maxUsd, bankroll * 0.95);
  const conf = Math.min(0.65, Number(confidence) || 0);
  if (tradeCount < 10 || !(kellyRaw > 0)) {
    return Math.round(Math.max(minUsd, Math.min(
      hardCap,
      minUsd + (hardCap - minUsd) * (0.15 + conf * 0.25)
    )) * 100) / 100;
  }
  const betPct = Math.max(0.01, Math.min(kellyRaw * 0.10, 0.50));
  const sized = bankroll * betPct * (0.35 + conf * 0.5);
  return Math.round(Math.max(minUsd, Math.min(sized, hardCap)) * 100) / 100;
}
```

### Exit bounds

| Param | Paper default |
|-------|---------------|
| TP | **18% – 42%** of entry (confidence-scaled) |
| SL | **12%** (adaptive off) |
| Partial | at **72%** of TP path, sell **35%** |

Public envelope suggested levels (TP 8–13.2% / SL 12%) are a simplified client hint — use the table above to match the bot.

### Live (stricter)

`maxPositionSize/Cap = $2`, `maxPositionPct = 6%`, `maxOpenPositions = 2`, `minConfidence = 0.35`, `kellyFraction = 0.08`, `certaintyMaxPct = 10%`, `certaintyMaxUsd = $2`. Edge gate: ≥ 40 paper closes, expectancy > 0, Kelly > 0.

## Edge gate

Live / directional unlock (conceptually) requires:

- ≥ **40** closed paper trades
- expectancy **> 0**
- kelly **> 0**

## Endpoints

- Snapshot: `GET /api/v1/predictions`
- Stream: `GET /api/v1/predictions/stream`
- Paper sim: `GET /api/v1/paper` · `GET /api/v1/paper/stream`
