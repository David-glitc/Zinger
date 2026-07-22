import { POLY } from './config.js';

export async function getOrderBook(tokenId) {
  const url = `${POLY.clobApi}/book?token_id=${tokenId}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  return res.json();
}

export async function getPrice(tokenId) {
  const url = `${POLY.clobApi}/price?token_id=${tokenId}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  return res.json();
}

export async function getMidPrice(tokenId) {
  const book = await getOrderBook(tokenId);
  if (!book) return null;
  const bids = book.bids || [];
  const asks = book.asks || [];
  const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
  const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 0;
  if (bestBid === 0 && bestAsk === 0) return null;
  if (bestBid === 0) return bestAsk;
  if (bestAsk === 0) return bestBid;
  return (bestBid + bestAsk) / 2;
}

export async function getPricesForMarket(market) {
  const prices = { ...(market.gammaPrices || {}) };

  for (const [outcome, tokenId] of Object.entries(market.tokenIds || {})) {
    if (!tokenId) continue;
    try {
      const mid = await getMidPrice(tokenId);
      if (mid != null && Number.isFinite(mid)) prices[outcome] = mid;
    } catch {
      // keep gamma fallback
    }
  }

  return prices;
}

export async function getTrades(tokenId, limit = 20) {
  const url = `${POLY.clobApi}/trades?token_id=${tokenId}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];
  return res.json();
}

export async function getTokenPrices(tokenId) {
  const url = `${POLY.clobApi}/price?token_id=${tokenId}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  return res.json();
}

export async function getOrderBookDepth(tokenId, levels = 10) {
  const book = await getOrderBook(tokenId);
  if (!book) return null;
  const bids = (book.bids || []).slice(0, levels).map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size), value: parseFloat(b.price) * parseFloat(b.size) }));
  const asks = (book.asks || []).slice(0, levels).map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size), value: parseFloat(a.price) * parseFloat(a.size) }));
  let cumBid = 0, cumAsk = 0;
  for (const b of bids) { cumBid += b.size; b.cum = cumBid; }
  for (const a of asks) { cumAsk += a.size; a.cum = cumAsk; }
  const bestBid = bids[0]?.price || 0;
  const bestAsk = asks[0]?.price || 0;
  const spread = bestAsk - bestBid;
  const spreadPct = bestBid > 0 ? (spread / bestBid) * 100 : 0;
  const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : (bestBid || bestAsk);
  const totalBidVol = bids.reduce((s, b) => s + b.value, 0);
  const totalAskVol = asks.reduce((s, a) => s + a.value, 0);
  const imbalance = totalBidVol + totalAskVol > 0 ? (totalBidVol - totalAskVol) / (totalBidVol + totalAskVol) : 0;
  return {
    bids, asks, bestBid, bestAsk, spread, spreadPct, mid,
    totalBidVol, totalAskVol, imbalance,
    bidCount: bids.length, askCount: asks.length,
  };
}

export async function getDepthForMarket(market) {
  const depth = {};
  for (const [outcome, tokenId] of Object.entries(market.tokenIds || {})) {
    if (!tokenId) continue;
    try {
      const d = await getOrderBookDepth(tokenId);
      if (d) depth[outcome] = d;
    } catch {}
  }
  return depth;
}
