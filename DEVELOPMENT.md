# Development log

## 2026-09-04 01:00 UTC+1 — Arb surface: SOL/XRP/DOGE + 15m/4h

Expanded discovery beyond BTC/ETH 5m. Gamma live series: **BTC/ETH/SOL/XRP/DOGE** × **5m/15m/4h**. Arb-only `assets` + `enabledDurations` updated; `maxArbPackages` 12. Spot tickers for SOL/XRP/DOGE. 30m/1h still unsupported on Gamma.

## 2026-09-04 00:30 UTC+1 — Dynamic relaxed arb gates

Loosened base floors (`minArbGap 0.6%`, lock \$0.40 / 0.45%, pkg \$8) and added `resolveArbGates` — scales down by window phase (early/mid/late/ending) and touch dislocation. Floors: gap 0.3%, lock \$0.20. `arbDynamicGates: true` in arb-only + arm script.

## 2026-09-04 00:00 UTC+1 — Two-stage arb surfaces + directional style audit

**Stage 1 (existing):** buy ask(UP)+ask(DOWN) when sum < 1 − fees.

**Stage 2 (new):** when bid(UP)+bid(DOWN) > 1 + sell fees → paper mint $1 pair and dual-sell into bids (`arbReverseEnabled`, `detectAndExecuteReverseBidPackage`). Live CTF split deferred. Per-leg bid/ask spreads are reported but flagged as scalp/maker (not locked arb).

**Surfaces:** `arbSurfaces.ts` → scan logs `ARB SURFACES`, state `arbSurfaces`, depth passed into spread-capture housekeeping.

**Directional audit:** `scripts/audit-directional-styles.mjs` scores trend vs scalp (WR, expectancy, side skew, hold time, exit mix) → `logs/directional-style-audit.json`.

## 2026-09-03 19:32 UTC+1 — Arb merge capture + package UI bank

**Problem:** ~\$0.30 on ~\$100 risk — crumb gaps + capital stuck until 5m settle (paper never CTF-merged).

**Strategy:** `arbExitMode: 'merge'` — paper simulates CTF merge at lock (\$1/share, fee-free `arb_merge`), live keeps on-chain merge + closes legs. Fallback `spread_or_settle` dual-sell when bidΣ ≥ 0.985 and ≥70% of settle edge. Entry floors: `minArbGap 1.0%`, `arbMinMarginPct 0.6%`, `minArbLockedProfitUsd \$1.25` / `1.2%` (refuse crumb). `arbThirdLegHedge` stubbed false.

**UI:** Positions + history bank UP+DOWN under `packageId` with package net PnL.

**Ops:** `scripts/arm-arb-sizing.mjs` updated; frontend rebuilt. Restart + re-arm required.

## 2026-09-03 13:49 UTC+1 — Better arb capture + upstream FOK port

**Capture:** always-on real ladders; `detectAndExecuteArbPackages` multi-fill up to `maxArbPerSlug` with residual depth; `minArbPackageUsd=15`; WS hunt prioritization; Leg2 from Leg1 fills.

**Upstream port:** `clobReceipts.ts`, `placeMarketBuy` FOK + `maxPrice`, `sellFloor`/`readSellFill`, failed-unwind leaves position open.

**Watch:** `session-mtliuacy`, observer target 200. PDF: `docs/reports/zinger-arb-session-review.pdf`.

## 2026-09-03 11:55 UTC+1 — Arb sizing fix + 200-trade watch

**Problem:** Packages capped at \$50 total (~\$25/leg); cash-based frac undersized next fills.

**Fix:** `arbMaxUsd=100` (~\$50/leg), `arbBankrollFrac=0.30`, `maxArbPackages=8`, size off `paperInitialDeposit`; `price_to_beat` no longer blocks buys in `forceArbOnly`. Session `session-mtletw2c`; observer target **200**. PDF: `docs/reports/zinger-arb-session-review.pdf`.

