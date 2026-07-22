const BINANCE = 'https://api.binance.com';

export async function fetchCandles(symbol = 'BTCUSDT', interval = '1m', limit = 200) {
  const url = `${BINANCE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = await res.json();
  return data.map(k => ({
    time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
    low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
  }));
}

function ema(prices, period) {
  const k = 2 / (period + 1);
  let v = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
  for (let i = period; i < prices.length; i++) v = prices[i] * k + v * (1 - k);
  return v;
}

function sma(prices, period) {
  return prices.slice(-period).reduce((s, p) => s + p, 0) / period;
}

function rsi(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  const ag = g / period, al = l / period;
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function macd(prices) {
  const f = ema(prices, 12), s = ema(prices, 26);
  const m = f - s, sig = ema([...prices.slice(-9), m], 9);
  return { macd: m, signal: sig, hist: m - sig };
}

function bollinger(prices, period = 20) {
  const sl = prices.slice(-period);
  const m = sl.reduce((s, p) => s + p, 0) / period;
  const std = Math.sqrt(sl.reduce((s, p) => s + (p - m) ** 2, 0) / period);
  return { upper: m + 2 * std, mid: m, lower: m - 2 * std, width: (m + 2 * std - (m - 2 * std)) / m * 100 };
}

function adx(candles, period = 14) {
  if (candles.length < period + 2) return 25;
  const tr = [], plus = [], minus = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
  }
  const atr = tr.slice(-period).reduce((s, v) => s + v, 0) / period;
  const avgPlus = plus.slice(-period).reduce((s, v) => s + v, 0) / period;
  const avgMinus = minus.slice(-period).reduce((s, v) => s + v, 0) / period;
  const pDI = 100 * avgPlus / atr, nDI = 100 * avgMinus / atr;
  const dx = Math.abs(pDI - nDI) / (pDI + nDI) * 100;
  return { adx: dx, pDI, nDI, trend: dx > 25 ? (pDI > nDI ? 'up' : 'down') : 'range' };
}

function volumeProfile(candles, bins = 10) {
  const recent = candles.slice(-20);
  const low = Math.min(...recent.map(c => c.low));
  const high = Math.max(...recent.map(c => c.high));
  const binSize = (high - low) / bins;
  const profile = Array(bins).fill(0);
  for (const c of recent) {
    const idx = Math.min(Math.floor((c.close - low) / binSize), bins - 1);
    profile[idx] += c.volume;
  }
  const maxIdx = profile.indexOf(Math.max(...profile));
  return { poc: low + binSize * (maxIdx + 0.5), pocIdx: maxIdx, valueHigh: low + binSize * bins };
}

export function analyze(candles) {
  if (!candles || candles.length < 50) return null;

  const c = candles.map(x => x.close);
  const cur = c[c.length - 1];
  const prev = c[c.length - 2];
  const o5 = candles[candles.length - 5]?.close || cur;
  const o15 = candles[candles.length - 15]?.close || cur;

  // Multi-timeframe momentum
  const mom = { m1: (cur - prev) / prev * 100, m5: (cur - o5) / o5 * 100, m15: c.length >= 15 ? (cur - c[c.length - 15]) / c[c.length - 15] * 100 : 0 };

  // Volatility
  const ranges = candles.slice(-10).map(x => x.high - x.low);
  const atr = ranges.reduce((s, r) => s + r, 0) / ranges.length;
  const atrPct = atr / cur * 100;

  // RSI
  const rsiVal = rsi(c, 14);

  // MACD
  const macdData = macd(c);

  // Bollinger
  const bb = bollinger(c);
  const bbPos = (cur - bb.lower) / (bb.upper - bb.lower);

  // ADX trend strength
  const adxData = adx(candles);

  // Volume
  const v3 = candles.slice(-3).reduce((s, x) => s + x.volume, 0) / 3;
  const v6 = candles.slice(-6, -3).reduce((s, x) => s + x.volume, 0) / 3;
  const volRatio = v6 > 0 ? v3 / v6 : 1;

  // Volume Profile
  const vp = volumeProfile(candles);

  // EMAs
  const ema9 = ema(c, 9), ema21 = ema(c, 21), ema50 = ema(c, 50);
  const emaBull = ema9 > ema21;

  // Divergence check
  const priceHigher = cur > c[c.length - 5];
  const rsiHigher = rsiVal > rsi(c.slice(0, -4), 14);
  const bearDiv = priceHigher && !rsiHigher;
  const bullDiv = !priceHigher && rsiHigher;

  // Machine scoring
  let score = 0;
  const signals = [];

  // Regime filter
  const trending = adxData.trend !== 'range';

  // RSI extremes
  if (rsiVal < 25) { score += 3; signals.push('RSI_OVERSOLD'); }
  else if (rsiVal < 40) { score += 1.5; signals.push('rsi_low'); }
  else if (rsiVal > 75) { score -= 3; signals.push('RSI_OVERBOUGHT'); }
  else if (rsiVal > 60) { score -= 1.5; signals.push('rsi_high'); }

  // Momentum confluence
  if (mom.m1 > 0.08 && mom.m5 > 0.15) { score += 1.5; signals.push('mom_confluence_up'); }
  else if (mom.m1 < -0.08 && mom.m5 < -0.15) { score -= 1.5; signals.push('mom_confluence_down'); }
  else if (mom.m1 > 0.03) { score += 0.5; signals.push('mom1_up'); }
  else if (mom.m1 < -0.03) { score -= 0.5; signals.push('mom1_down'); }

  // MACD strength
  if (macdData.hist > 0 && macdData.macd > 0) { score += 1.5; signals.push('macd_bull_strong'); }
  else if (macdData.hist > 0) { score += 0.5; signals.push('macd_bull'); }
  else if (macdData.hist < 0 && macdData.macd < 0) { score -= 1.5; signals.push('macd_bear_strong'); }
  else if (macdData.hist < 0) { score -= 0.5; signals.push('macd_bear'); }

  // Bollinger squeeze + position
  if (bbPos < 0.15) { score += 2; signals.push('bb_lower_band'); }
  else if (bbPos < 0.3) { score += 1; signals.push('bb_low'); }
  else if (bbPos > 0.85) { score -= 2; signals.push('bb_upper_band'); }
  else if (bbPos > 0.7) { score -= 1; signals.push('bb_high'); }
  if (bb.width < 3) signals.push('BB_SQUEEZE');

  // ADX trend
  if (adxData.trend === 'up') { score += 1; signals.push('adx_up'); }
  else if (adxData.trend === 'down') { score -= 1; signals.push('adx_down'); }
  if (adxData.adx > 30) signals.push('strong_trend');

  // EMA alignment
  if (cur > ema9 && ema9 > ema21) { score += 1; signals.push('ema_bull'); }
  else if (cur < ema9 && ema9 < ema21) { score -= 1; signals.push('ema_bear'); }

  // Volume confirmation
  if (volRatio > 1.5 && mom.m1 > 0) { score += 1; signals.push('vol_surge_up'); }
  else if (volRatio > 1.5 && mom.m1 < 0) { score -= 1; signals.push('vol_surge_down'); }

  // Divergence
  if (bearDiv) { score -= 1.5; signals.push('BEAR_DIV'); }
  if (bullDiv) { score += 1.5; signals.push('BULL_DIV'); }

  // Price vs volume profile
  if (cur < vp.poc * 0.98) { score += 0.5; signals.push('below_poc'); }
  else if (cur > vp.poc * 1.02) { score -= 0.5; signals.push('above_poc'); }

  // Volatility filter
  const skipTrade = atrPct > 0.5;

  // Direction
  const direction = score > 1 ? 'up' : score < -1 ? 'down' : 'neutral';
  const confidence = Math.min(Math.abs(score) / 10, 1);

  // Kelly-friendly: expected edge
  const edge = score / 10; // normalized edge estimate

  return {
    score: Math.round(score * 10) / 10,
    direction,
    confidence: Math.round(confidence * 100) / 100,
    edge: Math.round(edge * 100) / 100,
    rsi: Math.round(rsiVal * 10) / 10,
    macd: macdData,
    bb,
    adx: adxData,
    momentum: mom,
    volatility: { atr: Math.round(atr * 100) / 100, atrPct: Math.round(atrPct * 100) / 100 },
    volume: { ratio: Math.round(volRatio * 10) / 10 },
    ema: { ema9: Math.round(ema9 * 10) / 10, ema21, emaBull },
    skipTrade,
    signals,
    price: cur,
    timestamp: Date.now(),
  };
}

export async function getSignal(asset = 'BTC') {
  const symbol = asset === 'BTC' ? 'BTCUSDT' : 'ETHUSDT';
  const candles = await fetchCandles(symbol);
  if (!candles) return null;
  return analyze(candles);
}

export async function getSignalForBoth() {
  const [btc, eth] = await Promise.all([getSignal('BTC'), getSignal('ETH')]);
  return { btc, eth };
}

export async function fetchPriceHistory(symbol = 'BTCUSDT', interval = '5m', limit = 100) {
  return fetchCandles(symbol, interval, limit);
}
