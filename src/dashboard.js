import blessed from 'blessed';
import { getWallet } from './lib/wallet.js';
import { generateTokenFromPrompt } from './lib/ai.js';
import { launchFlashToken } from './lib/chain.js';
import { createPublicClient, http, formatEther } from 'viem';
import { robinhood } from 'viem/chains';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadBalanceHistory, saveBalanceSnapshot, getBalanceChanges,
  loadAutoSellConfig, saveAutoSellConfig,
  calculatePnl, refreshAllTokens, formatPnl,
} from './lib/monitor.js';
import { loadFileOrStore, saveFileOrStore } from './polymarket/sqliteStore.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

function loadSessions() {
  return loadFileOrStore(SESSIONS_FILE, []);
}

function saveSession(session) {
  const sessions = loadSessions();
  sessions.push({ id: Date.now().toString(36), ...session, timestamp: new Date().toISOString() });
  saveFileOrStore(SESSIONS_FILE, sessions);
}

const wallet = getWallet();
const publicClient = createPublicClient({
  chain: robinhood,
  transport: http('https://rpc.mainnet.chain.robinhood.com', { timeout: 5000 }),
});

const screen = blessed.screen({
  smartCSR: true,
  title: 'Zinger · Token Launcher',
  dockBorders: true,
  fullUnicode: true,
});

screen.key(['q', 'C-c'], () => process.exit(0));

// --- Top bar ---
const topBar = blessed.box({
  top: 0, left: 0, width: '100%', height: 3,
  content: '{bold}{center}Zinger  ·  Token Launcher  ·  Robinhood Chain (4663){/center}{/bold}',
  tags: true,
  style: { fg: '#a29bfe', bg: '#111318' },
  border: { type: 'line', fg: '#1f2230' },
});
screen.append(topBar);

// --- Left: Wallet + PnL Panel ---
const walletBox = blessed.box({
  top: 3, left: 0, width: '40%', height: 10,
  label: ' Wallet & PnL ',
  border: { type: 'line', fg: '#6c5ce7' },
  style: { fg: '#e8eaed', bg: '#0d0f16', border: { fg: '#6c5ce7' }, label: { fg: '#6c5ce7' } },
  tags: true,
  padding: { left: 1, right: 1 },
});
screen.append(walletBox);

const walletInfo = blessed.box({
  parent: walletBox,
  top: 0, left: 0, width: '100%', height: 4,
  tags: true,
  style: { fg: '#e8eaed', bg: '#0d0f16' },
});

const depositInput = blessed.textbox({
  parent: walletBox,
  top: 5, left: 0, width: '60%', height: 1,
  inputOnFocus: true,
  style: { fg: '#e8eaed', bg: '#1a1c23', focus: { bg: '#2a2c33' } },
  border: { type: 'line', fg: '#1f2230' },
  placeholder: ' ETH to deposit',
});

const depositBtn = blessed.button({
  parent: walletBox,
  top: 5, left: '62%', width: '38%', height: 1,
  content: ' Show Address ',
  style: { fg: '#000', bg: '#00d2a0', focus: { bg: '#00e8b0' }, hover: { bg: '#00e8b0' } },
  mouse: true,
});

const pnlInfo = blessed.box({
  parent: walletBox,
  top: 7, left: 0, width: '100%', height: 2,
  tags: true,
  style: { fg: '#e8eaed', bg: '#0d0f16' },
});

// --- Right: Generate Panel ---
const genBox = blessed.box({
  top: 3, left: '40%', width: '60%', height: 10,
  label: ' Idea → Token ',
  border: { type: 'line', fg: '#00d2a0' },
  style: { fg: '#e8eaed', bg: '#0d0f16', border: { fg: '#00d2a0' }, label: { fg: '#00d2a0' } },
  tags: true,
  padding: { left: 1, right: 1 },
});
screen.append(genBox);

const promptInput = blessed.textarea({
  parent: genBox,
  top: 0, left: 0, width: '100%', height: 2,
  inputOnFocus: true,
  style: { fg: '#e8eaed', bg: '#1a1c23', focus: { bg: '#2a2c33' } },
  border: { type: 'line', fg: '#1f2230' },
  placeholder: ' Describe your token idea...',
});

const generateBtn = blessed.button({
  parent: genBox,
  top: 3, left: 0, width: '100%', height: 1,
  content: ' ✨ Generate Token Data ',
  style: { fg: '#fff', bg: '#6c5ce7', focus: { bg: '#7d6df7' }, hover: { bg: '#7d6df7' } },
  mouse: true,
});

