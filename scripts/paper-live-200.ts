// @ts-nocheck
/**
 * Live paper run — real bot on :3000 scanning Polymarket (not paper-test.ts simulation).
 *
 *   npx tsx scripts/paper-live-200.ts [--target=200] [--bankroll=150] [--no-reset] [--port=3000]
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { signedUsd, usd } from '../src/lib/money.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

const PORT = Number(args.port || process.env.PORT || 3000);
const BASE = `http://127.0.0.1:${PORT}`;
const TARGET = Math.max(1, Number(args.target || 200));
const BANKROLL = Number(args.bankroll || 150);
const SKIP_RESET = args['no-reset'] === 'true';

export const OPTIMIZED_PAPER = {
  minConfidence: 0.60,
  maxConfidence: 0.80,
  minPrice: 0.42,
  maxPrice: 0.68,
  enabledDurations: ['5m', '15m'],
  use15m: true,
  kellyFraction: 0.15,
  maxPositionPct: 0.14,
  maxPositionSize: 25,
  minPositionSize: 2,
  underdogMaxPrice: 0.42,
  counterMaxConfidence: 0.55,
  favoriteMinPrice: 0.50,
  favoriteMaxPrice: 0.72,
  holdToSettleUnderdogs: true,
  holdToSettleFavorites: true,
  holdToSettleDisasterSlPct: 48,
  adaptiveSl: false,
  governorEnabled: true,
  governorDrawdownPct: 0.10,
  clobArbEnabled: true,
  arbMinMarginPct: 0.006,
  minArbGap: 0.012,
  arbBankrollFrac: 0.10,
  maxArbPackages: 4,
  arbOnlyUntilEdge: false,
  autoApprovePaper: true,
  useSignals: true,
  useML: true,
  evalBothSides: true,
};

let authCookie = '';

async function ensureAuth() {
  const pw = process.env.AUTH_PASSWORD || process.env.ZINGER_PASSWORD;
  if (!pw) throw new Error('AUTH_PASSWORD missing in .env');
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  });
  if (!res.ok) throw new Error(`login failed (${res.status})`);
  const cookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  authCookie = cookies.map((c) => String(c).split(';')[0]).join('; ');
}

async function api(method, route, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(authCookie ? { Cookie: authCookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${method} ${route} → ${res.status}`);
  return data;
}

function closedPaper(trades) {
  return (trades || []).filter(
    (t) => t.mode === 'paper' && (t.closed || t.exitReason || t.exitPrice != null),
  );
}

function summarize(trades) {
  const closed = closedPaper(trades);
  const wins = closed.filter((t) => Number(t.pnl || 0) > 0);
  const pnl = closed.reduce((s, t) => s + Number(t.pnl || 0), 0);
  return {
    count: closed.length,
    wins: wins.length,
    wr: closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : 0,
    pnl: Math.round(pnl * 100) / 100,
  };
}

async function main() {
  console.log(`\n📋 Live paper run — target ${TARGET} closes · bankroll $${BANKROLL} · ${BASE}\n`);

  await fetch(`${BASE}/api/v1/health`).then((r) => {
    if (!r.ok) throw new Error('health check failed');
  }).catch(() => {
    throw new Error(`Zinger not reachable at ${BASE}`);
  });

  await ensureAuth();

  if (!SKIP_RESET) {
    console.log('♻️  Paper reset…');
    await api('POST', '/api/poly/paper-reset', { confirm: 'RESET PAPER', initialDeposit: BANKROLL });
  }

  console.log('⚙️  Optimized config…');
  await api('POST', '/api/poly/config', {
    mode: 'paper',
    enabled: true,
    paperBankroll: BANKROLL,
    paperInitialDeposit: BANKROLL,
    ...OPTIMIZED_PAPER,
  });

  console.log('🚀 Starting bot…');
  await api('POST', '/api/poly/start');

  const state0 = await api('GET', '/api/poly/state?lean=1');
  const baseline = closedPaper(state0.trades).length;
  const startedAt = Date.now();
  const outFile = path.join(ROOT, 'data/paper-live-200.json');

  const tick = async () => {
    const state = await api('GET', '/api/poly/state?lean=1');
    const closed = closedPaper(state.trades);
    const newCount = closed.length - baseline;
    const sum = summarize(state.trades);
    const gov = state.governor || {};
    const row = {
      at: new Date().toISOString(),
      newTrades: newCount,
      target: TARGET,
      totalClosed: sum.count,
      wr: sum.wr,
      pnl: sum.pnl,
      cash: state.config?.paperBankroll,
      running: state.running,
      profile: gov.profile,
      breaker: gov.breakerActive,
    };

    const { writeFileSync } = await import('fs');
    writeFileSync(outFile, JSON.stringify({ startedAt, baseline, ...row }, null, 2));

    console.log(
      `[${row.at}] ${newCount}/${TARGET} new · WR ${sum.wr}% · PnL ${signedUsd(sum.pnl)} · cash ${usd(row.cash)} · ${gov.breakerActive ? '⛔ BREAKER' : gov.profile || '—'}`,
    );

    if (newCount >= TARGET) {
      row.completedAt = Date.now();
      row.elapsedMin = Math.round((Date.now() - startedAt) / 60000);
      writeFileSync(outFile, JSON.stringify(row, null, 2));
      console.log(`\n✅ Done — ${newCount} new paper closes.\n`);
      process.exit(0);
    }
  };

  await tick();
  const iv = setInterval(() => tick().catch((e) => console.error(e.message)), 60_000);
  process.on('SIGINT', () => { clearInterval(iv); process.exit(0); });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
