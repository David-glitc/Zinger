// @ts-nocheck
/**
 * Polymarket CLOB market WebSocket — live UP/DOWN book + mid stream.
 * Direct egress only (no order-write proxy) — saves paid-proxy bandwidth.
 *
 * Endpoint: wss://ws-subscriptions-clob.polymarket.com/ws/market
 * Subscribe: { type: "market", assets_ids: [tokenId, ...] }
 */
import WebSocket from 'ws';

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const MAX_BOOK_AGE_MS = 15_000;
const RECONNECT_MS = 2500;
const PING_MS = 20_000;

/** @type {Map<string, { bestBid:number|null, bestAsk:number|null, mid:number|null, lastTrade:number|null, ts:number, source:string }>} */
const books = new Map();
const listeners = new Set();
/** @type {Set<string>} */
let desired = new Set();
let ws = null;
let running = false;
let reconnectTimer = null;
let pingTimer = null;
let lastMsgAt = 0;
let connectCount = 0;
let msgCount = 0;

function emit(tokenId, snap) {
  noteArbHotToken(tokenId);
  for (const fn of listeners) {
    try { fn(tokenId, snap); } catch {}
  }
}

/** Tokens whose books moved recently — scan prioritizes their markets for arb. */
const arbHotTokens = new Map();
const ARB_HOT_TTL_MS = 4_000;

function noteArbHotToken(tokenId) {
  if (!tokenId) return;
  arbHotTokens.set(String(tokenId), Date.now());
}

/** Drop stale hot marks. */
function pruneArbHotTokens() {
  const now = Date.now();
  for (const [id, at] of arbHotTokens) {
    if (now - at > ARB_HOT_TTL_MS) arbHotTokens.delete(id);
  }
}

/**
 * Peek without consuming — used to prioritize markets in the scan sort.
 */
export function peekArbHuntForMarket(market, { minGap = 0.005 } = {}) {
  pruneArbHotTokens();
  const upId = market?.tokenIds?.up ? String(market.tokenIds.up) : null;
  const downId = market?.tokenIds?.down ? String(market.tokenIds.down) : null;
  if (!upId && !downId) return null;

  const upHot = upId && arbHotTokens.has(upId);
  const downHot = downId && arbHotTokens.has(downId);
  if (!upHot && !downHot) return null;

  const upBook = upId ? getClobWsBook(upId) : null;
  const downBook = downId ? getClobWsBook(downId) : null;
  const upAsk = Number(upBook?.bestAsk || 0);
  const downAsk = Number(downBook?.bestAsk || 0);
  if (!(upAsk > 0 && downAsk > 0)) return null;
  const gap = 1 - upAsk - downAsk;
  if (!(gap >= Number(minGap))) return null;
  return { gap, upAsk, downAsk, at: Date.now() };
}

/**
 * True when this market's book just moved and touch gap clears a fee-ish floor.
 * Consumes the hot marks so the same flicker is not re-prioritized forever.
 */
export function takeArbHuntForMarket(market, { minGap = 0.005 } = {}) {
  const peek = peekArbHuntForMarket(market, { minGap });
  if (!peek) return null;
  const upId = market?.tokenIds?.up ? String(market.tokenIds.up) : null;
  const downId = market?.tokenIds?.down ? String(market.tokenIds.down) : null;
  if (upId) arbHotTokens.delete(upId);
  if (downId) arbHotTokens.delete(downId);
  return peek;
}

export function arbHuntPendingCount() {
  pruneArbHotTokens();
  return arbHotTokens.size;
}

function usablePx(px) {
  const n = Number(px);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : null;
}

/**
 * Full price→size ladders per token, kept alongside `books`.
 *
 * This layer used to retain only the best bid and ask price and throw every
 * size away. That made `imbalance` and `spreadPct` impossible to compute on the
 * WebSocket path, so `getDepthForMarket` returned a snapshot without them —
 * and since the WS feed is healthy most of the time, the order-book bias block
 * in `buildDecision` and the `ORDER_FLOW` component of alphaFusion (weight
 * 0.2–0.3 of the blend) both silently went dark almost always. They only came
 * back when the socket was down and the REST fallback ran.
 *
 * Maintaining the real L2 book is the only way to answer "how much size is
 * resting on each side", which is what both of those consumers actually need.
 *
 * @type {Map<string, { bid: Map<number, number>, ask: Map<number, number> }>}
 */
const ladders = new Map();

const BOOK_LEVELS = 10;