const genResult = blessed.box({
  parent: genBox,
  top: 5, left: 0, width: '100%', height: 2,
  tags: true,
  scrollable: true,
  style: { fg: '#e8eaed', bg: '#0d0f16' },
});

// --- Middle: Launch Config ---
const launchBox = blessed.box({
  top: 13, left: 0, width: '100%', height: 8,
  label: ' Launch Config ',
  border: { type: 'line', fg: '#ffa502' },
  style: { fg: '#e8eaed', bg: '#0d0f16', border: { fg: '#ffa502' }, label: { fg: '#ffa502' } },
  tags: true,
  padding: { left: 1, right: 1 },
});
screen.append(launchBox);

const tNameInput = blessed.textbox({
  parent: launchBox, top: 0, left: 0, width: '25%', height: 1,
  inputOnFocus: true,
  style: { fg: '#e8eaed', bg: '#1a1c23', focus: { bg: '#2a2c33' } },
  border: { type: 'line', fg: '#1f2230' },
  placeholder: ' Token Name',
});

const tSymbolInput = blessed.textbox({
  parent: launchBox, top: 0, left: '26%', width: '14%', height: 1,
  inputOnFocus: true,
  style: { fg: '#e8eaed', bg: '#1a1c23', focus: { bg: '#2a2c33' } },
  border: { type: 'line', fg: '#1f2230' },
  placeholder: ' SYMBOL',
});

const tSupplyLabel = blessed.box({
  parent: launchBox, top: 0, left: '41%', width: '20%', height: 1,
  content: ' {#8b8fa3-fg}Supply: 1B (fixed){/}',
  tags: true,
  style: { fg: '#8b8fa3', bg: '#0d0f16' },
});

const tFeeLabel = blessed.box({
  parent: launchBox, top: 0, left: '62%', width: '18%', height: 1,
  content: ' {#8b8fa3-fg}Fee: 1% (fixed){/}',
  tags: true,
  style: { fg: '#8b8fa3', bg: '#0d0f16' },
});

const tBuyInput = blessed.textbox({
  parent: launchBox, top: 2, left: 0, width: '30%', height: 1,
  inputOnFocus: true,
  style: { fg: '#e8eaed', bg: '#1a1c23', focus: { bg: '#2a2c33' } },
  border: { type: 'line', fg: '#1f2230' },
  placeholder: ' Buy % (cap 0.00001 ETH)',
});

const tDescInput = blessed.textarea({
  parent: launchBox, top: 4, left: 0, width: '76%', height: 2,
  inputOnFocus: true,
  style: { fg: '#e8eaed', bg: '#1a1c23', focus: { bg: '#2a2c33' } },
  border: { type: 'line', fg: '#1f2230' },
  placeholder: ' Description (optional)',
});

const launchBtn = blessed.button({
  parent: launchBox, top: 2, left: '37%', width: '38%', height: 1,
  content: ' 🚀 Launch (pons) ',
  style: { fg: '#fff', bg: '#6c5ce7', focus: { bg: '#7d6df7' }, hover: { bg: '#7d6df7' } },
  mouse: true,
});

const launchStatus = blessed.box({
  parent: launchBox, top: 6, left: 0, width: '100%', height: 1,
  tags: true,
  scrollable: true,
  style: { fg: '#e8eaed', bg: '#0d0f16' },
});

// Fee info bar
const feeInfo = blessed.box({
  parent: launchBox, top: 5, left: 0, width: '100%', height: 1,
  tags: true,
  style: { fg: '#8b8fa3', bg: '#0d0f16' },
  content: '{#8b8fa3-fg}Pons: 0.0005 ETH fee · 1% pool fee · Uniswap V3 · grad at 4.2 ETH{/}',
});

// --- Bottom: Sessions ---
const sessionsBox = blessed.box({
  top: 21, left: 0, width: '100%', height: Math.max(4, process.stdout.rows - 22),
  label: ' Sessions ',
  border: { type: 'line', fg: '#1f2230' },
  style: { fg: '#e8eaed', bg: '#0d0f16', border: { fg: '#1f2230' }, label: { fg: '#8b8fa3' } },
  tags: true,
  scrollable: true,
  keys: true,
  vi: true,
  mouse: true,
});
screen.append(sessionsBox);

