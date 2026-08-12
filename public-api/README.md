# Zinger Public UI

Front-end for the **public** Zinger routes on the main bot:

`https://zinger.kierkegaard.space/api/v1/*`

There is **no separate playground API**. The UI at `/public` streams live bot state.

## Live endpoints

| Route | Purpose |
|-------|---------|
| `GET /api/v1/predictions` | Snapshot: spot, signals, ML, markets, target |
| `GET /api/v1/predictions/stream` | SSE (~1s) full prediction state |
| `GET /api/v1/markets` | Polymarket windows + UP/DOWN mids |
| `GET /api/v1/market/:slug` | Single market + book depth |
| `GET /api/v1/charts/spot` | Spot tick history |
| `GET /api/v1/charts/spot/stream` | SSE tick-by-tick |
| `GET /api/v1/target-price` | ML/signal target |
| `GET /api/v1/paper` | Public signal-driven paper portfolio |
| `GET /api/v1/paper/stream` | SSE paper positions, closes, equity, and events |
| `GET /api/v1/health` | API + bot + model health |

## UI

Served at `https://zinger.kierkegaard.space/public/`

```bash
# local — run the main bot
cd /home/david/Zinger && node index.js
# open http://127.0.0.1:3000/public/
```

Docs: `docs/SIGNALS.md`, `docs/ML.md`, `docs/CLIENT.md`

The **Build client** tab contains copyable coding-agent briefs for Polymarket and Kalshi adapters, including risk gates, idempotency, reconciliation, tests, and dry-run requirements.
