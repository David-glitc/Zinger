
## 2026-07-23 07:20 UTC+1 — Spacing + logo + instant mode rail
- Logo (`/favicon.svg`) in sidebar + header; ZINGER wordmark; more content padding.
- Paper/Live flips optimistically (API was already ~5ms; UI was waiting).
- Quieter shell background; sidebar opens by default on desktop.

## 2026-07-23 07:25 UTC+1 — Mission dataflow canvas (Excalidraw-style)
- Rebuilt SystemFlow as HTML canvas: pan (drag), wheel zoom, +/- / fit / expand.
- Animated particles + hand-drawn nodes; larger board (340–420px, fullscreen expand).

## 2026-07-23 15:50 UTC+1 — Fix skewed CSS / zero padding
- Root cause: `App.jsx` always imported `legacy-terminal.css`, whose unlayered `*{padding:0}` beat Tailwind `@layer utilities` (all `p-*`/`px-*`/`m-*` collapsed).
- Lazy-load legacy App only on `/legacy`; scope legacy reset under `.app`.
- Restored dense NASA chrome (KPI/header/buttons); fixed invalid `overflow-anchor:auto` class; rebuilt `frontend/dist`.

## 2026-07-23 16:05 UTC+1 — Auth gate + nav pages
- RainbowKit wallet gate on `/` — only `0x…e600` enters; ConnectButton in header + sidebar.
- Nav grouped Ops / Book / Control; Behavior page; hash routes `#mission` `#markets` etc.; page intros.

## 2026-07-23 16:20 UTC+1 — Final wiring pass
- No legacy mount; Start button wired; log filters; MlBay schema fixes; denser mobile chrome; dist rebuild.

## 2026-07-23 17:00 UTC+1 — Legacy removed + denser chrome
- Deleted App/legacy CSS; WC project id; local unlock; tighter cards; dist rebuild.

## 2026-07-24 11:25 UTC+1 — Pages + AI + CLS/LCP
- Process page; live position marks; Feed AI chat; KPI net/realized/unrealized; layout reserves for CLS/LCP; dist rebuild.

## 2026-07-24 17:12 — Mission full page + nav KPIs + optimizer UI
- Removed global KPI hero; nav shows net/eq/cash/open/cycle; Mission denser summary.

## 2026-07-24 17:52 UTC+1 — Black sleek + live ticks
- Void black theme, LiveTickStrip with flash on price change.