function refreshSessions() {
  const sessions = loadSessions().reverse();
  const headers = ' {bold}{#8b8fa3-fg}Token{/}  {bold}{#8b8fa3-fg}PnL{/}        {bold}{#8b8fa3-fg}Buy{/}       {bold}{#8b8fa3-fg}Address{/}     {bold}{#8b8fa3-fg}Time{/}';
  if (sessions.length === 0) {
    sessionsBox.setContent(headers + '\n {#586070-fg}No sessions yet.{/}');
    screen.render();
    return;
  }
  const lines = sessions.slice(0, 15).map(s => {
    const addr = s.tokenAddress ? s.tokenAddress.substring(0, 10) + '…' : '{#ff6b6b-fg}—{/}';
    let pnlStr = '{#586070-fg}—{/}';
    if (s.initialBuyAmount) {
      const pnl = calculatePnl(s);
      const c = pnl.netPnl >= 0 ? '#00d2a0' : '#ff6b6b';
      const sign = pnl.netPnl >= 0 ? '+' : '';
      pnlStr = `{${c}-fg}${sign}${pnl.netPnl.toFixed(4)}{/}`;
    }
    const buyStr = s.initialBuyAmount ? `${s.initialBuyAmount.toFixed(4)}` : '{#586070-fg}—{/}';
    return ` {#a29bfe-fg}${(s.symbol || '—').padEnd(6)}{/}` +
      `${pnlStr.padEnd(13)}` +
      `{#a29bfe-fg}${buyStr.padEnd(10)}{/}` +
      `{#a29bfe-fg}${addr.padEnd(13)}{/}` +
      `{#8b8fa3-fg}${s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : '—'}{/}`;
  });
  sessionsBox.setContent(headers + '\n' + lines.join('\n'));
  screen.render();
}

// --- Auto-sell config (hidden, toggled with 's') ---
let sellConfig = loadAutoSellConfig();

const sellBox = blessed.box({
  top: 3, left: 0, width: '100%', height: 7,
  label: ' Auto-Sell Bot ',
  border: { type: 'line', fg: '#ff6b6b' },
  style: { fg: '#e8eaed', bg: '#0d0f16', border: { fg: '#ff6b6b' }, label: { fg: '#ff6b6b' } },
  tags: true,
  padding: { left: 1, right: 1 },
  hidden: true,
});
screen.append(sellBox);

const sellStatus = blessed.box({
  parent: sellBox, top: 0, left: 0, width: '100%', height: 4,
  tags: true,
  style: { fg: '#e8eaed', bg: '#0d0f16' },
});

const sellToggleBtn = blessed.button({
  parent: sellBox, top: 5, left: 0, width: '30%', height: 1,
  content: sellConfig.enabled ? ' ⏹ Stop Bot ' : ' ▶ Start Bot ',
  style: { fg: '#fff', bg: sellConfig.enabled ? '#ff6b6b' : '#00d2a0', focus: { bg: '#7d6df7' } },
  mouse: true,
});

let monitorInterval;

function toggleAutoSell() {
  sellConfig.enabled = !sellConfig.enabled;
  saveAutoSellConfig(sellConfig);
  sellToggleBtn.setContent(sellConfig.enabled ? ' ⏹ Stop Bot ' : ' ▶ Start Bot ');
  sellToggleBtn.setStyle({ bg: sellConfig.enabled ? '#ff6b6b' : '#00d2a0' });

  if (sellConfig.enabled) {
    startMonitor();
  } else {
    stopMonitor();
  }
  updateSellStatus();
  screen.render();
}

function startMonitor() {
  if (monitorInterval) clearInterval(monitorInterval);
  monitorInterval = setInterval(runMonitorCheck, 30000);
  runMonitorCheck();
}

function stopMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

async function runMonitorCheck() {
  if (!sellConfig.enabled) return;
  try {
    const balance = await publicClient.getBalance({ address: wallet.address });
    const balanceEth = Number(formatEther(balance));
    const sessions = loadSessions();

    // Refresh all token values from on-chain prices
    const refreshed = await refreshAllTokens(sessions);
    const tpTarget = sellConfig.tpPct || 50;
    const slTarget = sellConfig.slPct || 25;

    let signals = [];
    for (const s of refreshed) {
      if (!s.alive || !s.initialBuyAmount) continue;
      const roi = s.roi || 0;
      if (roi >= tpTarget) signals.push(`{#00d2a0-fg}TP ${s.symbol}: +${roi.toFixed(1)}%  val ${s.currentValue.toFixed(6)} ETH{/}`);
      if (roi <= -slTarget) signals.push(`{#ff6b6b-fg}SL ${s.symbol}: ${roi.toFixed(1)}%  val ${s.currentValue.toFixed(6)} ETH{/}`);
    }

    updateSellStatus(balanceEth, signals);
    refreshSessions();
  } catch {}
}

