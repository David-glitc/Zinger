// @ts-nocheck
/**
 * Paginated Binance kline fetch with disk cache for long backtests.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { dataPath } from '../dataDir.js';

const BINANCE = 'https://api.binance.com';

export async function fetchKlinesPage(symbol, interval, startMs, limit = 1000) {
  const url = `${BINANCE}/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startMs}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Binance ${symbol} ${interval}: HTTP ${res.status}`);
  const data = await res.json();
  return (data || []).map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

export function cacheFile(symbol, interval) {
  return dataPath(`backtest/candles-${symbol}-${interval}.json`);
}

export function loadCachedCandles(symbol, interval) {
  const fp = cacheFile(symbol, interval);
  if (!existsSync(fp)) return null;
  try {
    const raw = JSON.parse(readFileSync(fp, 'utf8'));
    return raw.candles || raw;
  } catch {
    return null;
  }
}

export function saveCachedCandles(symbol, interval, candles, meta = {}) {
  const fp = cacheFile(symbol, interval);
  mkdirSync(path.dirname(fp), { recursive: true });
  writeFileSync(fp, JSON.stringify({
    symbol,
    interval,
    fetchedAt: new Date().toISOString(),
    count: candles.length,
    ...meta,
    candles,
  }));
}

/**
 * Fetch `days` of candles, paginating Binance's 1000-bar limit.
 */
export async function fetchHistoricalCandles(symbol, interval, days = 180, { useCache = true } = {}) {
  if (useCache) {
    const cached = loadCachedCandles(symbol, interval);
    const minBars = Math.floor(days * 24 * 60 / (interval === '1m' ? 1 : interval === '5m' ? 5 : 60));
    if (cached?.length >= minBars * 0.9) {
      return cached;
    }
  }

  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;
  const all = [];
  let cursor = startMs;

  while (cursor < endMs) {
    const page = await fetchKlinesPage(symbol, interval, cursor, 1000);
    if (!page.length) break;
    all.push(...page);
    const lastMs = page[page.length - 1].time * 1000;
    cursor = lastMs + 1;
    if (page.length < 1000) break;
    await new Promise((r) => setTimeout(r, 120));
  }

  const byTime = new Map();
  for (const c of all) byTime.set(c.time, c);
  const candles = [...byTime.values()].sort((a, b) => a.time - b.time);

  saveCachedCandles(symbol, interval, candles, {
    start: candles[0]?.time,
    end: candles[candles.length - 1]?.time,
    days,
  });
  return candles;
}

export function candlesUpTo(candles, tSec) {
  return candles.filter((c) => c.time <= tSec);
}

/** O(log n) index of last candle with time <= tSec */
export function candleIndexAt(candles, tSec) {
  if (!candles?.length) return -1;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (candles[mid].time <= tSec) lo = mid;
    else hi = mid - 1;
  }
  return candles[lo].time <= tSec ? lo : -1;
}

export function candlesBetween(candles, t0Sec, t1Sec) {
  return candles.filter((c) => c.time > t0Sec && c.time <= t1Sec);
}
