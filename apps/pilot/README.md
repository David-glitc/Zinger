# Zinger consumer app (usezinger.xyz)

Next.js App Router product — **not** Playground, **not** Core.

- Landing `/` → connect wallet
- Dashboard `/app` → account, deposit (1% fee), bands, session, PnL, intelligence

## Quick start

```bash
npm install
npm run dev
npx vercel --prod
```

Env: `NEXT_PUBLIC_API_URL=https://zinger.kierkegaard.space/api/v1`

## Polymarket geo-block — resolved

The Express backend (`zinger.kierkegaard.space`) is hosted in France, which Polymarket geo-blocks. This app ships three Vercel-hosted API routes that bypass the block by running on Vercel's global network.

### Proxy API routes

| Route | Purpose |
|---|---|
| `/api/proxy/clob/*` | Proxies to `clob.polymarket.com` — orders, books, prices |
| `/api/proxy/gamma/*` | Proxies to `gamma-api.polymarket.com` — market metadata |
| `/api/geoblock` | Checks if current Vercel deployment region is blocked |
| `/api/intelligence` | Aggregated signal pipeline, model health, paper stats |

### Vercel region selection

Deploy to a region **not** geo-blocked by Polymarket:

| Region | Code | Status |
|---|---|---|
| Dublin, Ireland | `dub1` | ✅ Works (documented API-friendly) |
| Frankfurt, Germany | `fra1` | ✅ Works |
| London, UK | `lhr1` | ✅ Works |
| Singapore | `sin1` | ✅ Works |
| Washington D.C., USA | `iad1` | ❌ Blocked |
| Paris, France | `cdg1` | ❌ Blocked |

Set region in `vercel.json`:
```json
{
  "functions": {
    "api/proxy/**/*.ts": { "regions": ["dub1"] }
  }
}
```

> **Note:** Region pinning requires Vercel Pro. On Hobby, Vercel auto-selects the closest region — for EU traffic this is usually Frankfurt (`fra1`), which works.

### Deploy to a non-blocked region

```bash
# Deploy with explicit region (Pro)
npx vercel --prod --regions dub1

# Or modify vercel.json and deploy normally
npx vercel --prod
```

Then verify with:
```bash
curl https://usezinger.xyz/api/geoblock
```
Expect: `{"ok":true,"geoblock":{"blocked":false,...}}`