## 2026-09-03 08:13 UTC+1 — Overnight arb session PDF refresh

**Session `session-mtkjx6ra` still live:** 19 settled packages, **+\$68.84** (+6.88\%), equity \$1{,}052.62, 100\% package WR, 0\% DD, 19/19 UP/DOWN legs. PDF: `docs/reports/zinger-arb-session-review.pdf`.

## 2026-09-02 20:12 UTC+1 — Fix 0 markets / window boundary (isCurrent)

**Bug:** `isCurrent` used strict `slug === getCurrentSlug()` — at window boundaries bot stored NEXT slugs only → `0 mkts` scans. Scan log `cycle 3m` was **window time left**, not scan duration.

**Fix:** `isMarketWindowOpen()` from slug epoch/endTime; tradable filter uses wall-clock open window. Arb-only skips fused signal health recording + noisy FAIL alert.

## 2026-09-02 23:28 UTC+1 — Arb session review PDF (good stats)

**Session `session-mtkjx6ra`:** 5 arb packages, **+\$10.00** net (100\% package WR), \$1012.26 equity, 0\% DD, 50/50 UP/DOWN legs. PDF: `docs/reports/zinger-arb-session-review.pdf` (`npm run report:session`).

## 2026-09-02 22:15 UTC+1 — Fix 0-market scans (Gamma 403 + UTC window rehydrate)

**Root cause:** Gamma API returns **403 without User-Agent** → current window fetch failed → only NEXT slugs in cache → `selectTradableMarkets` returned 0. Signal health 100% down was a side effect (no markets, stale TA loop).

**Fixes:** `gammaFetch` with UA on all Gamma calls; discover prev/current/next slugs; `rehydrateMarketWindows()` recomputes `isCurrent` from UTC epoch (timezone-independent); suppress signal-health alerts when `forceArbOnly`.

## 2026-09-02 18:42 UTC+1 — 2mo arb backtest + live arb-only paper + PDF

**Backtest:** `--months=2 --arb-only --no-fetch` → **$10,039.81** (+$39.82, +0.40%), **44 arb packages**, 0 directional, 100% WR, 0 reloads, 63s. Saved `data/backtest/backtest-2mo-arb-2026-09-02T17-40-53.json`.

**Live:** `arbOnlyPaperStrategy()` + hard reset $1k, `forceArbOnly: true`, governor `arb-only`. Session `session-mtkdu9ic`. `npm run session:arb`.

**PDF:** `docs/reports/zinger-arb-run-report.tex` → `zinger-arb-run-report.pdf` (`npm run report:arb-pdf`).

## 2026-09-02 18:32 UTC+1 — Full status PDF report

**Source:** `docs/reports/zinger-status-report.tex`  
**Output:** `docs/reports/zinger-status-report.pdf` (compiled via Tectonic)  
**Contents:** executive summary, chronological work log, architecture, live snapshot (session-mtjqc931), PnL attribution, arb strategy, failure modes, prioritized roadmap, appendix commands.

Compile: `cd docs/reports && tectonic zinger-status-report.tex`

## 2026-09-02 08:50 UTC+1 — Arb leg exit labels (no more ±999% TP/SL)

Arb legs used `slPct/targetTp: 999` as a disable hack — showed as **SL -999% / TP +999%** in logs/UI. Replaced with `exitMode: 'settlement'`; UI/logs now say **hold to settle (arb package)**.

## 2026-09-02 07:40 UTC+1 — Loosen arb + 3 packages per slug

**`maxArbPerSlug: 3`** — same 5m window can stack up to 3 concurrent arb packages (was 1). Slug concurrency bumped to 6 legs during arb dispatch.

**Looser gates:** `minArbGap` 0.5%, `arbMinMarginPct` 0.2%, `maxArbPackages` 6. Applied to `directionalSessionStrategy` + defaults.

## 2026-09-02 05:16 UTC+1 — Directional 200-trade session (hard reset)

