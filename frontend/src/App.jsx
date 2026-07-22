import '@rainbow-me/rainbowkit/styles.css';
import './legacy-terminal.css';
import { getDefaultConfig, RainbowKitProvider, ConnectButton } from '@rainbow-me/rainbowkit';
import { WagmiProvider, useAccount } from 'wagmi';
import { polygon } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { http } from 'wagmi';
import { useState, useEffect, useCallback } from 'react';
import { LiveCountdown, LiveClock, LiveUptime, fmtTimeMs, POLY_POLL_MS } from './polyTimers';

const AUTHORIZED_ADDRESS = '0x5bc2e3dd60c625dda51bac0cf5c3023d45f5e600'.toLowerCase();
const config = getDefaultConfig({
  appName: 'Zinger',
  projectId: 'zinger-terminal',
  chains: [polygon],
  transports: { [polygon.id]: http('https://polygon-bor.publicnode.com') },
  ssr: false,
});
const queryClient = new QueryClient();

function addr(a) { return a ? a.substring(0, 6) + '…' + a.substring(a.length - 4) : '—'; }
function pct(n, d = 1) { return (n >= 0 ? '+' : '') + Number(n).toFixed(d); }
function timeAgo(ts) {
  if (!ts) return '—';
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h';
}

function ConfirmDialog({ open, title, message, steps, onConfirm, onCancel }) {
  const [step, setStep] = useState(0);
  useEffect(() => { if (!open) setStep(0); }, [open]);
  if (!open) return null;
  const s = steps[step];
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="modal-body">
          <div className="confirm-msg">{message}</div>
          <div className="confirm-steps">
            {steps.map((st, i) => (
              <div key={i} className={`confirm-step ${i < step ? 'done' : i === step ? 'active' : ''}`}>
                <span className="confirm-step-num">{i < step ? '✓' : i + 1}</span>
                <span>{st}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className={`btn ${step === steps.length - 1 ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              if (step < steps.length - 1) setStep(s => s + 1);
              else onConfirm();
            }}
          >{step === steps.length - 1 ? 'Confirm & Start' : `Step ${step + 1}: ${s}`}</button>
        </div>
      </div>
    </div>
  );
}

function DepositModal({ open, onClose, poly }) {
  const [amount, setAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const r = poly.readiness;
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box deposit-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Fund Polymarket (deposit wallet)</div>
        <div className="modal-body">
          <p className="deposit-hint" style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.4 }}>
            Zinger does not pull funds from your bank. Send USDC/pUSD on Polygon to the deposit wallet below
            (Polymarket proxy). Then hit Sync — CLOB balance updates when Polymarket credits the wallet.
            The Deposit button only re-syncs balances; it does not move tokens.
          </p>
          <div className="deposit-balances">
            <div className="deposit-bal">
              <span className="deposit-label">CLOB Balance</span>
              <span className="deposit-value">${r?.clobBalance?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="deposit-bal">
              <span className="deposit-label">Deposit Wallet pUSD</span>
              <span className="deposit-value">${r?.depositPusd?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="deposit-bal">
              <span className="deposit-label">POL Balance</span>
              <span className="deposit-value">{r?.polyBalance?.toFixed(4) || '0.0000'}</span>
            </div>
          </div>
          <div className="deposit-input-row">
            <label>Amount (USDC)</label>
            <div className="deposit-input-group">
              <input className="input deposit-input" type="number" min="1" step="1" value={amount} onChange={e => setAmount(Number(e.target.value))} />
              <button className="btn btn-ghost btn-sm" onClick={() => setAmount(5)}>5</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAmount(10)}>10</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAmount(25)}>25</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAmount(50)}>50</button>
            </div>
          </div>
          {result && <div className={`deposit-result ${result.ok ? 'ok' : 'err'}`}>{result.msg}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={loading || amount < 1} onClick={async () => {
            setLoading(true); setResult(null);
            try {
              const res = await fetch('/api/poly/deposit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: amount }) });
              const data = await res.json();
              setResult({
                ok: !data.error,
                msg: data.error
                  || `Synced. CLOB $${Number(data.clobBalance ?? data.spendableBalance ?? 0).toFixed(2)} · deposit pUSD $${Number(data.depositPusd ?? 0).toFixed(2)}. Send USDC to the deposit wallet if balance is still low.`,
              });
            } catch (e) {
              setResult({ ok: false, msg: e.message });
            }
            setLoading(false);
          }}>{loading ? 'Syncing…' : `Sync balances`}</button>
        </div>
      </div>
    </div>
  );
}

function usePolyState() {
  const [state, setState] = useState({
    running: false, config: {}, markets: [], positions: [], trades: [],
    actions: [], stats: {}, telemetry: {}, lastScan: null, kellyStats: null,
    readiness: null, diagnostics: [], cycle: {}, sizing: null, signals: {},
  });
  useEffect(() => {
    let pollTimer;
    let es;

    function connectSSE() {
      es = new EventSource('/api/poly/stream');
      es.onmessage = (e) => {
        try { setState(JSON.parse(e.data)); } catch {}
      };
      es.onerror = () => {
        es.close();
        es = null;
      };
    }

    function fetchState() {
      fetch('/api/poly/state').then(r => r.json()).then(setState).catch(() => {});
    }

    fetchState();
    connectSSE();
    pollTimer = setInterval(fetchState, POLY_POLL_MS);

    return () => {
      clearInterval(pollTimer);
      if (es) es.close();
    };
  }, []);
  return state;
}

function WalletGuard({ children }) {
  const { address, isConnected } = useAccount();
  const [authState, setAuthState] = useState('loading');
  useEffect(() => {
    if (!isConnected) setAuthState('disconnected');
    else if (address?.toLowerCase() === AUTHORIZED_ADDRESS) setAuthState('authorized');
    else setAuthState('unauthorized');
  }, [address, isConnected]);
  if (authState === 'loading') return <div className="loading">Loading wallet…</div>;
  if (authState === 'disconnected') return (
    <div className="auth-screen">
      <div className="auth-box">
        <div className="auth-logo">Zinger</div>
        <div className="auth-sub">Connect authorized wallet</div>
        <ConnectButton />
        <div className="auth-addr">{addr(AUTHORIZED_ADDRESS)}</div>
      </div>
    </div>
  );
  if (authState === 'unauthorized') return (
    <div className="auth-screen">
      <div className="auth-box" style={{ borderColor: '#ff6b6b' }}>
        <div className="auth-logo" style={{ color: '#ff6b6b' }}>Unauthorized</div>
        <div className="auth-sub">Connected {addr(address || '')}</div>
        <ConnectButton />
      </div>
    </div>
  );
  return children;
}

function StatCard({ label, value, cls = '' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${cls}`}>{value}</div>
    </div>
  );
}

function useMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile;
}

function Dashboard() {
  const poly = usePolyState();
  const { config: cfg } = poly;
  const stats = poly.stats || {};
  const kelly = poly.kellyStats;
  const telemetry = poly.telemetry || {};
  const mobile = useMobile();
  const [showControls, setShowControls] = useState(false);
  const [viewMode, setViewMode] = useState('all');
  const [confirmStart, setConfirmStart] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);

  const liveStats = stats.live || {};
  const paperStats = stats.paper || {};
  const filteredPositions = poly.positions.filter(p => viewMode === 'all' || p.mode === viewMode);
  const filteredTrades = poly.trades.filter(t => viewMode === 'all' || t.mode === viewMode);

  const postConfig = useCallback((body) => {
    fetch('/api/poly/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }, []);

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          <div className="logo">Zinger</div>
          <div className="logo-badge">v2</div>
          <nav className="nav-links">
            <button className={`nav-btn ${viewMode === 'all' ? 'active' : ''}`} onClick={() => setViewMode('all')}>All</button>
            <button className={`nav-btn ${viewMode === 'live' ? 'active' : ''}`} onClick={() => setViewMode('live')}>Live</button>
            <button className={`nav-btn ${viewMode === 'paper' ? 'active' : ''}`} onClick={() => setViewMode('paper')}>Paper</button>
          </nav>
        </div>
        <div className="header-right">
          <div className={`status-pill ${poly.running ? 'running' : 'stopped'}`}>
            <span className="status-dot" />
            <span>{poly.running ? (mobile ? 'ON' : 'BOT LIVE') : (mobile ? 'OFF' : 'BOT STOPPED')}</span>
          </div>
          <div className="mode-pill" data-mode={cfg.mode}>
            {mobile ? (cfg.mode === 'live' ? 'L' : 'P') : (cfg.mode === 'live' ? 'LIVE' : 'PAPER')}
          </div>
          {!mobile && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowDeposit(true)}>
              Deposit
            </button>
          )}
          {mobile ? (
            <button className={`btn-toggle ${showControls ? 'active' : ''}`} onClick={() => setShowControls(!showControls)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          ) : null}
          <ConnectButton showBalance={false} />
        </div>
      </header>

      {/* STATS BAR — mode-aware */}
      <div className="stats-bar">
        {viewMode === 'live' || viewMode === 'all' ? (
          <div className="stats-group stats-live">
            <div className="stats-group-header">LIVE</div>
            <StatCard label="Cash" value={'$' + (poly.portfolio?.cash || 0).toFixed(2)} cls={poly.portfolio?.cash > 0 ? 'up' : ''} />
            <StatCard label="PnL" value={((poly.portfolio?.cashPnl || 0) >= 0 ? '+' : '') + '$' + (poly.portfolio?.cashPnl || 0).toFixed(2)} cls={(poly.portfolio?.cashPnl || 0) >= 0 ? 'up' : 'down'} />
            <StatCard label="Trades" value={liveStats.totalTrades || 0} />
            <StatCard label="Win%" value={liveStats.winRate ? liveStats.winRate + '%' : '—'} cls={Number(liveStats.winRate || 0) >= 50 ? 'up' : 'down'} />
            <StatCard label="Best" value={liveStats.bestTrade ? '+$' + liveStats.bestTrade.toFixed(2) : '—'} cls="up" />
            <StatCard label="Worst" value={liveStats.worstTrade ? '-$' + Math.abs(liveStats.worstTrade).toFixed(2) : '—'} cls="down" />
          </div>
        ) : null}
        {viewMode === 'paper' || viewMode === 'all' ? (
          <div className="stats-group stats-paper">
            <div className="stats-group-header">PAPER</div>
            <StatCard label="PnL" value={((paperStats.totalPnl || 0) >= 0 ? '+' : '') + '$' + (paperStats.totalPnl || 0).toFixed(2)} cls={(paperStats.totalPnl || 0) >= 0 ? 'up' : 'down'} />
            <StatCard label="Trades" value={paperStats.totalTrades || 0} />
            <StatCard label="Win%" value={paperStats.winRate ? paperStats.winRate + '%' : '—'} cls={Number(paperStats.winRate || 0) >= 50 ? 'up' : 'down'} />
            <StatCard label="Best" value={paperStats.bestTrade ? '+$' + paperStats.bestTrade.toFixed(2) : '—'} cls="up" />
            <StatCard label="Worst" value={paperStats.worstTrade ? '-$' + Math.abs(paperStats.worstTrade).toFixed(2) : '—'} cls="down" />
          </div>
        ) : null}
        <div className="stats-group stats-bot">
          <div className="stats-group-header">BOT</div>
          <StatCard label="USDC / CLOB" value={'$' + (telemetry.usdcBalance || poly.readiness?.clobBalance || 0).toFixed(2)} />
          <StatCard label="Kelly ƒ" value={kelly ? kelly.kelly + 'x' : '—'} />
          <StatCard label="Edge" value={kelly ? '$' + kelly.edge : '—'} cls={kelly && kelly.edge >= 0 ? 'up' : 'down'} />
          <StatCard label="Scans" value={stats.scansDone || 0} />
          <StatCard label="Win/Loss φ" value={kelly ? kelly.winRate + '% / ' + kelly.ratio + 'x' : '—'} />
        </div>
      </div>

      {/* MODE PNL SNIPPET */}
      <div className="mode-pnl-strip">
        <span className={`mode-pnl-item ${(poly.portfolio?.cashPnl || 0) >= 0 ? 'up' : 'down'}`}>
          <span className="mode-pnl-label">LIVE</span>
          {(poly.portfolio?.cashPnl || 0) >= 0 ? '+' : ''}${(poly.portfolio?.cashPnl || 0).toFixed(2)}
        </span>
        <span className="mode-pnl-sep" />
        <span className={`mode-pnl-item ${(stats.paper?.totalPnl || 0) >= 0 ? 'up' : 'down'}`}>
          <span className="mode-pnl-label">PAPER</span>
          {(stats.paper?.totalPnl || 0) >= 0 ? '+' : ''}${(stats.paper?.totalPnl || 0).toFixed(2)}
        </span>
        <span className="mode-pnl-sep" />
        <span className="mode-pnl-item">
          <span className="mode-pnl-label">BASELINE</span>
          ${(poly.portfolio?.baselineUsd || 0).toFixed(2)}
        </span>
        <span className="mode-pnl-sep" />
        <span className="mode-pnl-item">
          <span className="mode-pnl-label">BOT NET</span>
          {(stats.botPnl || 0) >= 0 ? '+' : ''}${(stats.botPnl || 0).toFixed(2)}
        </span>
        {stats.cashPnl != null && stats.cashPnl !== stats.botPnl && (
          <>
            <span className="mode-pnl-sep" />
            <span className="mode-pnl-item dim">cash ${stats.cashPnl.toFixed(2)}</span>
          </>
        )}
        <span className="mode-pnl-equity">
          EQUITY ${(poly.portfolio?.equity || 0).toFixed(2)}
        </span>
      </div>

      {/* CONTROLS — merged with cycle info */}
      <div className={`controls-bar ${mobile && !showControls ? 'collapsed' : ''}`}>
        {mobile && (
          <div className="controls-mobile-row">
            <button
              className={`btn ${poly.running ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => {
                if (!poly.running && cfg.mode === 'live') setConfirmStart(true);
                else fetch(poly.running ? '/api/poly/stop' : '/api/poly/start', { method: 'POST' });
              }}
              style={{ flex: 1 }}
            >
              {poly.running ? 'STOP' : 'START'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowControls(!showControls)}>
              {showControls ? '▲ Less' : '▼ More'}
            </button>
          </div>
        )}
        {(!mobile || showControls) && (
          <div className="controls-body">
            {/* Row 1: Actions */}
            <div className="controls-row">
              {!mobile && (
                <button
                  className={`btn ${poly.running ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => {
                    if (!poly.running && cfg.mode === 'live') setConfirmStart(true);
                    else fetch(poly.running ? '/api/poly/stop' : '/api/poly/start', { method: 'POST' });
                  }}
                >
                  {poly.running ? 'STOP' : 'START'}
                </button>
              )}
              <div className="control-group">
                <label>Mode</label>
                <button
                  className={`btn btn-sm mode-toggle ${cfg.mode || 'paper'}`}
                  onClick={() => postConfig({ mode: cfg.mode === 'live' ? 'paper' : 'live' })}
                >{(cfg.mode || 'paper').toUpperCase()}</button>
              </div>
              <div className="control-group">
                <label>Kelly</label>
                <span className="control-badge">{cfg.useKellySizing ? 'ON' : 'OFF'}</span>
              </div>
              <div className="control-group">
                <label>ML</label>
                <span className="control-badge">{cfg.useML ? 'ON' : 'OFF'}</span>
              </div>
              <div className="control-group">
                <label>15m</label>
                <span className={`control-badge ${cfg.use15m !== false ? '' : 'off'}`} style={{cursor:'pointer'}} onClick={() => postConfig({ use15m: cfg.use15m === false ? true : false })}>
                  {cfg.use15m !== false ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="control-divider" />
              <button
                className="btn btn-sm btn-panic"
                onClick={() => { if (confirm('Panic sell ALL open positions?')) fetch('/api/poly/sell-all', { method: 'POST' }); }}
              >🔴 PANIC</button>
            </div>

            {/* Row 2: Cycle / Telemetry */}
            <div className="controls-row cycle-info">
              <span className="cycle-label">Cycle</span>
              <LiveCountdown endAtMs={poly.cycle?.endAtMs} fallbackMs={poly.cycle?.remainingMs} fallbackSeconds={poly.cycle?.remainingSeconds} />
              <span className="cycle-sep">·</span>
              <span className="cycle-label">Up</span>
              <LiveUptime startedAt={telemetry.startedAt} fallbackSeconds={telemetry.uptime} />
              <span className="cycle-sep">·</span>
              <LiveClock />
              {poly.lastScan && <><span className="cycle-sep">·</span><span>Scan {fmtTimeMs(poly.lastScan)}</span></>}
              {poly.sizing?.sizeUsd > 0 && <><span className="cycle-sep">·</span><span>Bet ${poly.sizing.sizeUsd.toFixed(2)}</span></>}
              <span className="cycle-sep">·</span><span>{telemetry.scansToday || poly.stats?.scansDone || 0} scans</span>
            </div>

            {/* Row 3: Params */}
            <div className="controls-row params-row">
              <div className="control-group">
                <label>Price</label>
                <input className="input input-sm" type="number" step="0.001" value={cfg.minPrice || 0.4}
                  onChange={e => postConfig({ minPrice: Number(e.target.value) })} />
                <span className="control-sep">→</span>
                <input className="input input-sm" type="number" step="0.001" value={cfg.maxPrice || 1}
                  onChange={e => postConfig({ maxPrice: Number(e.target.value) })} />
              </div>
              <div className="control-group">
                <label>TP</label>
                <input className="input input-sm" type="number" value={cfg.tpPctLow || 25}
                  onChange={e => postConfig({ tpPctLow: Number(e.target.value) })} />
                <span className="control-sep">—</span>
                <input className="input input-sm" type="number" value={cfg.tpPctHigh || 55}
                  onChange={e => postConfig({ tpPctHigh: Number(e.target.value) })} />
              </div>
              <div className="control-group">
                <label>SL</label>
                <input className="input input-sm" type="number" value={cfg.slPct || 18}
                  onChange={e => postConfig({ slPct: Number(e.target.value) })} />
              </div>
              <div className="control-divider" />
              <div className="control-group">
                <label>Conf</label>
                <input className="input input-sm" type="number" step="0.05" min="0" max="1" value={cfg.minConfidence || 0.3}
                  onChange={e => postConfig({ minConfidence: Number(e.target.value) })} />
              </div>
              <div className="control-group">
                <label>Size</label>
                <input className="input input-sm" type="number" step="0.1" value={cfg.minPositionSize || 0.5}
                  onChange={e => postConfig({ minPositionSize: Number(e.target.value) })} />
                <span className="control-sep">→</span>
                <input className="input input-sm" type="number" step="0.5" value={cfg.maxPositionSize || 3}
                  onChange={e => postConfig({ maxPositionSize: Number(e.target.value) })} />
              </div>
            </div>

            {/* Row 4: Open Positions Summary + ML Trace */}
            {(() => {
              const openPositions = filteredPositions.filter(p => !p.closed);
              return (<div className="controls-row open-summary">
                <span className="open-summary-label">POSITIONS</span>
                {openPositions.length === 0 ? (
                  <span className="open-summary-none">none</span>
                ) : openPositions.slice(0, 4).map((p, i) => (
                  <span key={i} className={`open-summary-item ${(p.pnl || 0) >= 0 ? 'up' : 'down'}`}>
                    {p.symbol} {p.outcome?.toUpperCase().charAt(0)}
                    <span className="open-pnl">{(p.pnl || 0) >= 0 ? '+' : ''}${(p.pnl || 0).toFixed(2)}</span>
                  </span>
                ))}
                {openPositions.length > 4 && <span className="open-summary-more">+{openPositions.length - 4}</span>}
                <span className="cycle-sep">·</span>
                {poly.signals?.btc?.mlOverride && <span className="ml-trace override">BTC ⚡ {(poly.signals.btc.mlConfidence * 100).toFixed(0)}%</span>}
                {poly.signals?.btc?.mlConfirmed && <span className="ml-trace confirm">BTC ✓ {(poly.signals.btc.mlConfidence * 100).toFixed(0)}%</span>}
                {poly.signals?.eth?.mlOverride && <span className="ml-trace override">ETH ⚡ {(poly.signals.eth.mlConfidence * 100).toFixed(0)}%</span>}
                {poly.signals?.eth?.mlConfirmed && <span className="ml-trace confirm">ETH ✓ {(poly.signals.eth.mlConfidence * 100).toFixed(0)}%</span>}
                {(!poly.signals?.btc?.mlOverride && !poly.signals?.btc?.mlConfirmed && !poly.signals?.eth?.mlOverride && !poly.signals?.eth?.mlConfirmed) && <span className="dim">ML idle</span>}
              </div>);
            })()}
          </div>
        )}
      </div>

      {/* READINESS */}
      {poly.readiness && (
        <div className={`readiness ${poly.readiness.liveReady || cfg.mode === 'paper' ? 'ok' : 'warn'}`}>
          <span className="readiness-icon">{poly.readiness.liveReady || cfg.mode === 'paper' ? '✓' : '⚠'}</span>
          {cfg.mode === 'paper' ? 'Paper mode — no execution'
            : poly.readiness.liveReady ? 'Ready for live execution'
            : 'Blocked: ' + (poly.readiness.needs || []).join(', ')}
          {poly.readiness.clobBalance != null && <> · CLOB ${poly.readiness.clobBalance.toFixed(2)}</>}
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="main-layout">
        {/* LEFT COLUMN */}
        <div className="col-left">
          {/* MARKETS TABLE */}
          <div className="section">
            <div className="section-header">
              <span>Markets</span>
              <span className="section-count">{poly.markets.filter(m => m.prices?.up).length} active</span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>YES</th>
                    <th>NO</th>
                    <th>Spread</th>
                    <th>Ends</th>
                    <th>Signal</th>
                    <th>Action</th>
                    <th>Trace</th>
                  </tr>
                </thead>
                <tbody>
                  {poly.markets.length === 0 ? (
                    <tr><td colSpan={8} className="empty-td">Scanning 5-min markets…</td></tr>
                  ) : poly.markets.filter(m => m.prices?.up).map((m, i) => {
                    const sig = m.signal;
                    const sigDir = sig?.direction;
                    const dec = m.decision;
                    const decAction = dec?.action || m.action || 'hold';
                    return (
                      <tr key={i} className={decAction === 'buy' ? 'row-buy' : ''}>
                        <td>
                          <div className="cell-sym">{m.symbol}</div>
                          <div className="cell-sub">{m.slug}</div>
                        </td>
                        <td className={m.prices.up < 0.5 ? 'up' : ''}>${m.prices.up?.toFixed(3) || '—'}</td>
                        <td>${m.prices.down?.toFixed(3) || '—'}</td>
                        <td className="cell-spread">{(1 - m.prices.up - m.prices.down).toFixed(3)}</td>
                        <td className="cell-countdown">
                          <LiveCountdown endAtMs={m.endAtMs} fallbackMs={m.remainingMs} fallbackSeconds={m.remaining} />
                        </td>
                        <td>
                          {sig ? (
                            <>
                              <span className={`sig-dir ${sigDir}`}>{sigDir?.toUpperCase()} {(sig.confidence * 100).toFixed(0)}%</span>
                              <div className="cell-sub">{m.signalDetails?.signals?.slice(0, 2).join(' · ')}</div>
                            </>
                          ) : <span className="dim">—</span>}
                        </td>
                        <td>
                          {decAction === 'buy' ? <span className="tag-buy">BUY {dec?.outcome?.toUpperCase()}</span>
                            : decAction === 'watch' ? <span className="tag-watch">WATCH</span>
                            : <span className="dim">HOLD</span>}
                        </td>
                        <td>
                          <div className="trace-lines">
                            {(dec?.trace || []).slice(0, 2).map((t, j) => (
                              <div key={j} className="trace-line">{t}</div>
                            ))}
                            {(!dec?.trace || dec.trace.length === 0) && <div className="dim">—</div>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PREDICTOR CARDS */}
          {poly.signals?.btc && (
            <div className="section">
              <div className="section-header">
                <span>Predictor</span>
              </div>
              <div className="predictor-grid">
                {['btc', 'eth'].map(asset => {
                  const s = poly.signals[asset];
                  if (!s || !s.price) return null;
                  return (
                    <div key={asset} className="predictor-card">
                      <div className="pred-header">
                        <span className="pred-asset">{asset.toUpperCase()}</span>
                        <span className={`pred-dir ${s.direction}`}>${s.price.toFixed(0)} → {s.direction.toUpperCase()}</span>
                      </div>
                      <div className="pred-strip">
                        <span>RSI <b className={s.rsi > 70 ? 'down' : s.rsi < 30 ? 'up' : ''}>{s.rsi?.toFixed(0)}</b></span>
                        <span>MACD <b className={s.macd?.histogram > 0 ? 'up' : 'down'}>{s.macd?.histogram > 0 ? '▲' : '▼'}</b></span>
                        <span>ADX <b>{s.adx?.adx?.toFixed(0) || '—'}</b></span>
                        <span>BB <b>{s.bb ? (s.bb.pos * 100).toFixed(0) + '%' : '—'}</b></span>
                      </div>
                      <div className="pred-strip">
                        <span>MOM <b className={s.momentum?.m5 > 0 ? 'up' : 'down'}>{s.momentum?.m5 ? (s.momentum.m5 > 0 ? '+' : '') + s.momentum.m5.toFixed(2) + '%' : '—'}</b></span>
                        <span>VOL <b>{(s.volume?.ratio || 1).toFixed(1)}x</b></span>
                        <span>ATR <b>{s.volatility?.atrPct ? s.volatility.atrPct.toFixed(2) + '%' : '—'}</b></span>
                        <span>EDGE <b className={s.edge > 0 ? 'up' : 'down'}>{s.edge > 0 ? '+' : ''}{s.edge?.toFixed(2)}</b></span>
                      </div>
                      <div className="pred-signals">{s.signals?.slice(0, 4).join(' · ')}</div>
                      <div className="pred-footer">
                        Score <b className={s.score > 0 ? 'up' : s.score < 0 ? 'down' : ''}>{s.score > 0 ? '+' : ''}{s.score.toFixed(1)}</b>
                        · Conf <b>{(s.confidence * 100).toFixed(0)}%</b>
                        {s.mlOverride && <span className="ml-badge override">ML ⚡</span>}
                        {s.mlConfirmed && <span className="ml-badge confirm">ML ✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ACTIVE POSITIONS */}
          {filteredPositions.filter(p => !p.closed).length > 0 && (
            <div className="section">
              <div className="section-header">
                <span>Open Positions {viewMode !== 'all' ? `(${viewMode})` : ''}</span>
                <span className="section-count">{filteredPositions.filter(p => !p.closed).length}</span>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Side</th>
                      <th>Entry</th>
                      <th>Price</th>
                      <th>PnL</th>
                      <th>Gain</th>
                      <th>TP</th>
                      <th>SL</th>
                      <th>Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPositions.filter(p => !p.closed).map((p, i) => (
                      <tr key={i}>
                        <td className="cell-sym">{p.symbol}</td>
                        <td className={p.outcome === 'up' ? 'up' : 'down'} style={{ fontWeight: 600 }}>{p.outcome?.toUpperCase()}</td>
                        <td>${p.entryPrice?.toFixed(3)}</td>
                        <td>${p.currentPrice?.toFixed(3)}</td>
                        <td className={(p.pnl || 0) >= 0 ? 'up' : 'down'}>${(p.pnl || 0).toFixed(2)}</td>
                        <td className={(p.gainPct || 0) >= 0 ? 'up' : 'down'}>{(p.gainPct || 0) >= 0 ? '+' : ''}{(p.gainPct || 0).toFixed(1)}%</td>
                        <td>{(p.targetTp || 0).toFixed(0)}%</td>
                        <td>{Math.abs(p.slPct || 0).toFixed(0)}%</td>
                        <td className="dim">{timeAgo(p.entryTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="col-right">
          <div className="section">
            <div className="section-header">
              <span>Action Log</span>
            </div>
            <div className="action-log">
              {poly.actions.length === 0 ? (
                <div className="empty-state">Press START to begin</div>
              ) : poly.actions.slice(0, 80).map((a, i) => (
                <div key={i} className={`action-line action-${a.type || 'info'}`}>
                  <span className="action-ts">{new Date(a.time).toLocaleTimeString()}</span>
                  <span className="action-msg">{a.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* TRADE HISTORY */}
      {filteredTrades.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span>Trade History {viewMode !== 'all' ? `(${viewMode})` : ''}</span>
            <span className="section-count">{filteredTrades.length} total</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Side</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>PnL</th>
                  <th>Return</th>
                  <th>Exit</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.slice(0, 50).map((t, i) => (
                  <tr key={i}>
                    <td className="cell-sym">{t.symbol}</td>
                    <td className={t.outcome === 'up' ? 'up' : 'down'} style={{ fontWeight: 600 }}>{t.outcome?.toUpperCase()}</td>
                    <td>${t.entryPrice?.toFixed(3)}</td>
                    <td>${t.exitPrice?.toFixed(3) || '—'}</td>
                    <td className={(t.pnl || 0) >= 0 ? 'up' : 'down'}>${(t.pnl || 0).toFixed(2)}</td>
                    <td className={(t.gainPct || 0) >= 0 ? 'up' : 'down'}>{(t.gainPct || 0) >= 0 ? '+' : ''}{(t.gainPct || 0).toFixed(1)}%</td>
                    <td><span className={`exit-tag ${t.exitReason === 'tp' ? 'tag-tp' : t.exitReason === 'trail' ? 'tag-trail' : t.exitReason === 'partial' ? 'tag-partial' : 'tag-sl'}`}>{t.exitReason?.toUpperCase() || '—'}</span></td>
                    <td className="dim">{timeAgo(t.timestamp || t.entryTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONFIRM DIALOG */}
      <ConfirmDialog
        open={confirmStart}
        title="Start Live Bot"
        message="You are about to trade with real USDC on Polymarket. This is not paper."
        steps={['I understand this uses real funds', 'Confirm start live bot']}
        onConfirm={() => { fetch('/api/poly/start', { method: 'POST' }); setConfirmStart(false); }}
        onCancel={() => setConfirmStart(false)}
      />

      {/* DEPOSIT MODAL */}
      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} poly={poly} />

      {/* FOOTER */}
      <footer className="footer-bar">
        <span>Zinger v2</span>
        <span>·</span>
        <span>Polymarket BTC/ETH {cfg.use15m !== false ? '5m+15m' : '5m'}</span>
        <span>·</span>
        <span>Kelly sizing · Trailing stops · Partial TP</span>
        <span>·</span>
        <span>Polygon</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <WalletGuard><Dashboard /></WalletGuard>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
