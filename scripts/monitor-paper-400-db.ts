#!/usr/bin/env tsx
import sqlite3 from 'sqlite3';
// We'll use python-style via shell? Actually use sqlite via better-sqlite? Simpler: use node's sqlite via exec python.
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';

const TARGET = Number(process.argv.find(a=>a.startsWith('--target='))?.split('=')[1] || 400);
const POLL_MS = 30000;

function getTrades() {
  try {
    const out = execSync(`python3 -c "
import sqlite3, json
conn=sqlite3.connect('data/zinger.db')
cur=conn.cursor()
cur.execute(\"SELECT value FROM docs WHERE key='poly_trades.json'\")
import json as j
trades=j.loads(cur.fetchone()[0])
print(j.dumps(trades))
"`, { encoding: 'utf-8' });
    return JSON.parse(out);
  } catch { return []; }
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
  const sharpe = std>0? (mean/std)*Math.sqrt(252*288) : 0;
  const profitFactor = avgLoss>0 && losses.length? (avgWin*wins.length)/(avgLoss*losses.length):0;
  const kelly = avgLoss>0? (wr*(avgWin/avgLoss) - (1-wr))/(avgWin/avgLoss):0;
  return { n, wr, avgWin, avgLoss, ev, sharpe, profitFactor, kelly, totalPnl: pnls.reduce((a,b)=>a+b,0), paper };
}

async function main(){
  console.log(`\n👁 Paper 400-trade DB monitor — every ${POLL_MS/1000}s target ${TARGET}`);
  const startedAt = Date.now();
  let lastN = 0;
  while(true){
    const trades = getTrades();
    const m = computeMetrics(trades);
    const elapsedH = ((Date.now()-startedAt)/3600000).toFixed(1);
    const line = `[${new Date().toISOString().slice(11,19)}] ${m.n}/${TARGET} WR ${(m.wr*100).toFixed(1)}% EV $${m.ev.toFixed(3)} PF ${m.profitFactor.toFixed(2)} Sharpe ${m.sharpe.toFixed(2)} PnL $${m.totalPnl.toFixed(2)} elapsed ${elapsedH}h`;
    console.log(line);
    if(m.n >= TARGET){
      console.log(`\nReached ${m.n} trades`);
      console.log(`WR ${(m.wr*100).toFixed(2)}% EV $${m.ev.toFixed(4)} PF ${m.profitFactor.toFixed(3)} Sharpe ${m.sharpe.toFixed(2)} Kelly ${(m.kelly*100).toFixed(2)}%`);
      writeFileSync(path.join(process.cwd(),'data',`paper-400-final-${Date.now()}.json`), JSON.stringify({at:new Date().toISOString(), metrics:m, trades:m.paper.slice(0,400)},null,2));
      break;
    }
    if(m.n!==lastN){ lastN=m.n; writeFileSync('data/paper-monitor-live.json', JSON.stringify({at:Date.now(), n:m.n, metrics:m},null,2)); }
    await new Promise(r=>setTimeout(r,POLL_MS));
  }
}
main();