**Profile** `directionalSessionStrategy()` in `modeConfig.ts`: 30¢ band (0.25–0.35), TP/SL exits (no hold-to-settle), ML/strike forecast off, `arbOnlyUntilEdge: false`, governor auto on reset.

**Reset** `resetPaperData()` now calls `setGovernorAuto()` + `resetSignalHealth()` so directional isn’t stuck post-reset.

**Script** `scripts/directional-session-200.ts` + `npm run session:200` — hard reset $1k, apply session config, clear breaker, start bot, launch observer `--target=200`.

**Running:** session `session-mtjl2znc`, observer polling `data/session-observe-500.jsonl` every 60s.

## 2026-09-01 20:10 UTC+1 — Tune tab + live config + regime control

**Tune tab** (`/#tune`): regime rail (Auto/Scalp/Trend/Arb), quick presets (arb focus, directional, tight 30¢), live-saving engine toggles + sizing knobs, per-regime PnL, clear DD breaker.

**API:** `POST /api/poly/governor/regime` `{ regime }` or `{ auto: true }` · `POST /api/poly/governor/clear-breaker`

**Governor:** `manualLock` pins operator-chosen regime until Auto; DD breaker still overrides for safety.

**Behavior form:** `liveSave` — debounced 450ms auto-save (no submit button). Poll interval 250ms→2000ms (SSE handles realtime).

## 2026-09-01 20:00 UTC+1 — Observability layer

**Module** `src/polymarket/observability/` — unified snapshot + alert derivation (session PnL, gates, orphans, scan freshness, CLOB WS).

**API:**
- `GET /api/poly/observability` — full bundle (snapshot, alerts, telemetry)
- `GET /api/poly/observability/stream` — SSE push on state change

**UI:** Dashboard tab **Observe** (`/#observe`) — live alerts, data assurance checks, signal/edge, telemetry tail.

**CLI:** `npm run observe` — polls observability API (no config mutation unless `--mutate`).

## 2026-09-01 19:45 UTC+1 — Orphan paper block + stuck scan fix

**Root cause:** Scan loop hung mid-cycle (`lastScan` frozen ~17:23); a naked arb leg (`pkg-btc-mtixpxiv` UP) stayed open past window end → `orphan_paper` blocked all buys. Manual rapid-sell closed it but cached `_dataAssurance` never refreshed.

**Fixes:** `recomputeDataAssurance()` on paper sells + stale orphan/scan detection in `getDataAssuranceForState()`; 90s scan watchdog releases `_scanning` lock. Bot restarted — `canBuy: true`, scans flowing, observer still polling.

## 2026-09-01 19:30 UTC+1 — 6mo arb-only historical backtest (completed)

**Run:** `npx tsx scripts/historical-backtest.ts --months=6 --bankroll=10000 --reload=10000 --arb-only --no-fetch`

**Results (Mar 2 → Sep 1 2026, BTC+ETH 1m spot → synthetic CLOB):**
- Final cash **$10,060.08** (+0.60%), total PnL **$60.09**, **0 fund reloads**
- **74 arb packages** (0 directional), 100% win rate, 316k scan ticks
- Bayesian arb loop fired twice @25/@50 trades → loosened `minArbGap` 0.006→0.0055, `arbMinMarginPct` 0.003→0.0027, `arbBankrollFrac` 0.18→0.189
- Saved: `data/backtest/backtest-6mo-arb-2026-09-01T17-27-57.json`

**Engine fixes this session:**
- `--arb-only` CLI flag; skips fusion load + fast path (no analyze/regime per tick)
- `bookSim.ts` — stronger mispricing injection so sum&lt;1 gaps appear (~15% of ticks)
- Arb settlement bugfix — credit full `$1/share` payout on settle (was only adding locked profit, understating cash)
- `bayesian.ts` — arb-specific strata + `applyArbBayesianLoop` for gap/margin/frac tuning
- `candleIndexAt()` O(log n) for backtest scan performance

