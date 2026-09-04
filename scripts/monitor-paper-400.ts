#!/usr/bin/env tsx
// Monitor live paper for 400 trades and compute EV, Sharpe, edge
import { writeFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const POLL_MS = 30000;
const TARGET = 400;

async function fetchState() {
  try {
    const res = await fetch('http://localhost:3000/api/poly/state', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function computeMetrics(trades) {
  const paper = trades.filter(t=> (t.mode||'paper')==='paper' && t.exitReason);
  const n = paper.length;
  const pnls = paper.map(t=> Number(t.pnl||0));
  const wins = pnls.filter(x=>x>0);
  const losses = pnls.filter(x=>x<=0);
  const wr = n? wins.length/n:0;
  const avgWin = wins.length? wins.reduce((a,b)=>a+b,0)/wins.length:0;
  const avgLoss = losses.length? Math.abs(losses.reduce((a,b)=>a+b,0)/losses.length):0;
  const ev = wr*avgWin - (1-wr)*avgLoss;
  const mean = n? pnls.reduce((a,b)=>a+b,0)/n:0;
  const variance = n>1? pnls.reduce((s,x)=>s+(x-mean)**2,0)/(n-1):0;
  const std = Math.sqrt(variance);
  const sharpe = std>0? (mean/std)*Math.sqrt(252* (24*60/5)) : 0; // approx annualised per 5m
  // daily Sharpe approx: trade sharpe * sqrt(trades per day)
  const kelly = avgLoss>0? (wr*(avgWin/avgLoss) - (1-wr))/(avgWin/avgLoss):0;
  const profitFactor = avgLoss>0 && losses.length? (avgWin*wins.length)/(avgLoss*losses.length):0;
  const expectancy = ev;
  // edge gate style
  const edge = { n, wr, avgWin, avgLoss, ev, kelly, profitFactor, sharpe, totalPnl: pnls.reduce((a,b)=>a+b,0) };
  return edge;
}

async function main() {
  console.log(`\n👁 Paper 400-trade monitor — polling every ${POLL_MS/1000}s`);
  const startedAt = Date.now();
  let lastN = 0;
  const target = Number(process.argv.find(a=>a.startsWith('--target='))?.split('=')[1] || TARGET);
  while (true) {
    const state = await fetchState();
    if (!state) { console.log(`[${new Date().toISOString()}] no state — is bot running?`); await sleep(POLL_MS); continue; }
    const trades = state.trades || [];
    const paper = trades.filter(t=> t.mode==='paper' && t.exitReason);
    const n = paper.length;
    const m = computeMetrics(trades);
    const elapsedH = ((Date.now()-startedAt)/3600000).toFixed(1);
    const cfg = state.config||{};
    const equity = state.portfolio?.equity ?? state.cashAudit?.equity ?? cfg.paperBankroll;
    const regime = state.governor?.activeProfile ?? state.account?.regime ?? '?';
    const line = `[${new Date().toISOString().slice(11,19)}] ${n}/${target} trades WR ${(m.wr*100).toFixed(1)}% EV $${m.ev.toFixed(3)} PF ${m.profitFactor.toFixed(2)} Sharpe ${m.sharpe.toFixed(2)} PnL $${m.totalPnl.toFixed(2)} eq $${Number(equity).toFixed(2)} regime ${regime} confGate ${cfg.minConfidence}`;
    console.log(line);
    if (n >= target) {
      console.log('\n═══════════════════════════════════════');
      console.log(`  Reached ${n} paper closes in ${elapsedH}h`);
      console.log(`  WR: ${(m.wr*100).toFixed(2)}% (${Math.round(m.wr*n)}/${n})`);
      console.log(`  EV: $${m.ev.toFixed(4)} per trade`);
      console.log(`  AvgWin $${m.avgWin.toFixed(2)} AvgLoss $${m.avgLoss.toFixed(2)} PF ${m.profitFactor.toFixed(3)}`);
      console.log(`  Sharpe (annualised 5m): ${m.sharpe.toFixed(3)}`);
      console.log(`  Kelly: ${(m.kelly*100).toFixed(2)}%`);
      console.log(`  Total PnL: $${m.totalPnl.toFixed(2)}`);
      console.log(`  Breakdown by exit:`, trades.slice(0,400).reduce((acc,t)=>{acc[t.exitReason]=(acc[t.exitReason]||0)+1;return acc;},{}));
      console.log('═══════════════════════════════════════\n');
      const out = path.join(ROOT, 'data', `paper-400-monitor-${Date.now()}.json`);
      writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), metrics: m, trades: paper.slice(0,400), cfg }, null, 2));
      console.log(`Saved ${out}`);
      break;
    }
    // also log progress delta
    if (n !== lastN) {
      lastN = n;
      // summary file
      writeFileSync(path.join(ROOT, 'data/paper-monitor-live.json'), JSON.stringify({ at: Date.now(), n, metrics: m, cfg: { minConfidence: cfg.minConfidence, useStrikeForecast: cfg.useStrikeForecast, bookQualityMin: cfg.bookQualityMin } }, null, 2));
    }
    await sleep(POLL_MS);
  }
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
main();
