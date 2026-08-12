#!/usr/bin/env node
/**
 * Legacy Robinhood-chain monitor (not part of Polymarket Core).
 * Prefer `npm start` + Core dashboard for Polymarket ops.
 */
import { refreshAllTokens } from './src/lib/monitor.js';
import { createPublicClient, http, formatEther } from 'viem';
import { robinhood } from 'viem/chains';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ZINGER_DATA_DIR
  ? path.resolve(process.env.ZINGER_DATA_DIR)
  : path.join(ROOT, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

function loadSessions() {
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')); }
  catch { return []; }
}

async function main() {
  const client = createPublicClient({
    chain: robinhood,
    transport: http('https://rpc.mainnet.chain.robinhood.com', { timeout: 10000 }),
  });

  const ethUsd = 1913.36;
  const wallet = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'wallet.json'), 'utf-8'));
  const ethBal = Number(formatEther(await client.getBalance({ address: wallet.address })));

  const sessions = loadSessions();
  const refreshed = await refreshAllTokens(sessions);
  const active = refreshed.filter(t => t.alive && t.tokenAddress);

  console.log('ZINGER MONITOR — ' + new Date().toLocaleTimeString());
  console.log('Wallet: ' + wallet.address);
  console.log('ETH:    ' + ethBal.toFixed(6) + ' ($' + (ethBal * ethUsd).toFixed(2) + ')');
  console.log('');

  let totalVal = 0;
  for (const t of active) {
    const val = t.currentValue || 0;
    totalVal += val;
    const pct = t.roi || 0;
    const flag = pct >= 50 ? ' ★★★ TP' : pct <= -25 ? ' ★★★ SL' : '';
    console.log(
      t.symbol?.padEnd(8) +
      ' val=' + val.toFixed(6).padEnd(12) +
      ' roi=' + (pct >= 0 ? '+' : '') + pct.toFixed(2).padEnd(8) + '%' +
      ' price=' + (t.price || 0).toFixed(12) +
      flag
    );
  }

  if (active.length === 0) console.log('No active tokens');
  console.log('');
  console.log('Portfolio: ' + (totalVal + ethBal).toFixed(6) + ' ETH ($' + ((totalVal + ethBal) * ethUsd).toFixed(2) + ')');

  const tpSignals = active.filter(t => (t.roi || 0) >= 50);
  if (tpSignals.length > 0) {
    console.log('');
    console.log('★★★ TAKE PROFIT SIGNALS ★★★');
    for (const t of tpSignals) {
      console.log('  Sell ' + t.symbol + ' — roi +' + t.roi.toFixed(1) + '%  val ' + t.currentValue.toFixed(6) + ' ETH');
    }
  }
}

main().catch(e => console.error(e.message));