**Caveat:** No real Polymarket CLOB history — arb gaps are synthetic from `mispriceSeed`. Live hit rate will differ until we record WS book snapshots.

## 2026-09-01 12:30 UTC+1 — 6-month historical backtest engine

**New module** `src/polymarket/backtest/`:
- `fetchHistory.ts` — paginated Binance 1m fetch with disk cache (`data/backtest/candles-*.json`)
- `bookSim.ts` — synthetic Polymarket CLOB from spot/strike/vol + ladder for arbDepth walk
- `engine.ts` — full replay: analyze → alphaFusion → governor regimes → arb + directional → TP/SL/settle
- `bayesian.ts` — inline Beta-Bernoulli strata loop; patches minConfidence/kelly after losing streaks
- `scripts/historical-backtest.ts` — CLI: `--months=6 --bankroll=10000 --reload=10000`

Fund reload at $0 injects another $10k and records reload count. Results → `data/backtest/backtest-*.json`.

## 2026-09-01 11:16 UTC+1 — Governor back on, depth-aware arb, book edge

**Governor re-enabled** on classic paper (`governorEnabled: true`, DD breaker 12%).
Regime profiles updated to 25–38¢ band (matches directional target). Paper keeps
`arbOnlyUntilEdge: false` so directional + arb run together.

**Depth-aware arb** (`arbDepth.ts` + `estimateBuyForShares`):
- Walks BOTH ask ladders before locking a package — no more phantom touch fills
- Sizes down until net profit clears fees after slippage on each leg
- Arb scans **every market every cycle** when `clobArbEnabled` (not only arb-only mode)
- Paper arb: `minArbGap 0.006`, `arbMinMarginPct 0.003`, `arbBankrollFrac 0.18`,
  `arbMaxUsd 100`, `maxArbPackages 6`

**Directional:** `useBookMicrostructure: true` — ladder imbalance feeds buildDecision.

## 2026-09-01 02:00 UTC+1 — Restore classic paper architecture

**Problem.** Observer was polling every 60s while the bot was not trading: DD
breaker had locked `arb-only` at −12.7%, and `market_mids` data assurance was
hard-blocking buys whenever zero `isCurrent` markets existed (normal between
5m windows). Polling a stopped gate is useless.

**Fix.**
- Killed `observe-session` background process.
- Added `classicPaperStrategy()` in `modeConfig.ts` — pre-live flow:
  scan → TA + book bias → buildDecision → Kelly → TP/SL exit. Governor off,
  edge gate off, strike forecast off, ML off, hold-to-settle off.
- `dataAssurance.ts`: empty current-market set is `warn`, not `blockBuys`.
- Paper reset to **$1,000** clean slate (clears DD breaker + trade history).
- Applied classic profile, restarted bot, `maxOpenPositions: 4`, `5m` only.

**Classic vs layered (what broke paper):**
| Layer | Classic | Was blocking |
|-------|---------|--------------|
| Governor DD breaker | off | arb-only at 10% DD |
| Edge gate (40 trades) | off | arb-only until edge |
| Hold-to-settle favorites | off | full −$21/−$23 settle losses |
| Strike forecast veto | off | feed-skew false vetoes |
| ML override | off | 100% up degeneracy |
| market_mids assurance | warn if empty | blocked between windows |

## 2026-09-01 00:12 UTC+1 — 500-trade session observation started

**Session** `session-mthtx4v2` (started 2026-08-31T22:47:57Z). Observer attached without
resetting paper. Target: **500 session closes** on the current run.

**Config confirmed:** `maxOpenPositions: 4`, `governorDrawdownPct: 0.10` (breaker →
arb-only at 10% off peak equity, clears when DD recovers). Bot left running.

