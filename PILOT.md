# Zinger Pilot (private)

The **Pilot** consumer app is a separate product: connect wallet, deposit, strict rules, signals trade your bankroll on Polymarket-style windows.

It is **not** included in this public repository.

- **Private repo:** [David-glitc/zinger-pilot](https://github.com/David-glitc/zinger-pilot) (access required)
- **Stack:** Next.js 15 on Vercel, MongoDB `pilot_accounts`, Core API bridge

This public **Core** repo ships the operator bot, dashboard (`/poly`), ML regime layer, and public signal API. Pilot builds on top of those capabilities in a private tree.
