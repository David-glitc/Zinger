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

## 2026-07-23 07:00 UTC+1 — Homepage IS mission terminal
- Ugly screenshot was legacy App on `/` + public 502 (node down).
- `/` → PolyDashboard; `/legacy` only for old UI.
- Mission home: animated SystemFlow + MlBay; early entry 298s + tight-spread scoring.
- Rebuilt + restarted; public serves index-CjCVfBlK.js with Mission dataflow.

## 2026-07-23 07:40 UTC+1 — Full spacing + notifications pass
- Roomier KPI cards (px-6 / text-3xl), content p-8, wider sidebar 18.5rem.
- Alerts sheet (bell) with pending + action stream; toasts bottom-right.
- Audit alert padded; action buttons / mode-rail taller.

## 2026-07-23 15:50 UTC+1 — Fix skewed CSS (legacy reset vs Tailwind)
- Legacy `*{margin:0;padding:0}` was bundled into `/` and zeroed all Tailwind spacing.
- Lazy-load `/legacy` App; dense terminal sizing restored; `frontend/dist` rebuilt.

## 2026-07-23 16:05 UTC+1 — Wallet auth gate on main terminal
- `/` now requires RainbowKit connect of `0x…e600` (not public). ConnectButton in chrome; nav pages improved.

## 2026-07-23 16:20 UTC+1 — Final wiring: no legacy, Start, filters, ML/CLOB, mobile
- Removed `/legacy` route + sidebar link; `/` is PolyDashboard only.
- Start/Stop: optimistic UI + busy lock + SSE `/api/poly/stream` alongside poll; toast success/error.
- Feed log filters: All / Buy / Sell / Signal / Sys / Err in ChatPanel.
- MlBay fixed: case-insensitive model symbols, object-shaped price traces, nested `consensus` fields.
- Live CLOB: keep fresh market depth while running (no stale `prev.depth`); OrderBook still polls `/api/poly/depth`.
- Tighter padding (p-2/gap-2), denser header/mode-rail, 5-item mobile bottom nav (Behavior via sheet).
- Rebuilt `frontend/dist`; restarted `node index.js`.

## 2026-07-23 17:00 UTC+1 — Continue: kill legacy + denser + WC
- Deleted unused `App.jsx` + `legacy-terminal.css` (no longer mounted).
- Real WalletConnect project id via `VITE_WC_PROJECT_ID` (was fake `zinger-terminal`).
- Loopback-only local ops unlock on gate for 127.0.0.1 testing.
- Tighter card headers / Account content / Behavior form gaps.
- Rebuilt `frontend/dist`.

## 2026-07-24 10:40 UTC+1 — Paper execution fix (CLOB book sort)
- Root cause: Polymarket CLOB returns bids ascending / asks descending; `bids[0]`/`asks[0]` were worst quotes → fake mid $0.50 and spreadPct ~9800%, so `requireTightSpread` blocked every buy.
- `clob.js`: sort book levels, mid-relative spread%, ignore dust mids; buys use best ask.
- Paper sizing uses `paperBankroll` (not live CLOB cash); entry window 298s; paper minConfidence 0.22; ML can override weak/neutral tech on paper.
- Skip expired `isCurrent` windows; faster scans (no full ML ladder every tick).
- Verified live: PAPER BUY @ real prices ($0.515–$0.835), TP/SL firing.

## 2026-07-24 11:25 UTC+1 — Pages, live PnL, LLM, CLS/LCP deploy
- Nav pages: Mission / Markets / Process / Positions / History / Feed / Behavior (hash + titles).
- Process page: scan decisions, sizing, pending orders, pipeline, PnL tape.
- Positions: live mark, entry→mark, bid/ask, unrealized %.
- Portfolio PnL: net = realized + unrealized; cash = initial + realized − open cost.
- LLM wired via OpenRouter `openrouter/free` + `/api/poly/ask` + Feed AI tab.
- CLS/LCP: dark html shell, reserved KPI/header/chat heights, content-visibility pages, async fonts.
- Rebuilt `frontend/dist`; restarted `node index.js`.

## 2026-07-24 11:50 UTC+1 — TG chat fix, paper cash ledger, PnL audit, redeploy
- Telegram: ask() was sending objects (broken); now formatAskResult. /start locks operator chat + /pin dashboard. Persist chat id when TELEGRAM_CHAT_ID empty. Status/PnL use portfolio net/R/U.
- Paper cash ledger: buy debits cost, close/partial/settle credits exit proceeds into `paperBankroll`; reconcile on boot. Equity = cash + open mark; net = equity − initial.
- Trade dedupe no longer collapses distinct fills; partial TP writes a trade; window settle closes at expiry.
- Live: still CLOB sell + syncBalances; verified PnL from live orderIds.
- OpenRouter key rotated in `.env`; server restarted.

## 2026-07-24 17:12 UTC+1 — Audit fix, full pages, LLM optimize, adaptive SL, settle rewards
- Paper cash overdraft: minShares inflate + fake $100 bankroll when cash≤0 caused negative cash; paper sizes now match budget, cash gates + maxOpen=6, repair closes until books cash ≥0.
- Audit paper-aware (no live orderId noise); Mission-only audit; KPIs moved into sticky nav (net/eq/cash/open/cycle).
- Adaptive SL cuts toward 5% when loss grows + confidence drops/flips; fewer partials (partialTpFrac 0.82).
- LLM/heuristic optimizer wired: `/api/poly/optimize`, cycle-end session_perf + auto-tune, Optimize Now in Behavior/Mission.
- Cycle settle rewards booked on window rollover; Mission home shows trades, live taps, settle, optimizer, ML canvas.
- Restored full `kelly.js` exports; rebuilt frontend; restarted `node index.js`.

## 2026-07-24 17:31 UTC+1 — Stream soundness, UP/DOWN balance, CLOB arb, LLM primitives
- SSE: lean state (~charts stripped), debounced push, heartbeat ping, frontend reconnect backoff; poll uses `?lean=1`; API errors only after 3 fails.
- UP monopoly fixed: always eval both sides; soft signal mismatch; side-balance scoring; short-TF signal/ML ladder (1m/5m/15m, no 1h).
- CLOB arb: when UP+DOWN asks sum < 1−minArbGap, dual-leg buy both sides for settlement edge.
- LLM realtime primitives: `/api/poly/llm-act`, `/api/poly/primitives`; chat can emit JSON actions (update_config, enable_arb, balance_sides, optimize, pause/resume…).
- Rebuilt frontend; restarted server.

## 2026-07-24 17:43 UTC+1 — Nav, API traces, agile alerts, conf-scaled TP/SL
- UI nav: desktop top tabs + prev/next, scrollable mobile bottom nav, `#traces` page, Alt+←/→.
- API: `/api/poly/traces`, `/api/poly/notifications/read`; lean state carries traces + notifications.
- Agile alerts: toast + TG on buy/arb/sl/tp/announce; NotificationsPanel filters + unread.
- TP/SL: `confidence_tp_sl` — higher conf → higher TP + tighter SL; base SL 7%, adaptive floor 4%.
- Rebuilt frontend; restarted server.