**Observer:** `npx tsx scripts/observe-session.ts --target=500 --interval=60`
(background). Logs:
- `/home/david/Zinger/data/session-observe-500.jsonl` — one JSON row per minute
- `/home/david/Zinger/data/session-observe-500-summary.json` — latest snapshot
- `/home/david/Zinger/logs/session-observe.log` — human-readable tail

Each snapshot records: session trade count/PnL, equity, drawdown %, governor
regime/breaker, open positions, edge gate, data assurance, signal health,
forecast/micro coverage, side balance, sizing.

**Baseline at observer start (1 session close):**
- Equity $951.41 · DD 4.86% off $1k peak · regime `trend-ride` · breaker off
- Edge gate: 10/40 directional closes needed before edge unlock (0% WR, -$43 all-time)
- Data assurance: score 100, all feeds ok
- Signal health: `warn` (ML 100% up, override suppressed) · `directionalTrustworthy: true`
- Book micro: 8/8 candidates · forecast: 0/8 (between-window / no strike on next markets)

**Data sanity notes:**
- Cash ledger delta ~$5.50 vs naive `initial + realized - deployed` — likely entry-fee
  timing on closed positions; not blocking but worth reconciling at 50+ closes
- SL exits now charge fees (e.g. feesPaid 0.15–0.18 on recent SLs) — prior bug fixed
- Session sizing ~$7.80/trade (validation cap, not the old $2.30)

## 2026-08-31 23:40 UTC+1 — Strike forecast, book microstructure, sizing repair

**Sizing.** Positions were $2.30 on a $1,000 bankroll. `resolveDynamicLimits`
takes `min(bankroll * maxPositionPct, maxPositionCap, maxPositionSize)`, and the
persisted config still carried `maxPositionCap: 4` from when the bankroll was
about $150, so the absolute cap bound at $4 and the percentage never applied.
Caps are now safety ceilings ($100) with `maxPositionPct` binding.

A second, quieter defect: `computeKellySize` scaled on `0.15 + conf * 0.25`,
which assumes confidence spans `[0, 1]`. After the confidence recalibration it
spans about `[0.05, 0.46]`, so the strongest signal the system can produce sized
within a few percent of the weakest, and the top two-thirds of the range was
unreachable. Added `sizingScalar` to interpolate across the band the signal
actually occupies. First position after the fix was $42.90 against $2.30 before.

**Strike forecast** (`strikeForecast.ts`). These markets resolve on a single
comparison: Chainlink close versus `openPrice` at the window open. Both operands
were already fetched every scan and neither reached the scorer, which was
inferring direction from RSI and MACD instead. Now computes
`P(above) = Phi(ln(P/S) / (sigma * sqrt(tau)))`, driftless, with sigma derived
from ATR via the `sqrt(8/pi)` range-to-stdev factor. Edge is netted against the
`rate * (1 - p)` fee before scoring, since measured fees were 3.49% of notional
against a 2.3% gross edge — un-netted edge has the wrong sign, not just the
wrong magnitude.

**The plausibility bound is the important part.** On first live check the model
claimed a 40-cent edge: BTC 5m, strike 78761.18, our spot reading 78768.01 (six
dollars *above* the strike, 77 seconds left) while the book priced UP at 7.5
cents. Inverting the market's price puts its implied spot near 78745, about $23
below our feed. The market was right. These windows settle on Chainlink, our
spot comes from another feed, and the gap that decides a 5m window is routinely
smaller than the disagreement between the two. A large computed edge is
therefore evidence of a data fault, never of opportunity. `MAX_PLAUSIBLE_EDGE`
(0.15) disables the forecast in both directions when exceeded — scoring it would
buy the wrong side on feed skew, and vetoing on it would block the right side
for the same reason. The model stays useful where it and the market broadly
agree and switches itself off exactly where it looks most exciting.

Verified against decided windows, where the two do agree: BTC $103 below strike,
model 0.030 against a market price of 0.005.

