import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWallet, loadOrCreateWallet } from './lib/wallet.js';
import { generateTokenFromPrompt } from './lib/ai.js';
import { launchFlashToken } from './lib/chain.js';
import { createPublicClient, http, formatEther } from 'viem';
import { polygon } from 'viem/chains';
import fs from 'fs';
import { refreshAllTokens, loadAutoSellConfig, saveAutoSellConfig } from './lib/monitor.js';
import { sellToken, addTransaction, loadTransactions, getTokenFees } from './lib/pons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

export function getSessions() {
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')); }
  catch { return []; }
}

export function addSession(session) {
  const sessions = getSessions();
  sessions.push({ id: Date.now().toString(36), ...session, timestamp: new Date().toISOString() });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
  return sessions[sessions.length - 1];
}

let sseClients = [];

async function collectStreamData(publicClient, wallet) {
  const balance = await Promise.race([
    publicClient.getBalance({ address: wallet.address }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
  ]);
  const balanceEth = Number(formatEther(balance));

  const sessions = getSessions();
  const refreshed = await refreshAllTokens(sessions);
  const activeTokens = refreshed.filter(s => s.alive && s.initialBuyAmount && (s.currentValue || 0) > 0);
  let totalPnl = 0, totalSpent = 0, totalReturn = 0;
  const tokens = activeTokens.map(s => {
    const spent = s.initialBuyAmount || 0;
    const val = s.currentValue || 0;
    const ret = val + (s.feesCollected || 0);
    totalPnl += ret - spent;
    totalSpent += spent;
    totalReturn += ret;
    return { symbol: s.symbol, name: s.name, tokenAddress: s.tokenAddress, spent, currentValue: val, roi: s.roi || 0, price: s.price || 0, logoUrl: s.logoUrl || null };
  });
  const portfolio = { totalPnl, totalSpent, totalReturn, roi: totalSpent > 0 ? ((totalReturn - totalSpent) / totalSpent) * 100 : 0, activeCount: activeTokens.length };

  const sellConfig = loadAutoSellConfig();
  const txs = loadTransactions().reverse().slice(0, 50);

  return { balance: balanceEth, wallet: wallet.address, portfolio, tokens, sessions: refreshed, sellConfig, transactions: txs, timestamp: Date.now() };
}

function broadcast(clients, data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try { client.res.write(msg); } catch { /* gone */ }
  }
}

