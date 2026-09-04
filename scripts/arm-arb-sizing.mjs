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
    forceArbOnly: true,
    clobArbEnabled: true,
    arbDynamicGates: true,
    assets: ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'],
    enabledDurations: ['5m', '15m', '4h'],
    use15m: true,
    arbMaxUsd: 100,
    arbBankrollFrac: 0.3,
    maxArbPackages: 12,
    maxArbPerSlug: 3,
    minArbGap: 0.006,
    arbMinMarginPct: 0.003,
    minArbLockedProfitUsd: 0.40,
    minArbLockedProfitPct: 0.45,
    minArbPackageUsd: 8,
    arbGapFloor: 0.003,
    arbMarginFloor: 0.0015,
    arbLockUsdFloor: 0.20,
    arbLockPctFloor: 0.25,
    arbPackageUsdFloor: 5,
    arbExitMode: 'merge',
    instantCtfMerge: true,
    arbSpreadMinBidSum: 0.985,
    arbSpreadMinCaptureFrac: 0.70,
    arbThirdLegHedge: false,
    arbReverseEnabled: true,
    paperInitialDeposit: 1000,
    requireDataAssurance: true,
    autoApprovePaper: true,
  }),
});
await fetch(`${BASE}/api/poly/governor/regime`, {
  method: 'POST',
  headers: h,
  body: JSON.stringify({ regime: 'arb-only' }),
});
await fetch(`${BASE}/api/poly/start`, { method: 'POST', headers: h });

const obs = await (await fetch(`${BASE}/api/poly/observability?eventLimit=5`, { headers: h })).json();
const state = await (await fetch(`${BASE}/api/poly/state?lean=1`, { headers: h })).json();
const s = obs.snapshot || {};
const mkts = state.markets || [];
const by = {};
for (const m of mkts) {
  const k = `${m.symbol}/${m.duration || '?'}`;
  by[k] = (by[k] || 0) + 1;
}
console.log(JSON.stringify({
  session: s.sessionId || state.session?.id,
  running: state.running,
  trades: s.sessionTrades,
  equity: s.equity,
  assets: state.config?.assets,
  durations: state.config?.enabledDurations,
  maxPkgs: state.config?.maxArbPackages,
  markets: mkts.length,
  bySymbolDuration: by,
  canBuy: s.dataAssurance?.canBuy ?? state.dataAssurance?.canBuy,
  dataNote: s.dataAssurance?.note ?? state.dataAssurance?.note,
}, null, 2));