**Book microstructure** (`bookMicrostructure.ts`). The ten-level ladder was
computed, shipped to the UI and discarded by the decision path. Adds
distance-decayed imbalance, microprice tilt, a ladder-walking slippage estimate,
and a `quality` weight so a thin or wide book contributes proportionally rather
than being gated in or out. Note this sums `size`, not `value` as `clob.ts` does:
value-weighting a book whose bids rest below its asks reads -0.042 on a perfectly
symmetric ladder, a standing 4% bearish tilt from arithmetic alone.

Quality gates on spread in **cents, not percent**. The percentage version shipped
first and was wrong: a live 0.04/0.05 token reports `spreadPct` 22.2% but is a
one-tick spread, the tightest quote possible. Any percentage ceiling tight enough
to exclude genuinely wide books also excludes every cheap token, which is most of
the ladder in a market far from 50/50. First live check produced a microstructure
read on 1 candidate in 8; after switching to cents, 8 in 8.

**Order of operations correction.** Sizing was raised to ~$50/trade and then cut
back to ~$20 (still ~8x the old $2.30). Scaling 18x into an edge that has not yet
been demonstrated — the current sample is 7 closed trades, 0 wins — amplifies
whatever sign the expectancy has. The percentage returns to 5% once the forecast
shows positive expectancy over ~30 closed trades.

Tests: 364 passing, 48 of them new across the two modules.

**Open.** The forecast currently refuses whenever spot is older than 15s, which
may be often; frequency needs measuring. The deeper fix is sourcing spot from
the resolution feed rather than bounding the error from a different one.

## 2026-08-31 00:20 UTC+1 — Config precedence enforced on writes

**Problem.** Dashboard config changes appeared not to save. They did save; the
governor overwrote them. The store's own attribution log showed the same reverts
on repeat, roughly every 120s (a regime switch rewrites ~19 keys):

    paper.holdToSettleFavorites  true -> false  (governor)
    paper.minConfidence           0.6 -> 0.5    (governor)
    paper.kellyFraction          0.15 -> 0.1    (governor)
    paper.minConfidence           0.5 -> 0.48   (optimizer)

Read-side precedence (operator > guardrail > automation) existed in
`config/resolver.ts`; nothing enforced it on writes. A comment in that file had
flagged the gap as unresolved.

**Change.** Added `canWrite` and `partitionPatchByAuthority` to
`src/polymarket/config/resolver.ts`, wired into `saveConfig` in
`src/polymarket/bot.ts`. A writer may only claim a field whose current owner is
at or below its own tier. Automation still owns every field the operator has not
touched, so regime adaptation keeps working. Refused writes are logged with the
blocking owner rather than dropped silently.

Tests: `tests/unit/config-authority.test.ts` (11). Full suite 274 passing.