import * as poly from './polymarket/index.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  const wallet = loadOrCreateWallet();

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http('https://polygon-bor.publicnode.com', { timeout: 5000 }),
  });

  // Kick chart ticks + ML ladder even when bot is stopped
  try { poly.startBackgroundFeeds(); } catch (err) {
    console.error('background feeds:', err?.message || err);
  }

  // Timeout middleware
  app.use((req, res, next) => {
    // ML / chart sample can take longer
    const long = req.path.startsWith('/api/poly/charts') || req.path.startsWith('/api/poly/ml');
    res.setTimeout(long ? 90000 : 25000, () => {
      if (!res.headersSent) res.status(503).json({ error: 'timeout' });
    });
    next();
  });

  // --- API Routes ---

  app.get('/api/status', async (req, res) => {
    try {
      const balance = await Promise.race([
        publicClient.getBalance({ address: wallet.address }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 5000)),
      ]);
      const polBalance = await publicClient.getBalance({ address: wallet.address }).catch(() => 0n);
      res.json({
        address: wallet.address,
        balance: formatEther(balance),
        pol: formatEther(polBalance),
        chainId: 137,
        chain: 'Polygon',
        network: 'mainnet',
        status: 'operational',
      });
    } catch (err) {
      res.json({
        address: wallet.address,
        balance: '0',
        chainId: 137,
        chain: 'Polygon',
        network: 'mainnet',
        status: 'rpc_error',
        error: err.message,
      });
    }
  });

  app.post('/api/generate', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const result = await generateTokenFromPrompt(prompt);
    if (!result) {
      return res.status(500).json({ error: 'AI generation failed' });
    }
    res.json(result);
  });

  app.post('/api/launch', async (req, res) => {
    const { name, symbol, description, initialBuyPct } = req.body;

    if (!name || !symbol) {
      return res.status(400).json({ error: 'Missing required fields: name, symbol' });
    }

    try {
      const result = await launchFlashToken({
        name,
        symbol,
        description: description || '',
        initialBuyPct: Number(initialBuyPct || 50),
      });

      const session = addSession({
        type: 'launch',
        ...result,
        wallet: wallet.address,
        feesCollected: 0,
        currentValue: 0,
        logoUrl: result.logoUrl || null,
      });

      const ssePush = app.get('ssePush');
      if (ssePush) ssePush();

      res.json({ success: true, ...result, sessionId: session.id });
    } catch (err) {
      const errorMsg = err.stderr?.toString() || err.stdout?.toString() || err.message;
      res.status(500).json({
        success: false,
        error: errorMsg.substring(0, 1000),
      });
    }
  });

  app.get('/api/sessions', (req, res) => {
    res.json(getSessions().reverse());
  });

  app.get('/api/wallet', (req, res) => {
    res.json({
      address: wallet.address,
      chainId: 137,
      chain: 'Polygon',
    });
  });

  app.post('/api/sell', async (req, res) => {
    const { tokenAddress, amount } = req.body;
    if (!tokenAddress) return res.status(400).json({ error: 'tokenAddress required' });

    const sessions = getSessions();
    const session = sessions.find(s => s.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase());
    if (!session) return res.status(400).json({ error: 'Token not found in sessions' });

    try {
      const result = await sellToken({
        tokenAddress,
        amountToSell: amount && amount !== 'all' ? parseFloat(amount) : undefined,
        sellAll: amount === 'all' || !amount,
      });

      addTransaction({
        type: 'sell',
        symbol: session.symbol,
        tokenAddress,
        txHash: result.txHash,
        approveHash: result.approveHash,
        amountIn: result.amountIn,
        gasUsed: result.gasUsed,
        block: result.block,
      });

      const ssePush = app.get('ssePush');
      if (ssePush) ssePush();

      res.json({ success: true, ...result, symbol: session.symbol });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message?.substring(0, 500) || 'Sell failed' });
    }
  });

  app.get('/api/transactions', (req, res) => {
    res.json(loadTransactions().reverse());
  });

  app.post('/api/deposit', (req, res) => {
    const { txHash, amount } = req.body;
    if (!txHash || !amount) return res.status(400).json({ error: 'txHash and amount required' });

    addTransaction({
      type: 'deposit',
      symbol: 'ETH',
      tokenAddress: wallet.address,
      txHash,
      amountIn: amount,
      gasUsed: 21000,
      block: 0,
    });

    const ssePush = app.get('ssePush');
    if (ssePush) ssePush();

    res.json({ ok: true });
  });

  app.get('/api/token-fees', (req, res) => {
    res.json(getTokenFees());
  });

  app.post('/api/config/sell', (req, res) => {
    const { enabled, tpPct, slPct } = req.body;
    saveAutoSellConfig({ enabled: !!enabled, tpPct: Number(tpPct || 50), slPct: Number(slPct || 25) });
    res.json({ ok: true });
  });

  app.get('/api/pnl', async (req, res) => {
    try {
      const balance = await publicClient.getBalance({ address: wallet.address });
      const balanceEth = Number(formatEther(balance));
      const sessions = getSessions();
      const activeTokens = sessions.filter(s => s.tokenAddress && s.initialBuyAmount);
      let totalPnl = 0;
      let totalSpent = 0;
      let totalReturn = 0;
      const tokenPnl = activeTokens.map(s => {
        const spent = s.initialBuyAmount || 0;
        const feesCollected = s.feesCollected || 0;
        const currentValue = s.currentValue || 0;
        const totalReturn = feesCollected + currentValue;
        const netPnl = totalReturn - spent;
        const roi = spent > 0 ? ((totalReturn - spent) / spent) * 100 : 0;
        totalPnl += netPnl;
        totalSpent += spent;
        totalReturn += totalReturn;
        return { symbol: s.symbol, spent, feesCollected, currentValue, netPnl, roi };
      });
      const roi = totalSpent > 0 ? ((totalReturn - totalSpent) / totalSpent) * 100 : 0;
      res.json({ balance: balanceEth, totalPnl, totalSpent, totalReturn, roi, tokens: tokenPnl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  async function pushAll() {
    try {
      const data = await collectStreamData(publicClient, wallet);
      broadcast(sseClients, data);
    } catch {}
  }

  // Expose pushAll so sell/launch handlers can trigger immediate refresh
  app.set('ssePush', pushAll);

  // --- Polymarket AI Prediction Bot ---

  let polySseClients = [];
  function pushPolyState() {
    const state = poly.getState();
    const data = JSON.stringify(state);
    polySseClients = polySseClients.filter(c => {
      try { c.res.write(`data: ${data}\n\n`); return true; }
      catch { c.res.end(); return false; }
    });
  }
  poly.onStateChange(pushPolyState);

  app.get('/api/poly/state', (req, res) => {
    res.json(poly.getState());
  });

  app.get('/api/poly/stream', (req, res) => {
    const client = { res };
    polySseClients.push(client);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify(poly.getState())}\n\n`);
    req.on('close', () => {
      polySseClients = polySseClients.filter(c => c !== client);
    });
  });

  app.get('/api/poly/readiness', async (req, res) => {
    try {
      res.json(await poly.getReadiness());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/poly/sync', async (req, res) => {
    try {
      res.json(await poly.syncBalances());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/poly/deposit', async (req, res) => {
    try {
      const { amountUsd } = req.body || {};
      const result = await poly.syncBalances();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/poly/start', (req, res) => {
    poly.startBot();
    res.json({ ok: true });
  });

  app.post('/api/poly/stop', (req, res) => {
    poly.stopBot();
    res.json({ ok: true });
  });

  app.post('/api/poly/config', (req, res) => {
    poly.saveConfig(req.body);
    res.json({ ok: true });
  });

  app.post('/api/poly/sell', async (req, res) => {
    try {
      const { positionId } = req.body || {};
      res.json(await poly.rapidSell(positionId));
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/poly/sell-all', async (req, res) => {
    try {
      res.json(await poly.rapidSellAll());
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/poly/sell-pm', async (req, res) => {
    try {
      const { assetId, size } = req.body || {};
      res.json(await poly.rapidSellPmAsset({ assetId, size }));
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/poly/withdraw', async (req, res) => {
    try {
      const { amountUsd, recipient, chainId } = req.body || {};
      res.json(await poly.initiateWithdraw({ amountUsd, recipient, chainId }));
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/poly/audit', async (req, res) => {
    try {
      res.json(await poly.getAudit());
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/poly/baseline', (req, res) => {
    const { balanceUsd } = req.body || {};
    if (balanceUsd == null) return res.status(400).json({ error: 'balanceUsd required' });
    res.json(poly.setBaseline(Number(balanceUsd)));
  });

  app.post('/api/poly/approve', async (req, res) => {
    try {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      res.json(await poly.approveTrade(id));
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/poly/reject', async (req, res) => {
    try {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      res.json(await poly.rejectTrade(id));
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/poly/approve-all', async (req, res) => {
    try {
      res.json(await poly.approveAllTrades());
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/poly/depth', async (req, res) => {
    try {
      const { tokenId } = req.query;
      if (!tokenId) return res.status(400).json({ error: 'tokenId required' });
      const { getOrderBookDepth } = await import('./polymarket/clob.js');
      const depth = await getOrderBookDepth(tokenId);
      res.json(depth);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/poly/charts', async (req, res) => {
    try {
      const refreshMl = req.query.ml === '1' || req.query.refreshMl === '1';
      res.json(await poly.sampleCharts({ refreshMl }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/poly/ml-refresh', async (req, res) => {
    try {
      res.json(await poly.refreshMLTraces(true));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- SSE Data Stream ---
  app.get('/api/stream', (req, res) => {
    const client = { res };
    sseClients.push(client);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== client);
    });

    pushAll();
    const interval = setInterval(pushAll, 5000);
    req.on('close', () => clearInterval(interval));
  });

  // --- Static ---
  const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist');
  app.use('/assets', express.static(path.join(ROOT, 'assets')));
  app.use(express.static(FRONTEND_DIST));

  app.get('{*path}', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });

  return app;
}
