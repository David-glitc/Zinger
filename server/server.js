import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const LAUNCHES_LOG = path.join(DATA_DIR, 'launches.json');
const TRADE_LOG = path.join(DATA_DIR, 'trades.json');

const DEV_ADDRESS = process.env.DEV_ADDRESS || '0x...';
const PORT = parseInt(process.env.PORT || '3000', 10);

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.json': 'application/json',
};

function readJSON(file) {
  try {
    const data = fs.readFileSync(file, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function renderDashboard() {
  const launches = readJSON(LAUNCHES_LOG) || [];
  const trades = readJSON(TRADE_LOG) || [];

  const totalLaunches = launches.length;
  const successfulLaunches = launches.filter(l => l.status === 'success').length;
  const failedLaunches = launches.filter(l => l.status === 'failed').length;
  const totalTrades = trades.length;
  const avgTime = launches.filter(l => l.elapsed).reduce((a, l) => a + parseFloat(l.elapsed), 0) / Math.max(launches.filter(l => l.elapsed).length, 1);
  const successRate = totalLaunches > 0 ? ((successfulLaunches / totalLaunches) * 100).toFixed(1) : '0.0';
  const totalVolume = trades.length > 0 ? trades.reduce((sum, t) => sum + (t.buyAmount || 0), 0).toFixed(4) : '0.0000';

  const launchRows = launches.map(l => `
    <tr class="${l.status}">
      <td>${l.symbol}</td>
      <td>${l.name}</td>
      <td>${l.feeTier}%</td>
      <td>${l.marketCap}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
      <td>${l.elapsed || '-'}s</td>
      <td>${l.tokenAddress && l.tokenAddress !== 'unknown'
        ? `<a href="https://robinhoodchain.blockscout.com/address/${l.tokenAddress}" target="_blank">${l.tokenAddress.substring(0, 10)}...</a>`
        : '-'}</td>
      <td>${l.txHash && l.txHash !== 'unknown'
        ? `<a href="https://robinhoodchain.blockscout.com/tx/${l.txHash}" target="_blank">${l.txHash.substring(0, 10)}...</a>`
        : '-'}</td>
    </tr>
  `).join('');

  const tradeRows = trades.map(t => `
    <tr>
      <td>${t.token}</td>
      <td>${t.cycle}</td>
      <td>${t.buyAmount || '-'} ETH</td>
      <td>${t.sellPercent || '-'}%</td>
      <td>${t.buyTx ? `<a href="https://robinhoodchain.blockscout.com/tx/${t.buyTx}" target="_blank">${t.buyTx.substring(0, 10)}...</a>` : '-'}</td>
      <td>${t.sellTx ? `<a href="https://robinhoodchain.blockscout.com/tx/${t.sellTx}" target="_blank">${t.sellTx.substring(0, 10)}...</a>` : '-'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zinger Automation Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0b0d11;
      color: #e4e7eb;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 1.5rem; color: #6366f1; margin-bottom: 4px; }
    .subtitle { color: #9ca3af; font-size: 0.85rem; margin-bottom: 24px; }
    .dev-addr {
      background: #1a1d24;
      border: 1px solid #2a2d35;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      font-family: monospace;
      font-size: 0.8rem;
      color: #22c55e;
    }
    .dev-addr span { color: #9ca3af; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: #1a1d24;
      border: 1px solid #2a2d35;
      border-radius: 8px;
      padding: 16px;
    }
    .stat-card .value { font-size: 1.5rem; font-weight: 700; }
    .stat-card .label { color: #9ca3af; font-size: 0.75rem; text-transform: uppercase; margin-top: 4px; }
    .stat-card .value.green { color: #22c55e; }
    .stat-card .value.red { color: #ef4444; }
    .stat-card .value.blue { color: #6366f1; }
    h2 { font-size: 1.1rem; margin-bottom: 12px; margin-top: 24px; color: #e4e7eb; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1a1d24;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #2a2d35;
    }
    th, td { padding: 10px 12px; text-align: left; font-size: 0.8rem; border-bottom: 1px solid #2a2d35; }
    th { background: #1f232b; color: #9ca3af; font-weight: 600; text-transform: uppercase; font-size: 0.7rem; }
    td { font-family: monospace; }
    a { color: #6366f1; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
    }
    .badge-success { background: #166534; color: #86efac; }
    .badge-failed { background: #7f1d1d; color: #fca5a5; }
    .badge-completed { background: #1e3a5f; color: #93c5fd; }
    tr.failed td { color: #fca5a5; }
    .empty { color: #6b7280; padding: 24px; text-align: center; }
    .refresh { color: #6366f1; cursor: pointer; font-size: 0.8rem; margin-left: 8px; }
    @media (max-width: 768px) {
      table { font-size: 0.7rem; }
      th, td { padding: 6px 8px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Zinger Automation</h1>
    <p class="subtitle">Robinhood Chain · BasedBid Flash Tokens · Stress Test Dashboard</p>

    <div class="dev-addr">
      <span>DEV ADDRESS</span> ${DEV_ADDRESS}
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="value blue">${totalLaunches}</div>
        <div class="label">Launches</div>
      </div>
      <div class="stat-card">
        <div class="value green">${successfulLaunches}</div>
        <div class="label">Successful</div>
      </div>
      <div class="stat-card">
        <div class="value red">${failedLaunches}</div>
        <div class="label">Failed</div>
      </div>
      <div class="stat-card">
        <div class="value blue">${avgTime.toFixed(1)}s</div>
        <div class="label">Avg Time</div>
      </div>
      <div class="stat-card">
        <div class="value blue">${successRate}%</div>
        <div class="label">Success Rate</div>
      </div>
      <div class="stat-card">
        <div class="value green">${totalVolume}</div>
        <div class="label">ETH Volume</div>
      </div>
    </div>

    <h2>Launches ${totalLaunches > 0 ? `<span class="refresh" onclick="location.reload()">↻ refresh</span>` : ''}</h2>
    ${launchRows.length > 0 ? `
    <table>
      <thead><tr><th>Symbol</th><th>Name</th><th>Fee</th><th>MCap</th><th>Status</th><th>Time</th><th>Token</th><th>TX</th></tr></thead>
      <tbody>${launchRows}</tbody>
    </table>` : `<div class="empty">No launches yet. Run <code>npm run automate</code></div>`}

    <h2>Trades ${tradeRows.length > 0 ? `<span class="refresh" onclick="location.reload()">↻ refresh</span>` : ''}</h2>
    ${tradeRows.length > 0 ? `
    <table>
      <thead><tr><th>Token</th><th>Cycle</th><th>Buy</th><th>Sell</th><th>Buy TX</th><th>Sell TX</th></tr></thead>
      <tbody>${tradeRows}</tbody>
    </table>` : `<div class="empty">No trades yet. Run <code>npm run trade</code></div>`}

    <p class="subtitle" style="margin-top: 24px;">
      Chain: Robinhood (4663) · <a href="https://robinhoodchain.blockscout.com" target="_blank">Blockscout</a> · <a href="https://based.bid" target="_blank">BasedBid</a>
      · Last updated: ${new Date().toISOString()}
    </p>
  </div>
</body>
</html>`;
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/launches') {
    const launches = readJSON(LAUNCHES_LOG) || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(launches));
    return;
  }

  if (url.pathname === '/api/trades') {
    const trades = readJSON(TRADE_LOG) || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(trades));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderDashboard());
    return;
  }

  const filePath = path.join(PUBLIC_DIR, url.pathname === '/favicon.ico' ? '' : url.pathname);
  if (filePath.startsWith(PUBLIC_DIR)) {
    serveStatic(res, filePath);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Zinger Dashboard: http://localhost:${PORT}`);
  console.log(`Dev Address: ${DEV_ADDRESS}`);
});
