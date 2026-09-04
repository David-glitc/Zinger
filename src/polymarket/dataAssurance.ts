// @ts-nocheck
/**
 * Data assurance — freshness + integrity gates for paper/live decisions.
 * Trading buys should refuse when critical inputs are stale or missing.
 */

const SPOT_MAX_AGE_MS = 30_000;
const SIGNAL_MAX_AGE_MS = 45_000;
const MARKET_PRICE_MAX_AGE_MS = 45_000;
const POLY_WINDOW_SECONDS = 300;

function ageMs(ts) {
  if (ts == null) return null;
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(0, Date.now() - n);
}

function check(id, ok, detail, { level = 'warn', blockBuys = false } = {}) {
  return {
    id,
    ok: !!ok,
    level: ok ? 'ok' : level,
    detail: detail || (ok ? 'ok' : 'failed'),
    blockBuys: !ok && !!blockBuys,
  };
}

function slugWindowEndMs(slug) {
  const ts = Number(String(slug || '').split('-').pop());
  if (!Number.isFinite(ts) || ts < 1e9) return null;
  return (ts + POLY_WINDOW_SECONDS) * 1000;
}

/**
 * @param {object} opts
 * @param {object} [opts.spotPrices]
 * @param {object} [opts.signals]
 * @param {object} [opts.feed]
 * @param {array} [opts.markets]
 * @param {array} [opts.positions]
 * @param {object} [opts.cashAudit]
 * @param {object} [opts.priceToBeat]
 * @param {boolean} [opts.botRunning]
 */
