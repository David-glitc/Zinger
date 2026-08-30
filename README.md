# Zinger

Polymarket BTC/ETH up-or-down trading bot with paper and live modes, operator dashboard, optional Telegram command center, ML regime detection, and a public signal API.

> **Public Core repository.** Runtime ledgers, wallets, and production secrets are not included. The [Pilot consumer app](PILOT.md) is maintained separately in a private repo.

## Features

- Paper and live Polymarket CLOB trading (5m / 15m / 30m / 1h windows when listed)
- Signal + ML overlays, Kelly/certainty sizing, TP/SL / hold-to-settle plans
- Three-regime governor (`trend-ride`, `scalp`, `arb-only`) with statistical jump-model overlay
- Fee-aware atomic arbitrage engine
- Operator UI (`frontend/`) at `/poly`
- Public predictions API + optional `public-api/` playground package
- Optional Telegram control surface

## Documentation

| Doc | Description |
|-----|-------------|
| [Engineering Handbook (PDF)](docs/handbook/zinger-handbook.pdf) | Full technical spec |
| [ENGINEERING_HANDBOOK.md](docs/ENGINEERING_HANDBOOK.md) | Markdown source (detailed) |
| [architecture.md](docs/architecture.md) | High-level map |
| [THESIS.md](THESIS.md) | ML research narrative |
| [PILOT.md](PILOT.md) | Private consumer app (not in this repo) |

## Quick start (paper)

```bash
git clone https://github.com/David-glitc/Zinger.git
cd Zinger
npm install
cd frontend && npm install && npm run build && cd ..
cp .env.example .env
# set AUTH_PASSWORD=...
npm start
```

Open `http://localhost:3000/poly`, sign in with `AUTH_PASSWORD`, keep mode on **paper**.

## Configuration

See [`.env.example`](.env.example). Important knobs:

| Variable | Purpose |
|----------|---------|
| `AUTH_PASSWORD` | Dashboard login |
| `OPENROUTER_API_KEY` | Optional LLM governor/optimizer |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Optional Telegram |
| `CLOB_PROXY_URL` | Optional SOCKS/HTTP egress for order writes |
| `ZINGER_DATA_DIR` | Override runtime data directory (default `./data`) |

Live trading requires a wallet file created by Core under `data/wallet.json` (gitignored) and Polymarket-ready collateral. Start paper-first.

## Layout

```
index.ts          # process entry
src/              # Express API, Polymarket bot, AI, Telegram
frontend/         # Vite operator dashboard
ml/               # Training / regime scripts (no weights in-git)
public-api/       # Optional trimmed signal server
tests/            # vitest unit + perf suites
docs/handbook/    # LaTeX handbook → PDF
```

## Checks

```bash
npm run typecheck
npm test
npm run test:perf
npm run ci
```

## Docker

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml up --build
```

## Security

Read [SECURITY.md](SECURITY.md). Never publish funded keys or live `.env` files.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
