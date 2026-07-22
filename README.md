# Zinger

Automated token launch stress testing on Robinhood Chain via BasedBid.

## Setup

```bash
# 1. Install OpenBid SDK
git clone https://github.com/basedbid-public/openbid.git /tmp/openbid
cd /tmp/openbid && npm install

# 2. Setup this project
cd /home/david/Zinger
npm install
cp .env.example .env
# Edit .env with your PRIVATE_KEY and DEV_ADDRESS
```

## Usage

```bash
# Launch 3 tokens (flash tokens with fee builder)
npm run automate

# Trade volume on launched tokens
npm run trade

# View dashboard
npm start
# Open http://localhost:3000

# Generate report
npm run report
```

## Architecture

- Robinhood Chain (chainId 4663) - Arbitrum L2
- BasedBid Flash Tokens via OpenBid SDK
- Uniswap V4 with Fee Builder
- 3-5% DEX fee tiers with dynamic fee multipliers