export function buildDataAssurance(opts = {}) {
  const now = Date.now();
  const checks = [];
  // Arb-only does not need spot/signal — only complementary CLOB books.
  const arbOnly = opts.forceArbOnly === true;

  const spot = opts.spotPrices || {};
  const spotAssets = Array.isArray(opts.assets) && opts.assets.length
    ? opts.assets.map((a) => String(a).toLowerCase())
    : ['btc', 'eth'];
  for (const asset of spotAssets) {
    const tick = spot[asset];
    const age = ageMs(tick?.ts || tick?.timestamp);
    const price = Number(tick?.price);
    checks.push(check(
      `spot_${asset}`,
      Number.isFinite(price) && price > 0 && age != null && age <= SPOT_MAX_AGE_MS,
      Number.isFinite(price) && price > 0
        ? `$${price} · age ${age != null ? `${Math.round(age / 1000)}s` : '?'}`
        : 'missing spot',
      { level: arbOnly ? 'warn' : 'error', blockBuys: !arbOnly },
    ));
  }

  const signals = opts.signals || {};
  const signalAssets = ['btc', 'eth']; // directional signal stack is still BTC/ETH
  for (const asset of signalAssets) {
    const sig = signals[asset];
    const age = ageMs(sig?.timestamp || opts.feed?.lastSignalAt);
    const present = !!sig && Number.isFinite(Number(sig.confidence));
    const fresh = present && age != null && age <= SIGNAL_MAX_AGE_MS;
    checks.push(check(
      `signal_${asset}`,
      present,
      present
        ? `${sig.direction || 'n/a'} conf=${sig.confidence ?? '—'} · age ${age != null ? `${Math.round(age / 1000)}s` : '?'}${fresh ? '' : ' (stale)'}`
        : 'missing signal',
      { level: present ? (fresh ? 'ok' : 'warn') : (arbOnly ? 'warn' : 'error'), blockBuys: !arbOnly && !present },
    ));
  }

  const feedAge = ageMs(opts.feed?.lastSignalAt);
  checks.push(check(
    'signal_feed',
    opts.feed?.status === 'live' || feedAge != null,
    `status=${opts.feed?.status || 'unknown'} · age ${feedAge != null ? `${Math.round(feedAge / 1000)}s` : '?'}`,
    { level: 'warn', blockBuys: false },
  ));

  const markets = Array.isArray(opts.markets) ? opts.markets.filter((m) => m?.isCurrent) : [];
  const priced = markets.filter((m) => {
    const up = Number(m?.prices?.up);
    const down = Number(m?.prices?.down);
    return Number.isFinite(up) && up > 0 && Number.isFinite(down) && down > 0;
  });
  // Between windows there are often zero isCurrent markets — that is normal, not
  // a data fault. Blocking all buys on an empty set made the bot look dead while
  // the scan loop was still running and the observer was still polling.
  const midsOk = markets.length === 0 || priced.length === markets.length;
  checks.push(check(
    'market_mids',
    midsOk,
    markets.length
      ? `${priced.length}/${markets.length} current windows have UP+DOWN mids`
      : 'between windows — no current markets (ok)',
    { level: markets.length === 0 ? 'warn' : 'error', blockBuys: markets.length > 0 && !midsOk },
  ));

  const withBeat = markets.filter((m) => Number(m?.priceToBeat) > 0
    || Number(opts.priceToBeat?.[String(m.symbol || '').toLowerCase()]?.openPrice) > 0);
  // Arb packages only need complementary CLOB asks — Chainlink to-beat is a
  // directional strike input. Do not block arb-only buys on missing oracle open.
  checks.push(check(
    'price_to_beat',
    markets.length === 0 || withBeat.length === markets.length,
    markets.length
      ? `${withBeat.length}/${markets.length} windows have Chainlink open (to-beat)`
      : 'n/a',
    { level: arbOnly ? 'warn' : 'error', blockBuys: !arbOnly },
  ));

  const eventStarts = markets.filter((m) => m?.eventStartTime || (m?.endTime && m.endTime > 1e9));
  checks.push(check(
    'window_clock',
    markets.length === 0 || eventStarts.length === markets.length,
    `${eventStarts.length}/${markets.length || 0} markets have resolvable window clock`,
    { level: 'warn', blockBuys: false },
  ));

  const cashOk = opts.cashAudit?.ok !== false;
  checks.push(check(
    'cash_ledger',
    cashOk,
    cashOk
      ? `equity $${Number(opts.cashAudit?.equity ?? 0).toFixed(2)} · cash $${Number(opts.cashAudit?.cash ?? 0).toFixed(2)}`
      : `ledger issues: ${(opts.cashAudit?.issues || []).slice(0, 3).join('; ') || 'unknown'}`,
    { level: 'error', blockBuys: true },
  ));

  const opens = (opts.positions || []).filter((p) => !p?.closed && p?.mode === 'paper');
  const orphans = opens.filter((p) => {
    const endMs = slugWindowEndMs(p.slug);
    return endMs != null && now > endMs + 15_000;
  });
  checks.push(check(
    'orphan_paper',
    orphans.length === 0,
    orphans.length ? `${orphans.length} paper opens past window end` : 'no orphan opens',
    { level: 'error', blockBuys: true },
  ));

  const lastScanAge = ageMs(opts.lastScan);
  const scanFresh = !opts.botRunning
    || opts.lastScan == null // first scans still warming
    || (lastScanAge != null && lastScanAge <= MARKET_PRICE_MAX_AGE_MS);
  checks.push(check(
    'scan_fresh',
    scanFresh,
    opts.botRunning
      ? (opts.lastScan == null
        ? 'awaiting first full scan'
        : `last scan ${lastScanAge != null ? `${Math.round(lastScanAge / 1000)}s` : '?'} ago`)
      : 'bot stopped',
    { level: 'warn', blockBuys: opts.botRunning && opts.lastScan != null },
  ));

  const failures = checks.filter((c) => !c.ok);
  const blocking = failures.filter((c) => c.blockBuys);
  const score = Math.max(0, Math.round(100 * (checks.filter((c) => c.ok).length / Math.max(checks.length, 1))));

  return {
    ok: blocking.length === 0,
    score,
    canBuy: blocking.length === 0,
    blocking: blocking.map((c) => c.id),
    warnings: failures.filter((c) => !c.blockBuys).map((c) => c.id),
    checks,
    updatedAt: now,
    note: blocking.length
      ? `BUY BLOCKED · ${blocking.map((c) => c.id).join(', ')}`
      : failures.length
        ? `degraded · ${failures.map((c) => c.id).join(', ')}`
        : 'data healthy',
  };
}

export function dataAssuranceBuyBlockReason(assurance) {
  if (!assurance || assurance.canBuy) return null;
  return assurance.note || 'data assurance blocked buy';
}
