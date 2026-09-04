#!/usr/bin/env node
// @ts-nocheck
/**
 * 6-month historical backtest — full pipeline from spot signals through
 * synthetic CLOB to directional + arb with governor regimes.
 *
 * Usage:
 *   npx tsx scripts/historical-backtest.ts --months=6 --bankroll=10000 --reload=10000
 *   npx tsx scripts/historical-backtest.ts --months=1 --no-fetch   # use cache only
 */
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
process.chdir(ROOT);

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
}

const months = Number(arg('months', '6'));
const bankroll = Number(arg('bankroll', '10000'));
const reload = Number(arg('reload', '10000'));
const noFetch = process.argv.includes('--no-fetch');
const arbOnly = process.argv.includes('--arb-only');
const days = Math.round(months * 30.44);

const { fetchHistoricalCandles } = await import('../src/polymarket/backtest/fetchHistory.js');
const { runHistoricalBacktest } = await import('../src/polymarket/backtest/engine.js');
const { loadFusionContext } = await import('../src/polymarket/signal.js');

console.log(`\n📊 Historical backtest — ${months}mo (~${days}d), $${bankroll} start, $${reload} reload${arbOnly ? ' [ARB-ONLY]' : ''}\n`);

if (!arbOnly) {
  await loadFusionContext();
}
const fusion = arbOnly ? {} : (globalThis.__zingerFusionCtx || {});

const symbols = ['BTCUSDT', 'ETHUSDT'];
const candlesByAsset = {};

for (const sym of symbols) {
  console.log(`Fetching ${sym} 1m candles (${days}d)...`);
  const one = await fetchHistoricalCandles(sym, '1m', days, { useCache: !noFetch });
  console.log(`  ${sym}: ${one.length} bars (${new Date(one[0].time * 1000).toISOString().slice(0, 10)} → ${new Date(one[one.length - 1].time * 1000).toISOString().slice(0, 10)})`);
  candlesByAsset[sym] = { one };
}

const t0 = Date.now();
let lastPct = -1;

const result = await runHistoricalBacktest({
  candlesByAsset,
  fusionCtx: fusion,
  bankroll,
  reloadAmount: reload,
  baseCfg: arbOnly
    ? {
        forceArbOnly: true,
        clobArbEnabled: true,
        governorEnabled: true,
        minArbGap: 0.006,
        arbMinMarginPct: 0.003,
        arbBankrollFrac: 0.18,
        arbMaxUsd: 100,
        maxArbPackages: 6,
      }
    : null,
  onProgress: ({ wi, total, cash, trades, regime }) => {
    const pct = Math.floor((wi / total) * 100);
    if (pct !== lastPct && pct % 10 === 0) {
      lastPct = pct;
      console.log(`  ${pct}% — cash $${cash.toFixed(0)} | trades ${trades} | regime ${regime}`);
    }
  },
});

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const outDir = path.join(ROOT, 'data', 'backtest');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = path.join(outDir, `backtest-${months}mo${arbOnly ? '-arb' : ''}-${stamp}.json`);

const summary = {
  runAt: new Date().toISOString(),
  months,
  days,
  bankroll,
  reload,
  arbOnly,
  elapsedSec: Number(elapsed),
  ...result,
  trades: result.trades.slice(-500),
  tradeSampleCount: result.trades.length,
};

writeFileSync(outFile, JSON.stringify(summary, null, 2));

console.log('\n═══════════════════════════════════════');
console.log(`  Final cash:     $${result.finalCash.toLocaleString()}`);
console.log(`  Total PnL:      $${result.totalPnl.toLocaleString()}`);
console.log(`  Trades:         ${result.tradeCount} (${result.directionalCount} dir, ${result.arbCount} arb)`);
console.log(`  Win rate:       ${(result.winRate * 100).toFixed(1)}%`);
console.log(`  Fund reloads:   ${result.reloads} ($${result.totalReloaded.toLocaleString()} injected)`);
console.log(`  Regimes:        ${JSON.stringify(result.regimeCounts)}`);
console.log(`  Bayesian updates: ${result.bayesian.updates.length}`);
if (result.bayesian.updates.length) {
  for (const u of result.bayesian.updates.slice(-5)) {
    console.log(`    [${u.kind || 'dir'}@${u.at}] ${JSON.stringify(u.patches)} — ${(u.notes || []).join('; ')}`);
  }
}
if (result.bayesian.arbStrata) {
  const top = Object.entries(result.bayesian.arbStrata)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 5);
  console.log(`  Arb strata (top): ${top.map(([k, s]) => `${k} n=${s.n} $${s.pnl.toFixed(0)}`).join(' | ')}`);
}
console.log(`  Debug:          ${JSON.stringify(result.dbg)}`);
console.log(`  Elapsed:        ${elapsed}s`);
console.log(`  Saved:          ${outFile}`);
console.log('═══════════════════════════════════════\n');