## 2026-07-24 17:52 UTC+1 — Black sleek UI + live tick tape
- Theme: pure black (#000), acid lime primary, sharp 0.15rem radius, Syne + IBM Plex Mono, grid backdrop.
- LiveTickStrip: BTC/ETH spot + cycle ms clock + market UP/DN mids; flash green/red on every tick.
- Denser shell padding; content-visibility pages; theme-color #000; rebuilt `frontend/dist`.

## 2026-07-24 18:26 CEST — Fix UP-only monopoly (force DOWN under skew)
- Root cause: DOWN was soft-rescued but UP still won on score; side-balance never overrode selection.
- Soft mismatch (no hard lock); FORCE DOWN bonus when upShare≥75%; hard pick DOWN when upShare≥62% if eligible.
- Cap agreeing-signal score contrib; sideBalanceWeight=32; minConfidence=0.35; restarted bot.
- Verified live: open ETH/BTC DOWN; candidates DOWN ~166 vs UP ~−37 with FORCE DOWN reasons.

## 2026-07-24 19:59 CEST — Strategy audit (no code changes)
- Paper ~1094 closed: WR 36.9%, PnL −$252; need ~45% WR for BE given avgWin/avgLoss; implied Kelly −0.41.
- Live 15 closed: WR 20%, PnL −$21.6; mostly FORCE-DOWN era; 11/15 SL.
- Signal has no edge (agree WR≈overall); high conf (≥0.9) worst PnL; lo conf best.
- Exit mix paper: SL 49% / TP 19% / trail 21% — tight SL + wide TP without edge = bleed.
- Config currently mode=live, enabled=false, bot stopped.

## 2026-07-24 20:12 CEST — Full strategy audit fixes implemented
- New `src/polymarket/edge.js`: paper expectancy gate → arb-only until E>0 & kelly>0 over last 100; `requireEdgeForLive` paper-locks live.
- Confidence recalibrated (signal dir ±2.5, conf cap 0.65); ML/bias caps 0.65.
- TP/SL reshape: tp 6–14%, sl 12%, minAdaptive 8%; underdogs ≤0.42 + arb legs hold-to-settle.
- Removed FORCE DOWN; soft side-balance only among edge-filtered candidates.
- Kelly refuses negative edge (no min-size floor); optimizer bounds tightened; config forced paper + arbOnlyUntilEdge.
- Verified: POST mode=live → paper + liveBlocked; start reports ARB-ONLY E$-0.073.

## 2026-07-24 23:25 CEST — UI toggle fix + live auto-approve, redeployed
- Toggle bug: stale poll/SSE responses could overwrite the just-toggled running state → button looked dead. Added serverTime out-of-order guard in poll + SSE handlers and a canonical state refetch after toggle.
- New `autoApproveLive` (default true): live signals execute without manual approve (announce gate skipped); added Settings switch; allowlisted in LLM primitives.
- Reset leaked `maxConcurrentPerSlug` 2→1; rebuilt frontend dist; restarted server; verified start/stop/start cycles via API — state tracks correctly. Bot left running (paper, arb-only per edge gate).

## 2026-07-24 23:40 CEST — Paper/live isolation + unstall + 10-trade perf audit
- Dual strategy profiles in `poly_config.json` (`profiles.paper` / `profiles.live`) via `src/polymarket/modeConfig.js`; active mode resolves flat runtime config. Settings patches only the active profile.
- UI History is mode-scoped only (no mixed paper+live KPIs / dimming). Lean state drops cross-mode stats; exposes `profiles`.
- Paper unstall: `arbOnlyUntilEdge=false` on paper profile + `paper_probe` sizing when Kelly negative; live profile stays arb-gated.
- Perf test (paper, ~5m): 10 closes → WR 50% · PnL +$1.60 · exits trail4 / tp3 / sl2 / rapid1. Hold-to-settle underdog +$1.21. Frontend rebuilt; bot left running.

## 2026-07-24 23:55 CEST — Window-aligned cycles, History cash audit, Poppins, smarter nav
- Real market windows: `src/polymarket/windows.js` — slug open→end; cycle key = window start; all exits (tp/sl/trail/settle/partial) book into window accum; per-window stats + TP full/partial counts.
- Full TP inclusion: gain% OR absolute tpPrice; hold-to-settle still takes full TP near target/0.97.
- History: live Cash / Unrealized / Realized / Net + equity + live cash audit card + current window strip.
- UI: Poppins; nav badges (opens/pending/audit issues) + window countdown on top tabs.
- Rebuilt frontend; restarted server with bot running.

## 2026-07-25 09:34 CEST — Restore early strategy, queued stop, session + config snapshots
- Restored earliest stable TP/SL profile (TP 18–42%, SL 14%, adaptive off, optimizer frozen) after SL-heavy bleed.
- Stop button now queues stop until window end (notify + cancel), then hard-stops after cycle.
- Session counter: live `session.trades` / PnL / uptime in header; config snapshots saved with paper/live analysis for restore.
- Paper reset endpoint + Behavior controls; History timestamps are wall-clock (ms clocks kept for cycle/trades only).
- Header/tape now show Window left (same open→end clock). Frontend rebuilt; server restarted.

## Bot last-state audit — 2026-07-25 08:41 UTC
- Paper bot **running**; stop **queued** for window end (`wall-300-1784968800`). Config: TP 18–42 / SL 14 / adaptive off / optimizer off.
- Current session green: 5 closes, 4W/1L, +$1.86; window 4 closes all green (+$1.88, TP/partial). 2 UP opens (ETH 0.91, BTC 0.83) small unrealized +.
- Edge gate still red: lookback100 expectancy −0.30, WR 33%, liveBlocked; cash ~$31 equity ~$37, lifetime realized ≈ −$63.
- Verdict: restore profile behaving better short-term; long book still negative EV — do not unlock live until expectancy > 0.

## 2026-07-25 08:55 UTC — Simple password auth (any device)
- Replaced wallet-only gate with password session auth: `AUTH_PASSWORD` + HMAC cookie `zinger_session` (30d).
- APIs: `GET /api/auth/status`, `POST /api/auth/login|logout`; all other `/api/*` require auth.
- UI: password login screen + Sign out; wallet connect remains optional inside terminal.
- Frontend rebuilt; server restarted; verified 401 without cookie, login, protected state, logout.

## 2026-07-25 09:11 UTC — Password rotation + forced re-login
- Changed the operator password and rotated `AUTH_SECRET`, invalidating sessions on every device.
- Logout now expires and deletes the session cookie explicitly; verified protected APIs return 401 after logout.

## 2026-07-25 11:57 UTC — SL honour + optimal sizing
- Root cause: exits marked mid/gamma and skipped ticks while scan locked → 10% SL booked at −30/−56%.
- Fix: mark SL on best bid; paper fills capped at SL+2% slip; early/fast exit passes; exact slPct when adaptive off.
- Sizing from last ~150 paper trades: $1.5–2.5 best EV, $3+ bleed; favorites ≥0.70 weak.
- Applied: paper max $2.5 / Kelly 0.10 / SL 12% fixed; live max $2.0 / Kelly 0.08; maxPrice 0.88; adaptive off.

## 2026-07-25 11:59 UTC — Paper max size $14
- Paper profile: maxPositionSize/Cap/certaintyMaxUsd → 14, maxPositionPct 0.15. Live unchanged. Bot left running.

## 2026-07-25 12:30 UTC — Latest-run audit + hot optimisations
- Session ~30t: WR ~32–45% by slice, sess ≈ +$2–3, net ≈ +$13; SL now capped (~+2% slip).
- Issues: UP monopoly (24/25), $8–14 sizes WR 20% and biggest $ losses, governor scalp cut TP to 12–24, favs ≥0.70 bled.
- Applied (paper): keep max $14, Kelly 0.12, maxPrice 0.78, TP 18–36, sideBalance 28, governor off, SL 12 fixed.

## 2026-07-25 12:35 UTC — Faster TP + new signals
- Faster bank for ~$5 tickets: TP 8–16%, partial at 50% of TP selling 55%, trail arm at 40% of TP.
- New signals: Binance taker buy ratio, perp funding/mark premium, BTC→ETH lead momentum.
- Restarted bot with new signal module; paper kept running toward $59.

## 2026-07-25 13:05 UTC — Live account audit + phantom execution fix
- Audit: CLOB $9.59; ALL 14 "live" trades had orderId=None — CLOB returns {success:false} without throwing; bot booked positions with no real fills (cash never moved: cashPnl $0 vs claimed +$2.97).
- Second cause: live cap $0.58 (6% of $9.59) < exchange 5-share minimum (~$2–4.30) — every order rejected.
- Fixes: assertOrderAccepted throws on rejected orders (buy + sell); live buys guarded vs min-share inflation & spendable; live sells must be accepted before booking close (settle exempt); fast/early SL same.
- Live profile: max $3.20 (35%), maxPrice 0.62 (keeps 5-sh min ≤ $3.10), TP 8–16, SL 12, Kelly 0.10.
- Note: 1 stuck redeemable position (Jul 21 BTC 5m, $1 → $0) still on the deposit wallet.

## 2026-07-25 13:20 UTC — Normalize live account (clean slate)
- Added `POST /api/poly/live-reset` (`confirm: RESET LIVE`) + UI "Normalize live" on Account card / Behavior form.
- Wipes all live tracker trades/positions/actions (archives to `data/poly_live_archive.json`), keeps paper intact, re-baselines to current CLOB cash, mode=live enabled=false.
- Fixed `normalizeTrade` verified flag: live requires real `orderId` (phantoms no longer count as verified).
- Executed reset: phantom live book cleared; cash PnL starts at $0 vs current spendable.

## 2026-07-25 15:04 UTC — Geo-restriction safety gate
- Confirmed Polymarket blocks order placement from VPS egress FR/GES; Cloudflare inbound proxy does not alter outbound CLOB IP.
- Live readiness now checks Polymarket geoblock and remains false in restricted regions, preventing repeated rejected live orders. No restriction-bypass routing configured.

## 2026-07-26 15:05 UTC+1 — Public playground v2 (signals + simulator)
- Decoupled `public-api/` from private bot: standalone `lib/{edge,kelly,signal,market}.js` (no `../src/polymarket` imports).
- New endpoints: `/signals`, `/signals/stream` (SSE), `/market/:symbol`, `/candles/:symbol`, `/orderbook/:symbol`, `/window` + existing sizing/simulate/edge/docs.
- Rebuilt playground UI: live candles, order-book depth, SSE signal cards (TP/SL/size), window clock, simulate/Kelly/edge controls, Docs + Client tabs.
- Docs: `public-api/README.md`, `docs/SIGNALS.md`, `docs/ML.md`, `docs/CLIENT.md`; package.json + .env.example + .gitignore for playground-only public ship.
- Smoke-tested on :3001 (health/signals/market/candles/book/simulate/SSE). Safety: no keys/wallets in public-api tree — pause for human review before public GitHub remote.

## 2026-07-26 15:25 UTC+1 — Kill playground API, wire live /api/v1 public UI
- Removed `/playground` API mount; legacy `/playground/*` redirects to `/public/`.
- UI now consumes only public routes: `/api/v1/predictions/stream` (1s), `/api/v1/charts/spot/stream` (tick), `/api/v1/markets` + `/market/:slug` books.
- Live reactive tape: spot flash on tick, window countdown, ML models, market UP/DOWN mids, selected-book refresh 2s.
- Signals include action + TP/SL when bot emits them; bot currently stopped so signals may be null until started.

## 2026-07-26 15:40 UTC+1 — Always-on public signals + interactive viz
- Background feed publishes TA signals every 4s even when trading bot is stopped (`startBackgroundFeeds` → `publishPublicSignals`).
- Public payload includes signal `components` (RSI/MACD/ADX/mom/vol/taker/funding/score) + TP/SL.
- UI: valued spot chart (Y/X + crosshair), interactive radar signal canvas + component cards, UP/DOWN share chart with values.

## 2026-07-26 15:55 UTC+1 — Public UI craft pass
- Poppins + IBM Plex Mono; acid-lime tick strip matching main app flash feel.
- Prominent nav: Live / Signals / Markets / Docs / Build client; in-page docs restored.
- Windows show m:ss; dual BTC+ETH normalized overlay + ML target; wheel zoom / drag pan / crosshair.

## 2026-07-26 16:05 UTC+1 — Polymarket-blue UI + public paper execution
- Stabilized spot streams by filtering SSE clients per requested asset, batching canvas draws, and enforcing a minimum chart domain.
- Added `/api/v1/paper` + `/api/v1/paper/stream`: $100 signal-driven simulation, one position per asset/window, public-mid marks, TP/SL/window exits.
- UI uses Polymarket blue accents, restrained glass surfaces, 18px panels/12px cards, and reduced-motion support.
- Signals tab streams paper equity/positions/events; Build client provides copyable full Polymarket/Kalshi coding-agent briefs.

## 2026-07-26 16:25 UTC+1 — Bigger app scale + full protocol documentation
- Scaled the whole public UI up: 16px root font (15px mobile), 1680px shell, taller charts (spot 380px, share 250px, radar 260px).
- Rebuilt Docs into 14-section protocol documentation with sticky TOC nav: overview, architecture/data-flow diagram, window lifecycle, signal pipeline + component vote table, signal/envelope schemas, ML target math, books, paper-sim rules, SSE protocol, REST reference, errors/CORS, versioning, risk.
- Tab switches now scroll to top; deployed to play.zinger.kierkegaard.space and verified TOC scroll + Live tab in browser.

## 2026-07-26 16:35 UTC+1 — Black + blue theme, signal feed hardened
- UI background is pure black; Polymarket blue (#2E6CFF) is the only accent for chrome, charts, radar, and active states.
- Public TA feed interval 4s → 2s with error logging; envelope now includes `feed` heartbeat (`status`, `ageMs`).
- Status bar shows `signals live · Ns`; tick strip shows SIGNAL FEED cell; signal cards show age + skipTrade.
- Verified feed age <1s on /api/v1/predictions; redeployed play.zinger.kierkegaard.space.

## 2026-07-26 16:45 UTC+1 — Sizing bounds replication docs
- Docs §9 documents paper sizing bounds from `defaultPaperStrategy()`: $0.50–$14, 15% bankroll, 95% cash hard cap, Kelly 10%, certainty 12%/$14, entry 0.38–0.88, window 30–270s, TP 18–42%/SL 12%, live stricter table.
- Includes copy-paste `sizeUsd()` replica + coding-agent brief update; `docs/SIGNALS.md` aligned.

## 2026-07-26 16:55 UTC+1 — Polymarket price-to-beat on spot chart
- Spot chart target is now the live Polymarket Chainlink **window open** (`priceToBeat`), not the ML share forecast: dashed BTC/ETH “to beat” lines + tick-strip deltas; UP if end ≥ open.
- Envelope adds `priceToBeat.{btc,eth}` from `polymarket.com/api/crypto/crypto-price`; markets carry `priceToBeat` / `vsBeat`.
- Fixed dead `CLOB_PROXY` hang (`proxyGet` axios timeout was undefined); when bot is stopped, market refresh uses Gamma + price-to-beat only (parallel) so the public chart stays live.
- Denser chart canvas (560px, 12×10 grid, 1600-tick history, in-canvas beat stats); docs §6/§7 distinguish USD to-beat vs ML share target.

## 2026-07-26 17:00 UTC+1 — Competitive scan: Rainmaker.fun
- Scanned rainmaker.fun: MLB managed agent (C9), $RAIN token gate (Solana `3iC63…2pump`, ~$4.3M mcap), user Polymarket wallet + pUSD, claimed 44–21 / 67.7% settled WR; no public API; /c9 locked.
- Contrast vs Zinger: they win retail packaging/managed UX; Zinger wins cadence (576 5m windows/day), open `/api/v1`, documented sizing, crypto microstructure.
- Product package recommendation: Play + Proof + Protocol + Pilot + Share (steal funnel, skip pump-token gate). Canvas: `zinger-vs-rainmaker.canvas.tsx`.

## 2026-07-26 17:15 UTC+1 — Pilot product + $1k paper with CLOB fees
- New Pilot tab: connect wallet (Polygon), deploy $1k paper capital, live execution tape / open / closed trades; UI denser than Rainmaker funnel.
- Public paper engine → `pilot_clob_sim`: $1000 book, max **10% cash**/ticket, sweet entry **0.42–0.68**, crypto taker fees `C×0.07×p×(1−p)` on open+close.
- Private bot paper: same bankroll/sizing/sweet band + `simulateClobFees`; verified ~$1.20 fee on ~$34 mid tickets.
- API: `GET /api/v1/pilot`, `POST /api/v1/pilot/connect`, `POST /api/v1/pilot/deploy`; envelope adds `botPaper`.
- Bot reset to $1000 paper and started; play.zinger.kierkegaard.space redeployed.

## 2026-07-26 22:30 UTC+1 — Three-app architecture
- **Experiment / core** `zinger.kierkegaard.space` (:3000, `data/`) — research bot; paper book published to Playground via `GET /api/v1/bot-paper` + `/paper` stream.
- **Pilot** `usezinger.xyz` (:3010, `data-pilot/`, `apps/pilot`) — separate Rainmaker-class product: connect wallet, deposit/withdraw, strict rules, signals trade available bankroll. Not a Playground tab.
- **Playground** `play.zinger.kierkegaard.space` — signals + charts + published experiment paper only; links out to Pilot.
- Deploy: `deploy/start-pilot-instance.sh`, systemd units, Traefik `traefik-zinger-xyz.yaml` (usezinger.xyz + zinger.xyz → :3010).

## 2026-07-26 22:35 UTC+1 — Experiment paper bot restarted
- Auth + `POST /api/poly/start` on :3000; paper book preserved (equity ~$1107.98, WR 61.5%, fees ~$32.36, 4 opens).
- `/api/v1/bot-paper` + `/api/v1/paper` publish `source=experiment_bot` with `running:true` for Playground Signals.
- Pilot :3010 remains separate (bot stopped by design; product UI only / own data dir).

## 2026-07-26 22:40 UTC+1 — Core bot monitor
- Closed 4 orphan paper positions (expired windows never settled after restart; exits only run on current slug).
- Cash restored ~$1107.98 flat; orphan-settle added in bot scan loop for next restart.
- Armed 45s action/trace monitor on experiment :3000.

## 2026-07-26 22:50 UTC+1 — Fee sim + data assurance
- Fee bug: settle/redeem was charged as CLOB taker exit. Now exit fee $0 on settle/window_close/redeem; mid-window TP/SL/trail still pay C×0.07×p×(1-p).
- Data assurance: `src/polymarket/dataAssurance.js` + `GET /api/v1/data-health`; buys blocked on missing mids/spot/signals/orphans/ledger. Price-to-beat restored (derive eventStartTime; include on live market payload).
- Orphan paper settle runs at scan start; PTB fetch bounded 3.5s.

## 2026-07-26 23:05 UTC+1 — Pilot prod edge
- Installed Coolify Traefik `/traefik/dynamic/usezinger.yaml` → `10.0.1.1:3010` for usezinger.xyz / www / zinger.xyz.
- Spaceship DNS script `deploy/set-usezinger-dns.sh` ready; needs API **secret** (key alone 401). Domain NS already Spaceship launch1/2.
- Pilot restarted with SITE_URL=https://usezinger.xyz; secrets gitignored (`deploy/spaceship.env`, `deploy/pilot.env`).

## 2026-07-26 23:28 UTC+1 — usezinger.xyz DNS live
- Spaceship API set A `@` + `www` → `109.205.181.119` (ttl 300) on usezinger.xyz. zinger.xyz not in account (404).
- Traefik route already on Coolify; waiting Let’s Encrypt once public resolvers flip off old Vercel IPs.

## 2026-07-26 23:36 UTC+1 — usezinger.xyz serving
- DNS A `@`/`www` → 109.205.181.119 via Spaceship API.
- UFW blocks docker→host:3010; Pilot runs as `zinger-pilot` on coolify network; Traefik → `http://zinger-pilot:3010`.
- HTTPS 200 with Traefik default cert until Let’s Encrypt (Cloudflare DNS challenge won’t cover Spaceship zone).


## 2026-07-27 00:55 UTC+1 — WR/TP fix + real CLOB fees + Pilot ModeRail

### Bad WR + ~$1 TP on ~$36 entry
- Cause: stored paper profile had `tpPctLow/High 8–16`, `partialTpFrac 0.5`, `partialSellPct 0.55`, `trailActivateFrac 0.4` → early partials left tiny residual TP$.
- Fix: live config + defaults → TP **18–36%**, partial **0.78 / 28%**, trail activate **0.72**, `minTpUsd: 5`, minConfidence **0.38**. Governor `scalp` overlay aligned.
- Bot `buildTradePlan` floors full TP$ via `minTpUsd`.

### Fees = real CLOB schedule (not forced category alone)
- `src/polymarket/fees.js` now resolves `GET /markets-by-token` → `/clob-markets` `fd.r`/`fd.e` + `/fee-rate` `base_fee` (order bps).
- Formula matches `@polymarket/clob-client-v2`: `shares × rate × (p×(1−p))^exponent`. BTC 5m currently r=0.07 e=1 (= docs crypto).
- Paper open/partial/close use token schedule when `useClobMarketFees` (default on). Settle/redeem still $0 exit fee.

### Pilot UI (Rainmaker layout model)
- No separate Rainmaker design `.md` existed; pulled live rainmaker.fun funnel/copy/colors into this log + rebuilt `apps/pilot/public/index.html`.
- **Rainmaker UI design brief (for Pilot):**
  - Near-black canvas `#0a0a0c` / `#0D0D0F`, pink accent `#FF0066`, cyan `#0EA5E9`, green `#0EE957`.
  - Top bar: logo · product links · Connect.
  - Hero one-composition: brand-forward headline, one lede, primary fund CTA (not a KPI dashboard).
  - Funnel strip: Hold/access → Generate wallet → Fund pUSD → Agent trades (we map to Connect → Fund → Rules → Signals; no $RAIN gate).
  - Performance + Settled tape below the fold.
  - CSR Next/Privy; Inter on their side — Pilot uses Syne/Manrope/IBM Plex Mono to stay on-brand.
- Pilot now has a full **Paper | Live** `mode-rail` matching core `PolyDashboard` ModeRail (not a buried select).
- Docker pilot serves bind-mounted `/app/apps/pilot/public` — live on usezinger.xyz after refresh.

### Ops
- Experiment `:3000` restarted with new fee/TP code; paper bot re-armed (`running:true`, cash preserved ~$1189).
- Pilot docker restarted; ModeRail present in HTML.


## 2026-07-27 10:10 UTC+1 — Zinger consumer app (Next.js) on Vercel

### Three frontends (unchanged split)
- **Core** `zinger.kierkegaard.space` — VPS `:3000` (experiment bot + `/api/v1`)
- **Playground** `play.zinger.kierkegaard.space` — existing Vercel `playground` (untouched)
- **Zinger app** `usezinger.xyz` — **new** Vercel project `zinger-app` (`prj_VH5dRsX48YogYkQhBJ6ExbuxsBTR`)

### App
- Next.js 15 App Router in `apps/pilot` (product chrome: **Zinger**, not Pilot)
- `/` landing (connect wallet) → `/app` dashboard (Paper/Live rail, account, deposit 1% fee, bands, session, PnL/tape)
- Env: `NEXT_PUBLIC_API_URL=https://zinger.kierkegaard.space/api/v1`
- Prod: https://zinger-app-two.vercel.app · domains usezinger.xyz + www

### Backend
- `src/api/pilotLedger.js` — per-wallet accounts, deposit/withdraw, rules, session start/stop
- Public paper opens gated on `session.running` + account bands
- Extended `/api/v1/pilot*` routes on Core

### DNS / ops
- Spaceship A `@`/`www` → `76.76.21.21` (Vercel); Contabo A removed
- Removed Coolify Traefik `usezinger.yaml`; stopped `zinger-pilot` docker (UI retired)
- `deploy/set-usezinger-dns.sh` default IP now Vercel anycast

## 2026-07-27 10:15 UTC+1 — Zinger UI rebuild (shadcn / Rainmaker-style)

### What changed
- Replaced custom CSS funnel UI with **shadcn/ui** + Tailwind v4 dark theme (void `#07070a`, cyan primary, green PnL).
- Landing `/`: Rainmaker-style hero — one headline, connect CTA, three feature cards (no numbered 01–04 funnel strip).
- Dashboard `/app`: shadcn Cards, Tabs (Open/Tape/Settled/Account), ToggleGroup Paper/Live, wallet dropdown, Sonner toasts.
- Removed legacy `ModeRail.tsx` / `PnlCards.tsx`; shared chrome in `components/site-header.tsx`.
- Inter typography; build + `vercel --prod` → https://usezinger.xyz (deployment `dpl_CPZ26yD1mVdit4oR4KB72XfNSkgr`).

## 2026-07-27 10:40 UTC+1 — Landing content expansion + RainbowKit auth + TanStack Query

### What changed
- Landing `/` rebuilt to include **About**, **The system**, **Features**, and final CTA sections with responsive shadcn layout.
- Wallet UX moved to **RainbowKit** (`wagmi` + `viem`) with connect state wired to dashboard routing and compact connect control in header.
- Added app-level providers (`WagmiProvider`, `QueryClientProvider`, `RainbowKitProvider`) in Next layout.
- Added robust wallet auth state handling (`disconnected`, `connecting`, `syncing`, `ready`, `error`) via `useWalletAuth` + `WalletAuthGate`.
- Refactored `/app` to TanStack Query hooks + service layer (`pilot.service.ts`) for snapshot polling and all mutations (account mode, deposit, withdraw, rules, session).
- Added env surface for WalletConnect project id in `apps/pilot/.env.example` (`NEXT_PUBLIC_WC_PROJECT_ID`).

### Deploy
- Local build passed (`npm run build`).
- Production deploy completed and aliased to https://usezinger.xyz
- Deployment: `dpl_CFpvQbaU1QizXPQtMsSKghMRrVnV` (`https://zinger-9gwjafylr-davidglitcs-projects.vercel.app`).

## 2026-07-27 13:10 UTC+1 — Core bot infra audit (feeds, Telegram, proxy/geo)

### Findings
- **Telegram broken** — running process had `TELEGRAM_DISABLED=1` (not in `.env`); duplicate `node index.js` PIDs caused `409 Conflict` on polling. Fixed: single restart with `env -u TELEGRAM_DISABLED`; log shows `[tg] Telegram bot active`.
- **CLOB UP/DOWN** — `refreshLiveMarkets()` only fetched CLOB mids when `botState.running`; public feed showed Gamma-only prices while bot stopped. Fixed: always prefer CLOB when `useClobMids !== false`; tag `priceSource` on markets.
- **Binance feed** — OK (REST signals + WS spot ticks, age <2s).
- **Chainlink feed** — OK (price-to-beat open on 2/2 current windows via `polymarket.com/api/crypto/crypto-price`).
- **SOCKS proxy** — `CLOB_PROXY_URL` at `64.137.96.74:6641` **timing out**; CLOB mids fall back to Gamma. Live orders would fail until proxy replaced.
- **Geo** — VPS direct egress `109.205.181.119` → **FR blocked** by Polymarket. Proxy geoblock also times out. `/api/v1/data-health` now exposes `geoblock.direct`, `geoblock.viaProxy`, and `feeds.clob.proxy`.
- **Paper orphan** — 1 open position past window end blocking buys (`orphan_paper`); needs settle sweep or manual close.

### Code changes
- `bot.js` — CLOB mids always on for market refresh (not only when bot running).
- `clob.js` — `priceSource` metadata (`clob`/`mixed`/`gamma`).
- `proxyEnv.js` — `checkGeoblockDirect()`, proxy-fail fallback, `checkProxyHealth()`.
- `publicPredictions.js` — `/api/v1/data-health` expanded with `feeds` + `geoblock` blocks (4s timeouts).

## 2026-07-27 20:30 UTC+1 — Live CLOB order smoke test (Dublin / Japan / Austria)

### Geoblock
- Contabo FR direct: `blocked: true`
- Vercel `dub1` (IE): `blocked: true` but CLOB reachable
- Webshare JP Tokyo `82.22.93.216`: `blocked: true` (country JP)
- Webshare AT Vienna `87.86.8.138`: **`blocked: false`** (country AT)

### Tiny non-fillable BUY @ 0.01 × 5sh then cancel — all three succeeded
| Egress | Order accepted | Cancelled |
|--------|----------------|-----------|
| Dublin Vercel `/api/proxy/clob` | yes (`live`) | yes |
| Austria Webshare → `clob.polymarket.com` | yes (`live`) | yes |
| Japan Webshare → `clob.polymarket.com` | yes (`live`) | yes |

### Ops
- Primary write egress set in `.env`: `CLOB_PROXY_URL` → Austria HTTP
- Fallback write host remains `CLOB_PROXY_API_URL=https://usezinger.xyz/api/proxy/clob` (dub1)
- Proxies saved gitignored: `data/webshare_proxies.txt` (chmod 600)
- Policy: CLOB **reads** stay direct from VPS; **writes** only via AT/Dublin; TG/pilot must not dial Webshare

## 2026-07-28 00:53 UTC+02:00 — CLOB WebSocket mids + session ledger + live egress wiring

### What shipped
- **CLOB WS** (`src/polymarket/clobWs.js`) — direct `wss://ws-subscriptions-clob.polymarket.com/ws/market`; REST reads stay direct (no Webshare burn).
- **Pricing** — `getPricesForMarket` prefers WS mids (`_source: clob-ws`); scan path now sets top-level `priceSource`; public markets map includes `priceSource || prices._source`.
- **Session ledger** (`data/session_ledger.json`) — start/stop traces, 20s reconcile; baseline equity/cash taken from `buildPortfolio` at bot start (fixes false session PnL gap).
- **Write egress** — live orders via Austria `CLOB_PROXY_URL` → `clob.polymarket.com`, Dublin `CLOB_PROXY_API_URL` fallback; FR VPS stays blocked for geo.
- **Public APIs** — `/api/v1/session`, `/api/v1/clob-stream`, richer `data-health` + pilot `liveTrading` block for usezinger UI agent (no pilot page edits).

### Verified live
- WS connected, ~16 books, `priceSource: clob-ws` on current BTC/ETH windows.
- Bot paper session running; edge gate `liveAllowed: true`; Austria geoblock `blocked: false`.
- Mode left on **paper** — live plumbing ready; flip only when explicitly requested.

### Ops
- Single `node index.js` (pid after restart); Telegram enabled; avoid duplicate processes (409).

### Follow-up — near-settle WS mids
- Widened usable mid to `(0, 1)` (was `(0.01, 0.99)`); near-expiry books were rejecting WS and falling back to Gamma despite live books.

## 2026-07-28 01:22 CEST — Core live 5m smoke (aggressive Kelly)

### Setup
- Stopped paper; `mode=live`; Kelly frac **0.9**, max ticket **$12** (~85% of $14.18 CLOB), `useAggressiveScaling`, `announceBeforeTrade=false`, `arbOnlyUntilEdge=false`.
- Austria write egress geoblock `blocked:false`.
- Duration ~5m then `stop immediate`.

### Execution observed (this window)
- Real CLOB buys with `orderId` (verified).
- Exits: **SL** (with `sellOrderId`), **dd** / disaster, **hold_to_settle** attempt, final **panic** flatten via `/api/poly/sell-all`.
- Session ledger: **4 trades · session PnL −$5.58** (start cash $14.18).
- No clean **TP** hit this window (market moved against BTC UP entries).
- Leftover redeemable junk: `btc-updown-5m-1784643600` (size 1.923, value $0).

### Aftermath
- Flattened open `btc-updown-5m-1785194400` via sell-all.
- Restored `mode=paper`; retamed live profile caps ($2 / kelly 0.08).
- Bot left **stopped**.

### Follow-ons (queued)
1. Finish pilot / usezinger app (live session UX + E2E).
2. Management heuristics model for dynamic placement/management.
3. Expand markets: **15m / 30m / 1h**.

## 2026-07-28 01:37 CEST — Live account accounting hardened

### Root cause
- Bot booked LIVE exits (dd/sl) **without successful CLOB sells** → fake losses.
- Polymarket closed-positions showed truth e.g. BTC 7:15–7:20PM ET **+$15.01** (42.1 Up @ 41.4¢) while bot marks were **−$4.84**.
- Session PnL used equity Δ / stale baseline → false “wins”.

### Fixes
- New `src/polymarket/liveAccount.js` — PM `closed-positions` + `activity` + CLOB cash ledger (`data/live_account.json`).
- APIs: `GET/POST /api/v1/live-account`, `/api/v1/live-account/sync`; attached to `/api/v1/session`.
- LIVE close: sell must succeed; settle failure → `pendingRedeem` (no invented PnL).
- Drawdown / partial: no phantom closes on failed sells.
- Live portfolio marks only bot-tracked PM inventory; session PnL = verified fill Δ.
- Restart: single `node index.js` (avoid TG 409).

## 2026-07-28 03:54 CEST — Account audit resolved + Core/Pilot Account surfaces

### Account audit
- Paper fill-book R+U vs equity-net no longer surfaces as an audit note (equity path is canonical when cash+marks identity holds).
- Live: drop expected bot↔PM / cashΔ vs fill-book drift notes; hard-fail only on portfolio cash ≠ CLOB.
- Verified: `cashAudit.ok=true`, `issues=[]`, `notes=[]` on `/api/poly/account` and `/api/v1/pilot`.

### Core Account tab
- `AccountPage` + `LiveTickStrip`: USD equity curve, best trades, session PnL snapshot image, NLP headline, score-strip carousel (actions / ML / CLOB depth).
- Frontend rebuilt → `frontend/dist`.
- Auth: `GET /api/poly/account`, `GET /api/poly/narrative`.

### Public traces (pilot → core)
- `GET /api/v1/account` — narrative, liveScoreCards, accountBook (curve/best/snapshot), cashAudit.
- `/api/v1/pilot` already exposes `narrative`, `liveScoreCards`, `accountBook`, `cashAudit`.
- Pilot Account tab wired to those fields; build + Vercel prod deploy.

### Ops
- Single `node index.js` on `:3000` after clearing duplicate TG 409 instances.

## 2026-07-28 04:12 CEST — Pilot polish · management heuristics · multi-duration markets

### Pilot / usezinger
- Landing: Syne + Manrope, brand-first hero, honest 5m/15m copy (30m/1h when Gamma lists).
- Dashboard: Start/Stop session as primary CTA; Fund vs Bands split; paper credit vs USDC deposit separated; duration selector in bands; live opens from bot inventory; unrealized from open marks.
- Rules: `durations` persisted in pilot ledger; paper executor uses per-duration entry windows.
- Deployed usezinger.xyz prod.

### Management heuristics
- `fundHeuristics.js`: `resolveEntryWindows`, `overlayPlanWithHeuristics`, `manageEnvironment` (+ duration priors).
- Wired into `buildDecision` (timing + conf floor), `buildTradePlan` (TP/SL blend), buy gate (heat / per-duration opens).
- Seeded `durationPolicies` for 15m/30m/1h in `fund_heuristics.json`; trainer always writes priors.

### Markets 15m / 30m / 1h
- Discovery already scanned all four; Gamma currently serves **5m + 15m** (30m/1h empty lists).
- Fixed enrich path dropping `duration` / hardcoding 5m `durationSec`.
- Public `/api/v1/markets` includes `duration`; windows.js endTime fallback maps 30m/1h correctly.
- ML refresh uses longest live book duration for ladder activation.
- Pilot paper entry windows: 5m≤280s, 15m≤800s, 30m≤1600s, 1h≤3200s.

## 2026-07-28 09:18 CEST — Live sell-path debug logging

### Bot diagnostics
- Added targeted live exit logging in `src/polymarket/bot.js` for early SL, partial, SL, TP, dd, and settle sell submissions.
- Each log now includes requested shares, bot-tracked shares, matching PM readiness inventory, redeemable/mergeable flags, token id, and CLOB/spendable balances so split-fill or stale-balance sell failures are easier to diagnose.

## 2026-07-28 09:41 CEST — Governor drawdown peak scoped by mode

### Root cause
- The governor was comparing live equity (`~$32`) against an old paper peak (`$2250.24`), producing fake `98.6%` drawdown and forcing `arb-only`.

### Fix
- `src/ai/governor.js` now tracks `peakEquity` and breaker state per mode (`paper` vs `live`) and restores that state from disk.
- Switching modes no longer reuses the other mode’s peak, so live governor drawdown can’t inherit paper equity.

## 2026-07-28 09:50 CEST — Core rebuild + redeploy

### Core app
- Rebuilt the Core frontend bundle in `frontend/` with `vite build`.
- Restarted the live `node index.js` server so `/poly` serves the fresh `frontend/dist` assets.
- Verified local Core health on `http://127.0.0.1:3000/poly` and confirmed the new asset hash `/assets/index-DBFUziEk.js` is being served.
## 2026-07-28 11:30 CEST — Account tab header cleanup

### UI
- Removed duplicate `LiveTickStrip`, NLP headline card, and score-strip card from `frontend/src/pages/AccountPage.jsx` (those already render in the global Core header strip).
- Added `PageIntro` wrapper for the Account tab and tightened layout: KPI row, equity + session snapshot, best trades + trace detail.
- Rebuilt `frontend/dist` so `/poly` Account tab no longer stacks duplicate headers.

## 2026-07-28 15:26 CEST — Behavior save guard + profile isolation fix

### Root cause
- Saving behavior with `mode` in the same payload could write strategy knobs into the previous active profile.
- `minPositionSize`/`maxPositionSize` conflicts were only caught later in scan eligibility, so saves succeeded but trading was blocked.

### Fix
- `src/polymarket/modeConfig.js`: `applyConfigPatch` now targets the explicit `patch.mode` profile and normalizes sizing so `maxPositionSize` is never below `minPositionSize`.
- `frontend/src/PolyDashboard.jsx`: Behavior form now switches draft values from `poly.profiles.paper/live` when mode changes, and normalizes min/max before submit with a toast note.
- Rebuilt frontend and restarted Core server.

## 2026-07-28 15:45 CEST — Polymarket-style charts + live prep

### Charts
- Reworked `frontend/src/components/ChartPanel.jsx` to a Polymarket-like probability chart: stepped YES/NO paths, gradient fills, right-edge time marker, and tighter % axis labels.
- Reworked `frontend/src/components/SpotChart.jsx` to a denser trading-chart style: stepped spot path, glow line, panel grid, right-side price axis, and live last-price marker.
- Rebuilt frontend assets.

### Live prep
- Synced balances and re-ran readiness checks: `liveReady=true`, `needs=[]`, spendable pUSD `$29.35`.
- Set mode to `live` while keeping bot stopped for controlled test start.
- Kelly sizing active with isolated live profile (`useKellySizing=true`, `minPositionSize=maxPositionSize=$5` currently).

## 2026-07-28 16:26 CEST — Live 5m config test (fixed bounds)

### Requested profile applied
- Live profile set to `minPositionSize=1.5`, `maxPositionSize=2.5`, `enabledDurations=["5m"]`, partial TP active (`partialSellPct=0.25`, `partialTpFrac=0.74`), larger TP band (`tpPctLow=38`, `tpPctHigh=92`), tighter SL (`slPct=7`, adaptive floor `minAdaptiveSlPct=5`).
- Readiness reflected the requested sizing clamp exactly during run prep: `minOrderUsd=1.5`, `maxOrderUsd=2.5`, `liveReady=true`.

### Perf run outcome
- A clean 5-minute live window was executed with optimizer overrides disabled (`llmOptimize=false`), and no entries were opened in that window (`trades=0`, `wins=0`, `losses=0`, `pnl=0`).
- Post-run protection was re-applied by disabling live execution (`enabled=false`, `autoApproveLive=false`) while preserving the requested 5m/1.5-2.5 config values for the next controlled run.

## 2026-07-28 16:35 CEST — Live book cleanup + audit green

### Cleanup action
- Executed `POST /api/poly/live-reset` with confirmation to clear stale live tracker history and re-baseline to current CLOB cash.
- Reset removed legacy live tracker artifacts (`removed.trades=38`, `removed.positions=38`) and set baseline to `$14.274288`.

### Verification
- Re-ran `GET /api/poly/audit` immediately after reset: `ok=true`, `issues=[]`, `wallet.botOpen=0`, `wallet.pmPositions=0`, `liveReady=true`.
- Bot remains stopped/safe after cleanup (`running=false`) with clean live book state for the next controlled session.

## 2026-07-28 16:54 CEST — Live SL pressure reduction patch

### Live risk profile update
- Increased live stop room to reduce chop exits: `slPct` from tight mode to `12`, adaptive floor `minAdaptiveSlPct=9`, and underdog disaster SL `holdToSettleDisasterSlPct=36`.
- Delayed/softened profit harvesting to avoid early stop-outs after partials: `partialTpFrac=0.82`, `partialSellPct=0.18`, `trailActivateFrac=0.84`, `trailDistanceCap=10`.

### Execution gating
- Kept 5m execution live but relaxed entry timing gate slightly (`minRemainingSec=15`) so valid late-window entries are less likely to be skipped.
- Verified active live config applied while session running via `/api/poly/state` snapshot.

## 2026-07-28 17:11 CEST — PM-first live reconciliation guardrails

### Bot sync hardening
- Added PM-first inventory reconciliation helpers in `src/polymarket/bot.js` to match live positions by token id (fallback slug/outcome) and compute PM-available shares before each live exit path.
- Patched `scanOpenExitsFast`, early-SL, and `closePosition` live sell branches to clamp requested shares to PM inventory, and to auto-clear ghost local opens as `sync_stale` when PM inventory is zero.

### Result
- Eliminates repeated live sell retry loops on non-existent inventory (`no match` / not-enough-balance drift path).
- Cleared existing stale opens with `POST /api/poly/live-reset` and verified clean audit: `ok=true`, `issues=[]`, `wallet.botOpen=0`.

## 2026-07-29 10:31 CEST — Paper smoke test

### Setup
- Restarted Core (server had dropped), switched to paper (`mode=paper`, `autoApprovePaper=true`, `autoApproveLive=false`, 5m only).

### Result (~2 min)
- Session `session-ms5tqda3` started cleanly in paper mode.
- Scanner healthy: markets flipped `hold/watch` → `buy`.
- Two paper entries filled: BTC UP @$0.69 and ETH UP @$0.54 ($5 each).
- Edge gate unlocked (`expectancy ~$1.68` on paper lookback).
- Stop queued at window end; bot remained paper with 2 open paper positions during smoke window.

## 2026-07-29 15:21 CEST — Paper SL-noise cleanup + governor adapt

### Simulation (last 200 paper trades)
- Winner: favorites band 0.55–0.85 with noise mid-SL skipped ≈ **62.5
## 2026-07-29 15:21 CEST — Paper SL-noise cleanup + governor adapt

### Simulation (last 200 paper trades)
- Winner: favorites band 0.55-0.85 with noise mid-SL skipped ~62.5% WR, 0% SL rate in surviving set, expectancy ~$10.92/trade.
- Baseline was ~36.5% WR with 40.5% SL exits.
- Strict entry>=0.60 alone still had ~49% SL rate — hold/settle bias matters more than filter alone.

### Code
- `kelly.js`: `holdToSettleFavorites` (+ favorite min/max) holds favorites to settle with disaster SL only.
- `modeConfig.js`: persisted new favorite-hold knobs.
- `governor.js`: trend-ride/scalp overlays now adapt price band, confidence floor, adaptiveSl off, remain-time, and favorite-hold so governor can switch clean vs chop profiles.

### Applied paper now
- Fixed broken `maxPrice=70` -> `0.85`, `minConfidence=0.55`, `slPct=22`, `adaptiveSl=false`, favorite hold on, governor enabled / pinned `trend-ride`.

## 2026-07-31 00:37 CEST — Core-only OSS cleanup (public orphan)

- Hardened `.gitignore`; untracked runtime `data/**` (disk ledgers kept); added `data/.gitkeep`.
- Scrubbed Core paths/host notes (`watch.js`, `ml/config.py`, `trade.js` CLOB write host, docker `SITE_URL`, proxy comments).
- Added MIT `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, Core `README.md`, `docs/architecture.md`, `docs/CREDENTIAL_ROTATION.md`.
- Published fresh orphan tree to public https://github.com/David-glitc/zinger-core (single commit; no live data history). Private `David-glitc/Zinger` remains ops source of truth.

## 2026-07-31 10:44 CEST — Public Core TypeScript overhaul

- Converted https://github.com/David-glitc/zinger-core backend `.js` → `.ts` (tsx runtime) and frontend `.jsx` → `.tsx`.
- Added `src/types/domain.ts`, `tsconfig.json` / `tsconfig.types.json`; most migrated files still `@ts-nocheck` pending per-file typing.
- Private ops tree `/home/david/Zinger` unchanged (still JS).

## 2026-07-31 10:55 CEST — zinger-core CI + perf/unit tests

- Added Vitest unit + perf budget suites and `.github/workflows/ci.yml` on public Core (typecheck, unit, perf, frontend typecheck/build).

## 2026-07-31 11:05 CEST — zinger-core contribution rules + Apache-2.0

- Public Core relicensed to Apache-2.0 (`LICENSE` + `NOTICE`); expanded `CONTRIBUTING.md`, added `CODE_OF_CONDUCT.md` and GitHub PR/issue templates.

## 2026-08-30 09:49 CEST — Zinger ↔ zinger-core harmonization; private tree converted to TypeScript

Closes the split opened on 2026-07-31, where the public Core was converted to TS
while this private ops tree stayed on JavaScript.

### Upstream sync state (nothing left to merge)
- `zinger-core` `origin/main` and `upstream/main` (NewGenesis04) are level, 0 commits
  apart either way. Upstream PRs #1, #2, #3 are all merged. The build agent's
  merge-and-sync-back task was already complete on the zinger-core side.
- The two repos share no git history (zinger-core was published as an orphan tree),
  so harmonization is a content-level sync, not a git merge.

### Alpha research preserved first
- Branch `alpha-research-safety` (pushed) commits the previously uncommitted
  jump-model work: `ml/regime_{jump,emit,backtest}.py`, `alphaFusion`,
  `scripts/paper-test`, and the governor/kelly/signal/bot wiring.

### Core adopted from zinger-core (branch `ts-harmonization`)
- 53 JS modules replaced by their TS counterparts; gained 18 modules this tree
  lacked: `arbEngine`, `positions/{manager,policy,settle}`,
  `scan/{cycle,inputs,exits}`, `engines/directional`, `telemetry/events`,
  `config/{resolver,attribution}`, `ctf/merge`, `ledger/cash`, `types/domain`.
- 27 of the 53 shared modules were byte-identical modulo `@ts-nocheck`; 26 had
  drifted (notably `bot` 4038→3821 lines, logic extracted into `scan/`).
- Also adopted: 22 vitest suites (243 tests), perf harness, tsconfigs, CI workflow,
  41 TSX frontend components, `docs/ENGINEERING_HANDBOOK.md`.
- `scripts/check-settlement.mjs` dropped for core's newer `.ts` (adds auth/readiness audit).

### Alpha research re-applied on the new architecture
- `signal.ts`, `kelly.ts`: research patches applied unchanged (were byte-identical).
- `governor.ts`: `detectRegimeFromModel` hand-ported onto the new `dataPath()` helper.
- `scan/inputs.ts`: fusion context load + book-imbalance refresh moved into
  `collectSignals`, where scan()'s signal phase now lives.
- `bot.ts`: per-market CLOB depth still feeds `botState.booksForFusion`.
- kelly's `realizedVol`/`calmBaseline` stay optional → unwired callers resolve to
  `volScale: 1`, so sizing behaviour is unchanged.

### Remaining JS converted
- `index`, `watch`, `src/dashboard`, and the automate/report/seed/trade-volume/
  migrate-sqlite/paper-test scripts.
- `public-api` (zinger-playground) → TS with its own tsconfig + tsx; stays a separate
  deployable keeping public-safe trimmed copies of signal/kelly/edge.
- `server/server.ts`: legacy unreferenced Robinhood server, converted not deleted.
- Dropped stale `frontend/jsconfig.json`.

### Verified
- Root typecheck clean; 243 unit tests + 4 perf tests pass.
- Playground typechecks, serves 200 on `/` and `/api/v1/docs`.
- Frontend typechecks and builds; `apps/pilot` typechecks clean (untouched).
- Runtime smoke: full import graph loads (server, bot 34 exports, blessed dashboard);
  alpha fusion, vol tilt and regime detection all execute. `loadFusionContext()`
  reads a live `data/regime_signal.json`.

### Known state / next steps
- 0 hand-written `.js`/`.jsx` left (the 2 remaining `.mjs` are pilot eslint/postcss configs).
- Type debt is real and deliberate (phased migration): 129 files still carry
  `@ts-nocheck` — src 68/71, frontend 43/45, scripts 10/10, public-api 7/7 — and root
  tsconfig has `strict`/`strictNullChecks` off. `apps/pilot` is the exception:
  126 files, `strict: true`, zero `@ts-nocheck`.
- Next: strip `@ts-nocheck` file-by-file (tests are already 24/25 clean, so start
  from the modules they cover) and raise strictness once src is clear.
- `detectRegimeFromModel()` currently returns null because the on-disk regime signal
  is older than its 6h freshness gate — rerun `ml/regime_emit.py` to re-arm it.
