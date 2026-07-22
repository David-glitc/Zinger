# DEVELOPMENT

## 2026-07-21 — Poly dashboard shadcn rewrite

- Rebuilt `/poly` on Tailwind v4 + shadcn/ui (new-york, zinc + emerald primary, IBM Plex).
- Shell: sticky header, Sheet mobile nav, Behavior Sheet, approve Dialog, Tabs (Overview/Markets/Positions/History/Feed), Sonner toasts.
- Legacy terminal CSS moved to `frontend/src/legacy-terminal.css` for `/` only.
- Built + redeployed `node index.js`; `/poly` returns 200.

## 2026-07-21 15:50 UTC — Behavior sheet Save

- BehaviorForm now uses a local draft + **Save behavior** (no per-keystroke POSTs).
- Redeployed after rebuild.
2026-07-21 21:26 UTC

## Tailwind + Sidebar rebuild
- Fixed theme tokens (oklch slate/mint) + sidebar vars + tw-animate-css.
- PolyDashboard now uses SidebarProvider, Field forms, Empty states, responsive KPI grids.
- Built + redeployed.

## 2026-07-22 00:39 UTC — Mobile aggressive
- Mobile breakpoint 1024; sidebar offcanvas + bottom nav.
- Mobile cards for markets/positions/history; 44px action row; audit list.
- overflow-x lock + safe-area bottom pad.

## 2026-07-22 12:00 UTC+1 — Resume massive update (no UI theme changes)
- Left existing CSS/theme alone (reverted accidental theme restore).
- ML: `getMLTrace` / `getMLTraceForBoth` (5m h1+h3 ladder) → confidence price-trace buffer 30s–3m window.
- Bot: order-book imbalance + YES/NO arb gap scoring; `maxConcurrentPerSlug=3` + `allowScaleIn`; earlier/larger partial TPs.
- Perf: UV_THREADPOOL up to 32; ML procs capped OMP/MKL threads.
- Feed uses ChatPanel ms timestamps (`fmtTimeMs`); Markets OrderBook already wired.
- Built + redeployed; `/poly` 200; `/api/status` Polygon 137; config maxConc=3.

## 2026-07-22 12:05 UTC+1 — Chart panel
- Added `ChartPanel` (UP/DOWN mid lines + ML horizon dots) on Markets tab beside OrderBook.
- Bot tick buffer + `GET /api/poly/charts` (`sampleCharts`) fills series even when bot is stopped.
- Built + redeployed; `/poly` 200.

## 2026-07-22 12:15 UTC+1 — Finalize ML traces + robust redeploy
- Fixed ML bridge: use `/usr/bin/python3` (empty project venv lacked numpy); real kill timeouts; sequential 5m/15m/1h ladder.
- Background feeds: chart ticks every 2s + ML refresh ~55s (works with bot stopped).
- `POST /api/poly/ml-refresh` + charts `?ml=1` nudge; confidence buffer + ChartPanel consume traces.
- Verified live: BTC+ETH traces 3 pts each; chart ticks accumulating; `/poly` 200.

## 2026-07-22 12:30 UTC+1 — Spot prices, markets-when-stopped, UX polish
- Background `refreshSpotPrices` (Binance 24h) + `refreshLiveMarkets` every 3s with LIVE/ENDING/RESOLVED + implied winner.
- Poly header: lime LIVE badges + BTC/ETH spot strip; History → summary KPIs + detail cards; Feed action log improved.
- Deposit modal clarifies sync-only (fund deposit wallet on Polygon, then Sync).
- Built + redeployed; `/poly` 200.

## 2026-07-22 13:30 UTC+1 — Block Change Root → Windows on VPS chats
- Prior agent used Cursor `move_agent_to_root` toward Zinger; Change Root can yank an SSH/VPS chat onto local Windows.
- Added always-apply rules: `/home/david/.cursor/rules/vps-no-local-change-root.mdc` and `Zinger/.cursor/rules/vps-no-local-change-root.mdc`.
- Agents on this VPS must `cd` / use Shell `working_directory` under `/home/david/...` only — no Change Root unless the chat was opened on local Windows on purpose.

## 2026-07-22 14:45 UTC+1 — NASA markets + cash fix + private repo
- Cash UI now prefers `spendableBalance` (not `clobBalance ??` which stuck at $0); Account shows spendable / CLOB / deposit pUSD separately; baseline resynced to live cash (~$9.59).
- Live markets: liq, vol, UP/DOWN bid-ask, arb, implied winner + detail data-tiles; OrderBook UP/DOWN buy/sell rail with ladders.
- Bot `summarizeBook` keeps 5-level ladders while scanning; background refresh already did.
- Terminal Paper|Live `mode-rail` in header + sidebar (touch h-11 / desktop h-8).
- Rebuild `frontend/dist` (IBM Plex + mode-rail + data-tile served); redeployed `node index.js`; `/poly` 200; depth ladders verified on live BTC/ETH.
- Git init + private GitHub repo (secrets: `.env`, `data/wallet.json` gitignored).