function updateSellStatus(balanceEth, signals) {
  const s = sellConfig;
  sellStatus.setContent(
    `{bold}Status:{/} ${s.enabled ? '{#00d2a0-fg}Running{/}' : '{#8b8fa3-fg}Stopped{/}'}` +
    `  {bold}TP:{/} ${s.tpPct || 50}%  {bold}SL:{/} ${s.slPct || 25}%\n` +
    (signals && signals.length > 0 ? signals.join('\n') : '{#8b8fa3-fg}No signals{/}')
  );
  screen.render();
}

sellToggleBtn.on('press', toggleAutoSell);

screen.key('s', () => {
  sellBox.hidden = !sellBox.hidden;
  screen.render();
});

// --- Bottom status bar ---
const statusBar = blessed.box({
  bottom: 0, left: 0, width: '100%', height: 1,
  content: ' {bold}[q]{/bold} quit  {bold}[s]{/bold} auto-sell  {bold}[Tab]{/bold} next field  {bold}[Enter]{/bold} submit',
  tags: true,
  style: { fg: '#8b8fa3', bg: '#111318' },
});
screen.append(statusBar);

// --- Focus management ---
const focusOrder = [
  promptInput, generateBtn,
  depositInput, depositBtn,
  tNameInput, tSymbolInput, tBuyInput, tDescInput, launchBtn,
];
let focusIdx = 0;

function focusNext() {
  focusIdx = (focusIdx + 1) % focusOrder.length;
  focusOrder[focusIdx].focus();
}
function focusPrev() {
  focusIdx = (focusIdx - 1 + focusOrder.length) % focusOrder.length;
  focusOrder[focusIdx].focus();
}

screen.key('tab', focusNext);
screen.key('S-tab', focusPrev);

// --- Refresh wallet ---
async function refreshWallet() {
  try {
    const balance = await Promise.race([
      publicClient.getBalance({ address: wallet.address }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 5000)),
    ]);
    const balanceEth = parseFloat(formatEther(balance));

    saveBalanceSnapshot(balanceEth);
    const history = loadBalanceHistory();
    const changes = getBalanceChanges(history);

    walletInfo.setContent(
      `{bold}Balance:{/bold} {bold}${balanceEth.toFixed(6)}{/} ETH  ` +
      `{#8b8fa3-fg}(chain 4663){/}\n` +
      `{bold}24h Δ:{/} ${changes.change >= 0 ? '{#00d2a0-fg}+' : '{#ff6b6b-fg}'}${changes.change.toFixed(6)}{/} ETH  ` +
      `${changes.pct >= 0 ? '{#00d2a0-fg}' : '{#ff6b6b-fg}'}(${changes.pct >= 0 ? '+' : ''}${changes.pct.toFixed(1)}%){/}\n` +
      `{bold}Address:{/} {#a29bfe-fg}${wallet.address.substring(0, 10)}…{/}\n` +
      `{bold}Deposit to:{/} {#a29bfe-fg}${wallet.address.substring(0, 10)}…{/}`
    );

    const sessions = loadSessions();
    const activeTokens = sessions.filter(s => s.tokenAddress && s.initialBuyAmount);
    let totalPnl = 0;
    let totalSpent = 0;
    let totalReturn = 0;
    for (const s of activeTokens) {
      const pnl = calculatePnl(s);
      totalPnl += pnl.netPnl;
      totalSpent += pnl.spent;
      totalReturn += pnl.totalReturn;
    }
    const roi = totalSpent > 0 ? ((totalReturn - totalSpent) / totalSpent) * 100 : 0;
    const pnlColor = totalPnl >= 0 ? '#00d2a0' : '#ff6b6b';
    pnlInfo.setContent(
      `{bold}PnL:{/} {${pnlColor}-fg}${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(6)}{/} ETH  ` +
      `ROI: {${pnlColor}-fg}${totalPnl >= 0 ? '+' : ''}${roi.toFixed(1)}%{/}  ` +
      `Tokens: {#a29bfe-fg}${activeTokens.length}{/}`
    );
  } catch (err) {
    walletInfo.setContent(
      `{bold}Address:{/} {#a29bfe-fg}${wallet.address.substring(0, 10)}…{/}\n` +
      `{bold}Balance:{/} {#ff6b6b-fg}??{/} ETH  {#8b8fa-fg}(RPC error){/}`
    );
  }
  screen.render();
}

