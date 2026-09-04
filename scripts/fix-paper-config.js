#!/usr/bin/env node
// Fix paper config that "doesn't save" - bypass precedence by writing directly with operator attribution
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'data/zinger.db');

const patch = {
  minPrice: 0.12,
  maxPrice: 0.88,
  minConfidence: 0.22,
  maxConfidence: 0.65,
  useStrikeForecast: true,
  strikeForecastVeto: true,
  strikeForecastVetoEdge: 0.04,
  useBookMicrostructure: true,
  requireTightSpread: true,
  holdToSettleUnderdogs: true,
  underdogMaxPrice: 0.32,
  holdToSettleFavorites: true,
  favoriteMinPrice: 0.58,
  favoriteMaxPrice: 0.88,
  holdToSettleDisasterSlPct: 42,
  tpPctLow: 15,
  tpPctHigh: 28,
  slPct: 10,
  adaptiveSl: false,
  minAdaptiveSlPct: 10,
  kellyFraction: 0.12,
  maxPositionPct: 0.08,
  maxPositionCap: 50,
  minPositionSize: 5,
  maxPositionSize: 50,
  maxOpenPositions: 4,
  maxConcurrentPerSlug: 1,
  minRemainingSec: 25,
  maxEntryRemainingSec: 270,
  entryWindowFrac: 0.9,
  enabledDurations: ['5m'],
  use15m: false,
  useSignals: true,
  useML: false,
  useOrderBookBias: true,
  governorEnabled: true,
  governorDrawdownPct: 0.12,
  arbBankrollFrac: 0.1,
  arbMaxUsd: 50,
  clobArbEnabled: true,
  minArbGap: 0.012,
  arbMinMarginPct: 0.006,
  sideBalanceEnabled: true,
  evalBothSides: true,
  certaintySizing: false,
  // session TA + book gates added
  useSessionTA: true,
  bookQualityMin: 0.28,
  liquiditySlippageMaxPct: 1.2,
  targetVetoMinTauSec: 20,
};

async function main() {
  const db = await open({ filename: DB, driver: sqlite3.Database });
  const row = await db.get("SELECT value FROM docs WHERE key='poly_config.json'");
  if (!row) { console.error('no poly_config.json'); process.exit(1); }
  const cfg = JSON.parse(row.value);
  const now = Date.now();
  cfg.profiles.paper = { ...cfg.profiles.paper, ...patch };
  // stamp operator attribution so governor won't overwrite
  cfg.attribution = cfg.attribution || { fields: { paper:{}, root:{}, live:{} } };
  cfg.attribution.fields.paper = cfg.attribution.fields.paper || {};
  for (const k of Object.keys(patch)) {
    cfg.attribution.fields.paper[k] = { tier:'operator', source:'fix-paper-config.js', at: now, from: cfg.profiles.paper[k], to: patch[k] };
  }
  await db.run("INSERT OR REPLACE INTO docs (key, value, updated_at) VALUES (?, ?, ?)", 'poly_config.json', JSON.stringify(cfg), now);
  console.log('patched paper config:', Object.keys(patch).length, 'keys');
  console.log(JSON.stringify(cfg.profiles.paper, null, 2));
  await db.close();
}
main().catch(e=>{console.error(e); process.exit(1)});