function ladderFor(assetId) {
  let l = ladders.get(assetId);
  if (!l) {
    l = { bid: new Map(), ask: new Map() };
    ladders.set(assetId, l);
  }
  return l;
}

/**
 * Collapse the ladders into the same shape `normalizeLevels` produces for the
 * REST path, so both sources are interchangeable to every consumer.
 *
 * Totals are taken over the top `BOOK_LEVELS` rather than the whole book to
 * match the REST implementation — imbalance measured across the full ladder is
 * a different statistic, and mixing the two per source would be worse than
 * either.
 */
function deriveSnap(assetId, prev, ts) {
  const { bid, ask } = ladderFor(assetId);

  const toLevels = (map, dir) => [...map.entries()]
    .map(([price, size]) => ({ price, size }))
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size) && l.size > 0)
    .sort((a, b) => (dir === 'bid' ? b.price - a.price : a.price - b.price))
    .slice(0, BOOK_LEVELS)
    .map((l) => ({ ...l, value: l.price * l.size }));

  const bids = toLevels(bid, 'bid');
  const asks = toLevels(ask, 'ask');

  let cumBid = 0;
  for (const b of bids) { cumBid += b.size; b.cum = cumBid; }
  let cumAsk = 0;
  for (const a of asks) { cumAsk += a.size; a.cum = cumAsk; }

  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
  const rawMid = bestBid != null && bestAsk != null
    ? (bestBid + bestAsk) / 2
    : (bestBid ?? bestAsk ?? prev.mid ?? null);
  const spreadPct = rawMid > 0 && spread != null ? (spread / rawMid) * 100 : null;

  const totalBidVol = bids.reduce((s, b) => s + b.value, 0);
  const totalAskVol = asks.reduce((s, a) => s + a.value, 0);
  const imbalance = totalBidVol + totalAskVol > 0
    ? (totalBidVol - totalAskVol) / (totalBidVol + totalAskVol)
    : 0;

  return {
    bestBid,
    bestAsk,
    mid: usablePx(rawMid) ?? usablePx(prev.mid) ?? usablePx(prev.lastTrade),
    lastTrade: prev.lastTrade ?? null,
    bids,
    asks,
    spread: spread ?? 0,
    spreadPct: spreadPct ?? 0,
    totalBidVol,
    totalAskVol,
    imbalance,
    bidCount: bids.length,
    askCount: asks.length,
    ts: Number(ts) || Date.now(),
    source: 'clob-ws',
  };
}

function commit(assetId, ts) {
  const prev = books.get(assetId) || {};
  const snap = deriveSnap(assetId, prev, ts);
  books.set(assetId, snap);
  emit(assetId, snap);
}

function upsertFromBook(assetId, bids, asks, ts) {
  if (!assetId) return;
  const id = String(assetId);

  // A `book` message is a full snapshot, so the ladder is replaced wholesale
  // rather than merged — a stale level that vanished server-side must not
  // survive here.
  const l = ladderFor(id);
  l.bid.clear();
  l.ask.clear();

  const load = (rows, target) => {
    for (const r of rows || []) {
      const price = parseFloat(r.price ?? r[0]);
      const size = parseFloat(r.size ?? r[1]);
      if (!Number.isFinite(price) || price <= 0) continue;
      if (!Number.isFinite(size) || size <= 0) continue;
      target.set(price, size);
    }
  };
  load(bids, l.bid);
  load(asks, l.ask);

  commit(id, ts);
}

function applyPriceChange(change, ts) {
  const assetId = String(change.asset_id || change.assetId || '');
  if (!assetId) return;
  const price = parseFloat(change.price);
  const size = parseFloat(change.size);
  const side = String(change.side || '').toUpperCase();
  if (!Number.isFinite(price) || price <= 0) return;

  const l = ladderFor(assetId);
  const target = (side === 'BUY' || side === 'BID') ? l.bid
    : (side === 'SELL' || side === 'ASK') ? l.ask
      : null;
  if (!target) return;

  // size 0 = level removed.
  if (!Number.isFinite(size) || size <= 0) target.delete(price);
  else target.set(price, size);

  commit(assetId, ts);
}

/**
 * Feed one raw socket frame through the book state machine.
 *
 * Exported so the ladder can be driven from tests and from a recorded frame
 * replay without opening a socket. The live socket handler is the only other
 * caller.
 */
export function ingestClobMessage(raw) {
  handleMessage(raw);
}