// --- Handlers ---

generateBtn.on('press', async () => {
  const prompt = promptInput.getValue().trim();
  if (!prompt) {
    genResult.setContent('{#ff6b6b-fg}Enter a prompt first{/}');
    screen.render();
    return;
  }
  generateBtn.setContent(' ⏳ Generating... ');
  generateBtn.setStyle({ bg: '#3b3b5c' });
  screen.render();
  genResult.setContent('');
  screen.render();

  const result = await generateTokenFromPrompt(prompt);
  if (!result) {
    genResult.setContent('{#ff6b6b-fg}AI generation failed — check API key or try again{/}');
    generateBtn.setContent(' ✨ Generate Token Data ');
    generateBtn.setStyle({ bg: '#6c5ce7' });
    screen.render();
    return;
  }

  tNameInput.setValue(result.name || '');
  tSymbolInput.setValue(result.symbol || '');
  tSupplyInput.setValue(String(result.totalSupply || ''));
  tMcapInput.setValue(String(result.marketCap || ''));
  tBuyInput.setValue(String(result.initialBuyPct || ''));
  tFeeInput.setValue(String(result.suggestedFeeTier || '5'));
  renderFeeBar(result.suggestedFeeTier || '5');

  genResult.setContent(
    `{bold}${result.name}{/} ({#a29bfe-fg}${result.symbol}{/})  ` +
    `buy {bold}${result.initialBuyPct}{/}%  ` +
    `pons: 1B supply · 1% fee · 0.00001 ETH max buy\n` +
    `{#8b8fa3-fg}via ${result.model}{/}`
  );
  generateBtn.setContent(' ✨ Generate Token Data ');
  generateBtn.setStyle({ bg: '#6c5ce7' });
  screen.render();
});

depositBtn.on('press', async () => {
  pnlInfo.setContent(
    `{#ffa502-fg}Send ETH to:{/}\n{#a29bfe-fg}${wallet.address}{/}`
  );
  screen.render();
  setTimeout(() => refreshWallet(), 5000);
});

launchBtn.on('press', async () => {
  const name = tNameInput.getValue().trim();
  const symbol = tSymbolInput.getValue().trim();
  if (!name || !symbol) {
    launchStatus.setContent('{#ff6b6b-fg}Fill in Name and Symbol{/}');
    screen.render();
    return;
  }
  launchBtn.setContent(' ⏳ Launching... (may take 2 min) ');
  launchBtn.setStyle({ bg: '#3b3b5c' });
  launchStatus.setContent('');
  screen.render();

  try {
    const result = await launchFlashToken({
      name,
      symbol: symbol.toUpperCase(),
      description: tDescInput.getValue().trim() || '',
      initialBuyPct: Number(tBuyInput.getValue().trim() || 50),
    });

    saveSession({ type: 'launch', ...result, wallet: wallet.address, feesCollected: 0, currentValue: 0 });

    launchStatus.setContent(
      `{green-fg}✓ ${result.symbol} Launched on pons!{/}\n` +
      `Token: {#a29bfe-fg}${result.tokenAddress || 'unknown'}{/}\n` +
      `Pool: {#a29bfe-fg}${result.pool || 'unknown'}{/}\n` +
      `TX: {#a29bfe-fg}${result.txHash || 'unknown'}{/}\n` +
      `{#8b8fa3-fg}Bought ${result.initialBuyAmount} ETH · Fee 0.0005 ETH · Supply 1B · 1% fee{/}`
    );
    refreshSessions();
    refreshWallet();
  } catch (err) {
    launchStatus.setContent(`{#ff6b6b-fg}✗ Launch failed: ${(err.message || err).substring(0, 500)}{/}`);
  }
  launchBtn.setContent(' 🚀 Launch Token ');
  launchBtn.setStyle({ bg: '#6c5ce7' });
  screen.render();
});

// --- Init ---
refreshWallet();
refreshSessions();
focusOrder[0].focus();
screen.render();

// Auto-refresh wallet every 30s
setInterval(refreshWallet, 30000);
setInterval(refreshSessions, 15000);
