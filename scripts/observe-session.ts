#!/usr/bin/env node
// @ts-nocheck
/**
 * Session observer — polls /api/poly/observability and logs to JSONL.
 *
 *   npm run observe
 *   npx tsx scripts/observe-session.ts --target=500 --interval=60
 *   npx tsx scripts/observe-session.ts --mutate   # also patch config + start bot (legacy)
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { appendFileSync, writeFileSync, mkdirSync } from 'fs';
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
const TARGET = Math.max(1, Number(args.target || 500));
const INTERVAL_SEC = Math.max(15, Number(args.interval || 60));
const MUTATE = args.mutate === 'true' || args.mutate === true;
const OUT_DIR = path.join(ROOT, 'data');
const LOG_JSONL = path.join(OUT_DIR, 'session-observe-500.jsonl');
const SUMMARY_JSON = path.join(OUT_DIR, 'session-observe-500-summary.json');

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

async function api(route) {
  const res = await fetch(`${BASE}${route}`, {
    headers: authCookie ? { Cookie: authCookie } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `GET ${route} → ${res.status}`);
  return data;
}

async function ensureConfig() {
  const patch = {
    maxOpenPositions: 4,
    maxConcurrentPerSlug: 1,
    governorEnabled: true,
    governorDrawdownPct: 0.10,
    enabled: true,
  };
  await fetch(`${BASE}/api/poly/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify(patch),
  });
  await fetch(`${BASE}/api/poly/start`, {
    method: 'POST',
    headers: { Cookie: authCookie },
  });
}

async function snapshot() {
  const obs = await api(`/api/poly/observability?eventLimit=20`);
  const s = obs.snapshot || {};
  return {
    ...s,
    sessionTarget: TARGET,
    observabilityStatus: obs.status,
    canTrade: obs.canTrade,
    alerts: obs.alerts || [],
    alertCount: (obs.alerts || []).filter((a) => a.severity !== 'ok').length,
  };
}

function logLine(row) {
  const pct = row.sessionTarget ? Math.round((row.sessionTrades / row.sessionTarget) * 1000) / 10 : 0;
  const brk = row.governorBreaker ? ' ⛔BREAKER' : '';
  const alertN = row.alertCount > 0 ? ` · ${row.alertCount} alert(s)` : '';
  console.log(
    `[${row.at}] ${row.sessionTrades}/${row.sessionTarget} (${pct}%)`
    + ` · sess PnL ${signedUsd(row.sessionPnl)} · equity ${usd(row.equity)}`
    + ` · DD ${row.drawdownPct}% · open ${row.openPositions}/${row.maxOpenPositions}`
    + ` · ${row.regime || '—'}${brk}`
    + ` · data ${row.dataAssurance?.canBuy ? 'ok' : 'BLOCK'}`
    + ` · sig ${row.signalHealth?.status || '?'}`
    + alertN,
  );
  for (const a of (row.alerts || []).filter((x) => x.severity === 'error').slice(0, 3)) {
    console.log(`   ⛔ ${a.title}: ${a.detail}`);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await ensureAuth();
  if (MUTATE) await ensureConfig();

  const boot = await snapshot();
  const startedAt = Date.now();
  const baselineTrades = boot.sessionTrades;

  console.log(`\n👁  Session observer — target ${TARGET} session closes`);
  console.log(`   session ${boot.sessionId} · baseline ${baselineTrades} closes already`);
  console.log(`   API → ${BASE}/api/poly/observability`);
  console.log(`   logging → ${LOG_JSONL}`);
  console.log(`   poll every ${INTERVAL_SEC}s${MUTATE ? ' · --mutate ON' : ''}\n`);

  const header = {
    observerStartedAt: new Date().toISOString(),
    sessionId: boot.sessionId,
    baselineSessionTrades: baselineTrades,
    target: TARGET,
  };
  writeFileSync(SUMMARY_JSON, JSON.stringify({ ...header, last: boot }, null, 2));
  appendFileSync(LOG_JSONL, JSON.stringify({ type: 'start', ...header, snapshot: boot }) + '\n');
  logLine(boot);

  const tick = async () => {
    try {
      const row = await snapshot();
      appendFileSync(LOG_JSONL, JSON.stringify(row) + '\n');
      writeFileSync(SUMMARY_JSON, JSON.stringify({ ...header, last: row, updatedAt: row.at }, null, 2));
      logLine(row);

      if (row.sessionTrades >= TARGET) {
        const done = {
          type: 'complete',
          at: row.at,
          elapsedMin: Math.round((Date.now() - startedAt) / 60000),
          ...row,
        };
        appendFileSync(LOG_JSONL, JSON.stringify(done) + '\n');
        writeFileSync(SUMMARY_JSON, JSON.stringify({ ...header, complete: done }, null, 2));
        console.log(`\n✅ Session target reached — ${row.sessionTrades} closes.\n`);
        process.exit(0);
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] observer error:`, err.message);
    }
  };

  setInterval(tick, INTERVAL_SEC * 1000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
