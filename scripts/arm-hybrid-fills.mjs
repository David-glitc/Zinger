/**
 * Hybrid fills arm — keep multi-asset CLOB arb hunting, unlock directional scalp
 * when books are efficient (no free S1/S2). Looser crumb arb floors + paper volume.
 */
import fs from 'node:fs';

for (const line of fs.readFileSync('/home/david/Zinger/.env', 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[k] == null) process.env[k] = v;
}

const BASE = 'http://127.0.0.1:3000';
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: process.env.AUTH_PASSWORD }),
});
if (!login.ok) throw new Error(`login ${login.status}`);
const cookies = (
  typeof login.headers.getSetCookie === 'function'
    ? login.headers.getSetCookie()
    : [login.headers.get('set-cookie')].filter(Boolean)
)
  .map((c) => String(c).split(';')[0])
  .join('; ');
const h = { Cookie: cookies, 'Content-Type': 'application/json' };

await fetch(`${BASE}/api/poly/config`, {
  method: 'POST',
  headers: h,
  body: JSON.stringify({
    mode: 'paper',
    enabled: true,
    forceArbOnly: false,
    arbOnlyUntilEdge: false,
    clobArbEnabled: true,
    arbDynamicGates: true,
    arbReverseEnabled: true,
    useSignals: true,
    governorEnabled: true,
    assets: ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'],
    enabledDurations: ['5m', '15m', '4h'],
    use15m: true,
    minArbGap: 0.004,
    arbMinMarginPct: 0.002,
    minArbLockedProfitUsd: 0.25,
    minArbLockedProfitPct: 0.30,
    minArbPackageUsd: 5,
    arbGapFloor: 0.002,
    arbMarginFloor: 0.001,
    arbLockUsdFloor: 0.10,
    arbLockPctFloor: 0.15,
    arbPackageUsdFloor: 3,
    arbMaxUsd: 100,
    arbSliceUsd: 15,
    arbBankrollFrac: 0.35,
    maxArbPackages: 16,
    maxArbPerSlug: 6,
    arbExitMode: 'merge',
    instantCtfMerge: true,
    maxOpenPositions: 8,
    minPrice: 0.22,
    maxPrice: 0.78,
    hardMinPrice: 0.08,
    hardMaxPrice: 0.92,
    underdogMaxPrice: 0.50,
    favoriteMinPrice: 0.50,
    minConfidence: 0.15,
    kellyFraction: 0.15,
    minRemainingSec: 20,
    minPositionSize: 2,
    maxPositionSize: 40,
    edgeMinTrades: 0,
    autoApprovePaper: true,
    requireDataAssurance: true,
    paperInitialDeposit: 1000,
  }),
});
await fetch(`${BASE}/api/poly/governor/regime`, {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ regime: 'scalp' }),
});
await fetch(`${BASE}/api/poly/start`, { method: 'POST', headers: h });

const obs = await (await fetch(`${BASE}/api/poly/observability?eventLimit=5`, { headers: h })).json();
const state = await (await fetch(`${BASE}/api/poly/state?lean=1`, { headers: h })).json();
const s = obs.snapshot || {};
console.log(JSON.stringify({
  session: s.sessionId || state.session?.id,
  running: state.running,
  forceArbOnly: state.config?.forceArbOnly,
  regime: s.regime,
  trades: s.sessionTrades,
  equity: s.equity,
  canBuy: s.dataAssurance?.canBuy ?? state.dataAssurance?.canBuy,
  dataNote: s.dataAssurance?.note ?? state.dataAssurance?.note,
  markets: (state.markets || []).length,
}, null, 2));