**Operational note.** The process serving :3000 ran as `index.ts`, not
`src/index.ts`, so `pkill -f "tsx.*src/index"` missed it and the replacement
could not bind the port — old code kept running. Kill by PID from
`ss -ltnp | grep :3000` and verify the listener's start time. Also: `enabled:
true` alone leaves `running: false`; the loop needs `POST /api/poly/start`.

## 2026-08-31 00:55 UTC+1 — Scalp profile, tuned to measured results

**Baseline** (15 closed, paper): 27% WR, -$2.81.

Breakdown that drove the change:

    5m   n=7  wr=43%  pnl=+3.06
    15m  n=8  wr=13%  pnl=-5.87

Two defects found in the price bands:

1. **Hold-to-settle dead band.** `underdogMaxPrice 0.42` and
   `favoriteMinPrice 0.50` left entries in 0.42-0.50 qualifying as neither
   underdog nor favorite, so nothing held them to settlement — while
   `minPrice 0.42` allowed entries right at that band's edge. Several 15m losses
   entered at 0.46-0.47, squarely inside it.
2. **Disaster stop supplies every loss.** `holdToSettleDisasterSlPct 48` cut
   positions at ~-48% of entry. On a binary settling 0/1 this caps recovery;
   winners in the same set ran 0.43 -> 0.98.

**Applied** (operator tier, so it now sticks): `enabledDurations: ['5m']`,
`minPrice 0.40 / maxPrice 0.65`, `underdogMaxPrice 0.50` (closes the dead band),
`holdToSettleDisasterSlPct 45`, `slPct 16`, `tpPctLow 16 / tpPctHigh 32`,
`minConfidence 0.50`, `counterMaxConfidence 0.50`, `kellyFraction 0.12`,
`minRemainingSec 35`.

**Open issue — UP monopoly.** All 15 closed trades are `up`. Both sides are
scored (`targetOutcomes = ['up','down']`) and a side-balance rule exists, but it
requires `edged.length >= 2` — both sides passing `passesEdgeFilter`. With
`edged.length === 1` it takes the only survivor, so if `down` never passes the
edge filter the balance rule never engages. Root cause not yet established.

## 2026-09-04 00:19 UTC — v1.2.0 multi-asset arb + UI desk

- Harmonized live arb leg risk check with upstream: drop hidden `capUsd*1.6` / `$4.5` floor for `isArbLeg` (directional keep); arb legs refuse only clear overshoot vs `arbMaxUsd`.
- UI: `ArbDesk` consumes live `arbSurfaces` / `arbMetrics` / `packages` on overview + observability; Tune adds asset/TF chips + dynamic gates / S2 reverse / lock floors.
- Package `1.2.0`. Arm script keeps BTC/ETH/SOL/XRP/DOGE × 5m/15m/4h, dynamic gates, paper merge exit, reverse bid.

## 2026-09-04 01:15 UTC — hybrid fills (more trades)

- Arb books showed 0 positive S1/S2 gaps (ask sums ≥1.01); forceArbOnly left session idle.
- Armed hybrid: scalp regime + CLOB arb still on; looser crumb arb floors.
- dataAssurance: price_to_beat no longer blocks all buys on partial Chainlink coverage (block only when zero strikes).

## 2026-09-04 — bot crash / downtime

- Process on :3000 was dead; observer only (`fetch failed` since ~07:28Z).
- Cause: `/api/poly/rl-signal` double-sent response → `ERR_HTTP_HEADERS_SENT` (timeout vs close race / catch after send).
- Fix: single-settle promise + `headersSent` guards. Bot restarted + hybrid re-armed.

## 2026-09-04 — arb slice sizing

- Explained: locked arb PnL scales with shares×gap; fat single takes often depth-limited so $50≠5×$10 upside.
- Added `arbSliceUsd` (live default $15) + raised `maxArbPerSlug` ceiling to 12; multi-fill walks residual asks.
- Tune UI exposes slice / per-slug. Rebuilt frontend.

## 2026-09-04 — +20 trade wait / systems+edge report

- Waited session-mtmor579 6→30 closes (~6m); window edge ~+$12 session / ~+$17 on 36 arb legs (ETH/SOL led).
- Found hung scan + false orphan_paper on 4h (300s window assumption). Fixed slug window seconds by TF; restarted & re-armed.
- Canvas: zinger-systems-edge-report.canvas.tsx

## 2026-09-04 — post-restart PDF report

- PDF from last documented restart (hung scan + 4h orphan fix): `docs/reports/zinger-post-restart-edge-report.pdf`
- Covers prior session-mtmor579 (+$42 / 42 closes) and post-restart desk (slice $15, hybrid). Scan hung again during PDF prep → restarted; canBuy restored.

## 2026-09-04 — PDF since $1000 paper reset (not process restart)

- Clarified: report scope = last `paper_reset_clean_slate` at 2026-09-03T10:43:57Z ($1000), all sessions since.
- Stats: equity ~$1171 (+$171), 130 closes, leg PnL +$240.61, 59/59 arb packages, 15 sessions.
- PDF: `docs/reports/zinger-since-1000-reset-report.pdf`
