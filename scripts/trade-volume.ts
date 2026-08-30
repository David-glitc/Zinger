// @ts-nocheck
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const LAUNCHES_LOG = path.join(DATA_DIR, 'launches.json');
const TRADE_LOG = path.join(DATA_DIR, 'trades.json');

const OPENBID_PATH = process.env.OPENBID_PATH || '/tmp/openbid';
const OPENBID_CONFIG_DIR = path.join(OPENBID_PATH, 'src/helpers/configs/evm');

function loadLaunches() {
  try {
    const data = JSON.parse(fs.readFileSync(LAUNCHES_LOG, 'utf-8'));
    return data.filter(l => l.status === 'success' && l.tokenAddress && l.tokenAddress !== 'unknown');
  } catch {
    return [];
  }
}

function loadTrades() {
  try {
    return JSON.parse(fs.readFileSync(TRADE_LOG, 'utf-8'));
  } catch {
    return [];
  }
}

function saveTrade(record) {
  const trades = loadTrades();
  trades.push(record);
  fs.writeFileSync(TRADE_LOG, JSON.stringify(trades, null, 2));
}

function writeBuyConfig(tokenAddress, amountEth) {
  const cfg = {
    isSandboxMode: false,
    chainId: 4663,
    address: tokenAddress,
    slippage: 10,
    referrer: '0x0000000000000000000000000000000000000000',
    amount: amountEth,
  };
  fs.writeFileSync(
    path.join(OPENBID_CONFIG_DIR, 'lbp-buy.json'),
    JSON.stringify(cfg, null, 2),
  );
}

function writeSellConfig(tokenAddress, amountPct) {
  const cfg = {
    isSandboxMode: false,
    chainId: 4663,
    address: tokenAddress,
    slippage: 10,
    referrer: '0x0000000000000000000000000000000000000000',
    amount: amountPct,
  };
  fs.writeFileSync(
    path.join(OPENBID_CONFIG_DIR, 'lbp-sell.json'),
    JSON.stringify(cfg, null, 2),
  );
}

function runBuy(tokenAddress, amountEth) {
  writeBuyConfig(tokenAddress, amountEth);
  try {
    const output = execSync('npm run evm:lbp-buy', {
      cwd: OPENBID_PATH,
      env: { ...process.env, SKIP_TX_CONFIRMATION: 'true' },
      stdio: 'pipe',
      timeout: 60000,
    });
    return output.toString();
  } catch (err) {
    return `BUY ERROR: ${(err.stderr || err.stdout || err.message).toString().substring(0, 300)}`;
  }
}

function runSell(tokenAddress, amountPct) {
  writeSellConfig(tokenAddress, amountPct);
  try {
    const output = execSync('npm run evm:lbp-sell', {
      cwd: OPENBID_PATH,
      env: { ...process.env, SKIP_TX_CONFIRMATION: 'true' },
      stdio: 'pipe',
      timeout: 60000,
    });
    return output.toString();
  } catch (err) {
    return `SELL ERROR: ${(err.stderr || err.stdout || err.message).toString().substring(0, 300)}`;
  }
}

function extractTxHash(output) {
  const m = output.match(/0x[a-fA-F0-9]{64}/);
  return m ? m[0] : null;
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   VOLUME TRADING BOT - Robinhood Chain       ║');
  console.log('╚══════════════════════════════════════════════╝');

  const launches = loadLaunches();
  if (launches.length === 0) {
    console.log('No successful launches found. Run automate.js first.');
    process.exit(1);
  }

  console.log(`Tokens to trade: ${launches.map(l => `${l.symbol}(${l.tokenAddress.substring(0, 10)}...)`).join(', ')}\n`);

  const tradeCycles = [
    { buy: 0.01, sellPct: 25 },
    { buy: 0.015, sellPct: 30 },
    { buy: 0.02, sellPct: 20 },
  ];

  for (const launch of launches) {
    console.log(`\n--- ${launch.symbol} @ ${launch.tokenAddress} ---`);

    for (let cycle = 0; cycle < tradeCycles.length; cycle++) {
      const tc = tradeCycles[cycle];
      console.log(`\nCycle ${cycle + 1}/${tradeCycles.length}: Buy ${tc.buy} ETH, Sell ${tc.sellPct}%`);

      await new Promise(r => setTimeout(r, 2000));

      const buyOutput = runBuy(launch.tokenAddress, tc.buy);
      const buyTx = extractTxHash(buyOutput);
      console.log(`  BUY  tx: ${buyTx || 'failed'}`);
      console.log(`  ${buyOutput.substring(0, 200)}`);

      await new Promise(r => setTimeout(r, 3000));

      const sellOutput = runSell(launch.tokenAddress, tc.sellPct);
      const sellTx = extractTxHash(sellOutput);
      console.log(`  SELL tx: ${sellTx || 'failed'}`);
      console.log(`  ${sellOutput.substring(0, 200)}`);

      const tradeRecord = {
        token: launch.symbol,
        tokenAddress: launch.tokenAddress,
        cycle: cycle + 1,
        buyAmount: tc.buy,
        sellPercent: tc.sellPct,
        buyTx,
        sellTx,
        timestamp: new Date().toISOString(),
      };
      saveTrade(tradeRecord);
    }
  }

  console.log('\n=== Trading Complete ===');
  const trades = loadTrades();
  console.log(`Total trades executed: ${trades.length}`);
}

main().catch(console.error);
