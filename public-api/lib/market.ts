// @ts-nocheck
/** Public market helpers — Binance depth + 5m window clock. No secrets. */

const BINANCE = 'https://api.binance.com';

export async function fetchOrderBook(symbol = 'BTCUSDT', limit = 20) {
  const url = `${BINANCE}/api/v3/depth?symbol=${symbol}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const d = await res.json();
  const bids = (d.bids || []).map(([p, q]) => ({ price: Number(p), qty: Number(q) }));
  const asks = (d.asks || []).map(([p, q]) => ({ price: Number(p), qty: Number(q) }));
  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
  return {
    symbol,
    bids,
    asks,
    bestBid,
    bestAsk,
    mid,
    spread,
    spreadBps: mid > 0 ? Math.round((spread / mid) * 1000000) / 100 : 0,
    timestamp: Date.now(),
  };
}

/** Polymarket-style 5m wall-clock window (epoch-aligned). */
export function currentWindow(windowSec = 300) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - (now % windowSec);
  const end = start + windowSec;
  return {
    windowSec,
    start,
    end,
    remaining: end - now,
    progress: Math.round(((now - start) / windowSec) * 1000) / 1000,
    slugHint: `*-updown-5m-${start}`,
  };
}

/** Build TP/SL levels from confidence for a binary entry price. */
export function buildLevels({ entry = 0.5, confidence = 0.5, tpLow = 0.08, tpHigh = 0.16, slPct = 0.12 } = {}) {
  const conf = Math.max(0, Math.min(0.65, Number(confidence) || 0));
  const tpPct = tpLow + conf * (tpHigh - tpLow);
  const entryPx = Number(entry) || 0.5;
  return {
    entry: entryPx,
    tpPct: Math.round(tpPct * 1000) / 10,
    slPct: Math.round(slPct * 1000) / 10,
    tpPrice: Math.round(Math.min(0.99, entryPx * (1 + tpPct)) * 10000) / 10000,
    slPrice: Math.round(Math.max(0.01, entryPx * (1 - slPct)) * 10000) / 10000,
    partialTpPrice: Math.round(Math.min(0.99, entryPx * (1 + tpPct * 0.5)) * 10000) / 10000,
    partialPct: 55,
  };
}

/** Depth cumulative for charting. */
export function depthCumulative(book) {
  if (!book) return null;
  let bidCum = 0;
  let askCum = 0;
  return {
    bids: book.bids.map((l) => {
      bidCum += l.qty;
      return { ...l, cumulative: bidCum };
    }),
    asks: book.asks.map((l) => {
      askCum += l.qty;
      return { ...l, cumulative: askCum };
    }),
  };
}
