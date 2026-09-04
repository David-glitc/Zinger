#!/usr/bin/env node
// @ts-nocheck
/**
 * Hard reset + directional 200-trade session.
 *
 *   npx tsx scripts/directional-session-200.ts [--target=200] [--bankroll=1000]
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { directionalSessionStrategy } from '../src/polymarket/modeConfig.js';

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
const BANKROLL = Number(args.bankroll || 1000);
const SESSION_CFG = directionalSessionStrategy();

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

async function main() {
  console.log(`\n🎯 Directional session — ${TARGET} closes · $${BANKROLL} paper · ${BASE}\n`);

  await fetch(`${BASE}/api/v1/health`).catch(() => {
    throw new Error(`Bot not reachable at ${BASE} — run: cd Zinger && npm start`);
  });

  await ensureAuth();

  console.log('♻️  Hard reset paper…');
  await api('POST', '/api/poly/paper-reset', { confirm: 'RESET PAPER', initialDeposit: BANKROLL });

  console.log('⚙️  Directional session config (30¢ band, TP/SL, gates off)…');
  await api('POST', '/api/poly/config', {
    mode: 'paper',
    enabled: true,
    paperBankroll: BANKROLL,
    paperInitialDeposit: BANKROLL,
    ...SESSION_CFG,
  });

  console.log('🧭 Governor → auto (clear manual lock)…');
  await api('POST', '/api/poly/governor/regime', { auto: true });
  await api('POST', '/api/poly/governor/clear-breaker');

  console.log('🚀 Starting bot…');
  await api('POST', '/api/poly/start');

  const state = await api('GET', '/api/poly/state?lean=1');
  console.log(`   session ${state.session?.id || '—'} · regime ${state.governor?.profile || '—'}`);
  console.log(`   band ${SESSION_CFG.minPrice}–${SESSION_CFG.maxPrice} · arbOnlyUntilEdge ${SESSION_CFG.arbOnlyUntilEdge}\n`);

  console.log(`👁  Launching observer (target ${TARGET}, 60s poll)…\n`);
  const observer = spawn('npx', [
    'tsx', 'scripts/observe-session.ts',
    `--target=${TARGET}`,
    '--interval=60',
    `--port=${PORT}`,
  ], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  observer.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGINT', () => { observer.kill('SIGINT'); process.exit(0); });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