function handleMessage(raw) {
  lastMsgAt = Date.now();
  msgCount += 1;
  let data;
  try { data = JSON.parse(raw.toString()); } catch { return; }

  // Initial snapshot can be an array of books
  if (Array.isArray(data)) {
    for (const item of data) {
      const assetId = item.asset_id || item.assetId || item.payload?.tokenId;
      upsertFromBook(assetId, item.bids || item.payload?.bids, item.asks || item.payload?.asks, item.timestamp || item.payload?.timestamp);
    }
    return;
  }

  const type = data.event_type || data.type || data.payload?.type;
  if (type === 'book' || data.bids || data.asks) {
    const assetId = data.asset_id || data.assetId || data.payload?.tokenId;
    upsertFromBook(
      assetId,
      data.bids || data.payload?.bids,
      data.asks || data.payload?.asks,
      data.timestamp || data.payload?.timestamp,
    );
    return;
  }

  if (type === 'price_change' || data.price_changes) {
    const changes = data.price_changes || data.payload?.price_changes || [];
    const ts = data.timestamp || data.payload?.timestamp;
    for (const c of changes) applyPriceChange(c, ts);
    return;
  }

  if (type === 'last_trade_price' || data.last_trade_price != null || data.payload?.lastTradePrice != null) {
    const assetId = String(data.asset_id || data.assetId || data.payload?.tokenId || '');
    const px = parseFloat(data.last_trade_price ?? data.price ?? data.payload?.lastTradePrice);
    if (!assetId || !Number.isFinite(px)) return;
    const prev = books.get(assetId) || {};
    const snap = {
      ...prev,
      lastTrade: px,
      mid: prev.mid ?? px,
      ts: Number(data.timestamp || data.payload?.timestamp) || Date.now(),
      source: 'clob-ws',
    };
    books.set(assetId, snap);
    emit(assetId, snap);
  }
}

function sendSubscribe(ids) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !ids.length) return;
  ws.send(JSON.stringify({ type: 'market', assets_ids: ids }));
}

function connect() {
  if (!running) return;
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }
  connectCount += 1;
  ws = new WebSocket(WS_URL);
  ws.on('open', () => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    sendSubscribe([...desired]);
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        try { ws.ping(); } catch {}
      }
    }, PING_MS);
  });
  ws.on('message', handleMessage);
  ws.on('close', () => {
    ws = null;
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (!running) return;
    reconnectTimer = setTimeout(connect, RECONNECT_MS);
  });
  ws.on('error', () => {
    try { ws?.close(); } catch {}
  });
}

export function onClobBook(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startClobMarketStream(tokenIds = []) {
  running = true;
  if (tokenIds?.length) setClobMarketTokens(tokenIds);
  if (!ws || ws.readyState !== WebSocket.OPEN) connect();
}

export function stopClobMarketStream() {
  running = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (ws) { try { ws.close(); } catch {} ws = null; }
}

/** Replace subscribed token set (BTC/ETH up+down current + next). */
export function setClobMarketTokens(tokenIds = []) {
  const next = new Set(
    (tokenIds || []).map((id) => String(id)).filter(Boolean),
  );
  const same = next.size === desired.size && [...next].every((id) => desired.has(id));
  desired = next;
  if (!running) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connect();
    return;
  }
  if (!same) sendSubscribe([...desired]);
}

export function getClobWsMid(tokenId) {
  const snap = books.get(String(tokenId));
  if (!snap) return null;
  if (Date.now() - snap.ts > MAX_BOOK_AGE_MS) return null;
  return Number.isFinite(snap.mid) ? snap.mid : null;
}

export function getClobWsBook(tokenId) {
  const snap = books.get(String(tokenId));
  if (!snap) return null;
  if (Date.now() - snap.ts > MAX_BOOK_AGE_MS) return { ...snap, stale: true };
  return { ...snap, stale: false };
}

export function getClobWsSnapshot() {
  const out = {};
  for (const [id, snap] of books.entries()) {
    out[id] = {
      ...snap,
      ageMs: Math.max(0, Date.now() - snap.ts),
      stale: Date.now() - snap.ts > MAX_BOOK_AGE_MS,
    };
  }
  return {
    connected: !!(ws && ws.readyState === WebSocket.OPEN),
    running,
    subscribed: desired.size,
    books: Object.keys(out).length,
    msgCount,
    connectCount,
    lastMsgAt,
    lastMsgAgeMs: lastMsgAt ? Date.now() - lastMsgAt : null,
    tokens: out,
  };
}
