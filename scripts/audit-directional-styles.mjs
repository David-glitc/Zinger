#!/usr/bin/env node
/**
 * Directional trend vs scalp audit from closed paper/live trades.
 * Usage: node scripts/audit-directional-styles.mjs [--mode=paper] [--limit=200]
 */
import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.readFileSync(path.join('/home/david/Zinger', '.env'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[k] == null) process.env[k] = v;
}

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const mode = args.mode || 'paper';
const limit = Number(args.limit || 300);
const BASE = args.base || 'http://127.0.0.1:3000';

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

const state = await (await fetch(`${BASE}/api/poly/state`, {
  headers: { Cookie: cookies },
})).json();

const trades = (state.trades || [])
  .filter((t) => t.closed && (!t.mode || t.mode === mode))
  .filter((t) => !(t.packageId || t.isArbLeg || t.engine === 'arb'))
  .slice(0, limit);

const TREND_PROFILES = new Set(['trend-ride', 'classic', 'hold', 'directional']);
const SCALP_PROFILES = new Set(['scalp', 'directional-session', 'session']);

function bucket(t) {
  const profile = String(t.governorProfile || t.profile || '').toLowerCase();
  const method = String(t.planMethod || t.method || '').toLowerCase();
  if (t.holdToSettle || method.includes('hold_to_settle') || method.includes('hold-to-settle')) return 'trend';
  if (SCALP_PROFILES.has(profile) || method.includes('regime_tp_sl') || method.includes('scalp')) return 'scalp';
  if (TREND_PROFILES.has(profile)) return 'trend';
  // Heuristic: long hold vs short
  const holdMs = Number(t.timestamp || 0) - Number(t.entryTime || 0);
  if (holdMs > 120_000) return 'trend';
  if (holdMs > 0 && holdMs < 90_000) return 'scalp';
  return 'other';
}

function scoreStyle(name, rows) {
  if (!rows.length) {
    return { style: name, n: 0, score: null, notes: ['no sample'] };
  }
  const wins = rows.filter((t) => Number(t.pnl || 0) > 0);
  const pnl = rows.reduce((s, t) => s + Number(t.pnl || 0), 0);
  const fees = rows.reduce((s, t) => s + Number(t.feesPaid || t.entryFee || 0) + Number(t.exitFee || 0), 0);
  const up = rows.filter((t) => String(t.outcome || '').toLowerCase() === 'up').length;
  const upShare = up / rows.length;
  const exits = {};
  for (const t of rows) {
    const r = String(t.exitReason || 'unknown');
    exits[r] = (exits[r] || 0) + 1;
  }
  const holds = rows
    .map((t) => (Number(t.timestamp || 0) - Number(t.entryTime || 0)) / 1000)
    .filter((s) => s > 0 && s < 10_000);
  const medHold = holds.length
    ? [...holds].sort((a, b) => a - b)[Math.floor(holds.length / 2)]
    : null;
  const wr = wins.length / rows.length;
  const avg = pnl / rows.length;

  // 0–5 scorecard
  let score = 2.5;
  const notes = [];
  if (avg > 0) { score += 1; notes.push('positive expectancy'); }
  else { score -= 1; notes.push('negative expectancy'); }
  if (wr >= 0.45) { score += 0.5; notes.push(`WR ${(wr * 100).toFixed(0)}%`); }
  else if (wr < 0.35) { score -= 0.5; notes.push(`low WR ${(wr * 100).toFixed(0)}%`); }
  if (upShare >= 0.35 && upShare <= 0.65) { score += 0.5; notes.push(`balanced sides ${(upShare * 100).toFixed(0)}% UP`); }
  else { score -= 0.75; notes.push(`side skew ${(upShare * 100).toFixed(0)}% UP`); }
  if (name === 'scalp') {
    const feeDrag = Math.abs(pnl) > 0 ? fees / Math.max(Math.abs(pnl), 0.01) : fees;
    if (fees > Math.abs(pnl) && pnl <= 0) { score -= 1; notes.push('fees dominate scalp PnL'); }
    if (medHold != null && medHold < 90) { score += 0.5; notes.push(`fast median hold ${medHold.toFixed(0)}s`); }
    else if (medHold != null && medHold > 180) { score -= 0.5; notes.push(`slow for scalp ${medHold.toFixed(0)}s`); }
    void feeDrag;
  }
  if (name === 'trend') {
    const settleShare = (exits.settle || 0) / rows.length;
    if (settleShare >= 0.35) { score += 0.5; notes.push(`HTS/settle ${(settleShare * 100).toFixed(0)}%`); }
    if ((exits.sl || 0) / rows.length > 0.55) { score -= 0.5; notes.push('SL-heavy trend book'); }
  }
  score = Math.max(0, Math.min(5, Math.round(score * 10) / 10));

  return {
    style: name,
    n: rows.length,
    wr: Math.round(wr * 1000) / 10,
    netPnl: Math.round(pnl * 100) / 100,
    avgPnl: Math.round(avg * 100) / 100,
    fees: Math.round(fees * 100) / 100,
    upShare: Math.round(upShare * 1000) / 10,
    medianHoldSec: medHold != null ? Math.round(medHold) : null,
    exits,
    score,
    notes,
  };
}

const by = { trend: [], scalp: [], other: [] };
for (const t of trades) by[bucket(t)].push(t);

const report = {
  at: new Date().toISOString(),
  mode,
  directionalClosed: trades.length,
  arbExcluded: true,
  styles: {
    trend: scoreStyle('trend', by.trend),
    scalp: scoreStyle('scalp', by.scalp),
    other: scoreStyle('other', by.other),
  },
  arbSurfacesSample: state.arbSurfaces || null,
  verdict: null,
};

const tScore = report.styles.trend.score;
const sScore = report.styles.scalp.score;
report.verdict = [
  tScore == null ? 'trend: no sample' : `trend ${tScore}/5`,
  sScore == null ? 'scalp: no sample' : `scalp ${sScore}/5`,
  trades.length < 15 ? 'need ≥15 directional closes for a firm read' : 'sample ok',
].join(' · ');

const outPath = path.join('/home/david/Zinger/logs', 'directional-style-audit.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${outPath}`);
