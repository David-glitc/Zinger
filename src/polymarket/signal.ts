// @ts-nocheck
const BINANCE = 'https://api.binance.com';
const BINANCE_FUTURES = 'https://fapi.binance.com';

import { applyAlphaFusion } from './alphaFusion.js';
import { clampConfidence, CONF_FLOOR } from './confidenceScale.js';
import { loadRegimeSignal } from './regimeSignal.js';

/**
 * Pull jump-model regime + idio-vol context from the shared store (see
 * `regimeSignal.ts`, the single owner of that reading) so the alpha fusion can
 * de-risk during high-vol regimes. Called by the bot each scan.
 * Falls back silently — fusion still works with base TA alone.
 */
export async function loadFusionContext() {
  try {
    const raw = loadRegimeSignal();
    if (raw) {
      const regime = raw.regime === 'high-vol' ? 'highvol'
        : raw.regime === 'trend' ? 'trend' : 'chop';
      const btc = { regime, regimeSignal: { highVol: raw.highVol, realizedVol: raw.realizedVol, calmBaseline: raw.calmBaseline } };
      const eth = { ...btc };
      globalThis.__zingerFusionCtx = { btc, eth };
      return { btc, eth };
    }
  } catch {}
  return null;
}

export function refreshFusionContext(partialCtx) {
  if (!partialCtx || typeof partialCtx !== 'object') return;
  const prev = globalThis.__zingerFusionCtx || {};
  globalThis.__zingerFusionCtx = {
    btc: { ...(prev.btc || {}), ...(partialCtx.btc || {}) },
    eth: { ...(prev.eth || {}), ...(partialCtx.eth || {}) },
  };
}

export async function fetchCandles(symbol = 'BTCUSDT', interval = '1m', limit = 200) {
  const url = `${BINANCE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = await res.json();
  return data.map(k => ({
    time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
    low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
    takerBuyBase: parseFloat(k[9] || 0),
  }));
}

/** Perp funding + mark premium — short-horizon risk sentiment */
export async function fetchFunding(symbol = 'BTCUSDT') {
  try {
    const url = `${BINANCE_FUTURES}/fapi/v1/premiumIndex?symbol=${symbol}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      fundingRate: Number(d.lastFundingRate || 0),
      markPrice: Number(d.markPrice || 0),
      indexPrice: Number(d.indexPrice || 0),
      premium: d.markPrice && d.indexPrice
        ? (Number(d.markPrice) - Number(d.indexPrice)) / Number(d.indexPrice)
        : 0,
    };
  } catch {
    return null;
  }
}

function ema(prices, period) {
  const k = 2 / (period + 1);
  let v = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
  for (let i = period; i < prices.length; i++) v = prices[i] * k + v * (1 - k);
  return v;
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

/**
 * EMA at every point rather than just the last one.
 *
 * `out[j]` is the EMA ending at price index `j + period - 1`, so the first
 * entry is the seed (mean of the first `period` prices) and the series is
 * `prices.length - period + 1` long.
 */
function emaSeries(prices, period) {
  if (!Array.isArray(prices) || prices.length < period || period < 1) return [];
  const k = 2 / (period + 1);
  let v = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
  const out = [v];
  for (let i = period; i < prices.length; i++) {
    v = prices[i] * k + v * (1 - k);
    out.push(v);
  }
  return out;
}

/**
 * MACD, with a signal line that is an EMA of the MACD *series*.
 *
 * The previous implementation was `ema([...prices.slice(-9), m], 9)` — an EMA
 * over nine raw closes with a single MACD value appended. Since `ema()` seeds
 * with the mean of the first `period` elements, the seed was the mean of nine
 * BTC closes (~110,000) and one iteration could not pull it anywhere near the
 * MACD's true scale (single digits). `hist` therefore came out at roughly minus
 * the asset price: measured `-62751` on live BTC candles.
 *
 * That fed `clamp11(m1 * 8 + m5 * 3 + macdH * 40)` in alphaFusion, which
 * saturated at -1 on every scan. Across 800 backtested bars the fused signal
 * printed 639 down, 161 neutral and 0 up — the bot could not express a bullish
 * TA view at all, and the ML overlay then flipped every one of those to "up"
 * because it always disagreed. All 15 recent trades were `up` at exactly 0.65
 * confidence as a direct result.
 *
 * A signal line has to be an average of the indicator, never of the input.
 */
function macd(prices) {
  const fast = emaSeries(prices, 12);
  const slow = emaSeries(prices, 26);
  if (!fast.length || !slow.length) return { macd: 0, signal: 0, hist: 0 };

  // Align on the later start: fast[j] ends at index j+11, slow[j] at j+25.
  const line = slow.map((slowV, j) => fast[j + 26 - 12] - slowV).filter(Number.isFinite);
  if (!line.length) return { macd: 0, signal: 0, hist: 0 };

  const m = line[line.length - 1];
  // Fewer than 9 MACD points is not enough for the standard signal line; fall
  // back to the mean of what exists rather than seeding from a wrong scale.
  const sig = line.length >= 9
    ? emaSeries(line, 9).pop()
    : line.reduce((s, v) => s + v, 0) / line.length;

  const hist = m - sig;
  const last = prices[prices.length - 1];

  // MACD is denominated in price, so a "normal" histogram is ~5 on BTC at
  // 110k and ~0.2 on ETH at 4k. Consumers that mix it with percentage momentum
  // need the scale-free form or BTC dominates the blend ~25x for no reason
  // other than costing more. `histPct` is the histogram as a percent of price.
  const histPct = Number.isFinite(last) && last !== 0 ? (hist / last) * 100 : 0;

  return { macd: m, signal: sig, hist, histPct };
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

export function analyze(candles, extras = {}) {
  if (!candles || candles.length < 50) return null;

  const c = candles.map(x => x.close);
  const cur = c[c.length - 1];
  const prev = c[c.length - 2];
  const o5 = candles[candles.length - 5]?.close || cur;

  const mom = {
    m1: (cur - prev) / prev * 100,
    m5: (cur - o5) / o5 * 100,
    m15: c.length >= 15 ? (cur - c[c.length - 15]) / c[c.length - 15] * 100 : 0,
  };

  const ranges = candles.slice(-10).map(x => x.high - x.low);
  const atr = ranges.reduce((s, r) => s + r, 0) / ranges.length;
  const atrPct = atr / cur * 100;

  const rsiVal = rsi(c, 14);
  const macdData = macd(c);
  const bb = bollinger(c);
  const bbPos = (cur - bb.lower) / (bb.upper - bb.lower);
  const adxData = adx(candles);

  const v3 = candles.slice(-3).reduce((s, x) => s + x.volume, 0) / 3;
  const v6 = candles.slice(-6, -3).reduce((s, x) => s + x.volume, 0) / 3;
  const volRatio = v6 > 0 ? v3 / v6 : 1;

  const recent5 = candles.slice(-5);
  const vol5 = recent5.reduce((s, x) => s + (x.volume || 0), 0);
  const takerBuy5 = recent5.reduce((s, x) => s + (x.takerBuyBase || 0), 0);
  const takerBuyRatio = vol5 > 0 ? takerBuy5 / vol5 : 0.5;

  const vp = volumeProfile(candles);
  const ema9 = ema(c, 9), ema21 = ema(c, 21);
  const emaBull = ema9 > ema21;

  const priceHigher = cur > c[c.length - 5];
  const rsiHigher = rsiVal > rsi(c.slice(0, -4), 14);
  const bearDiv = priceHigher && !rsiHigher;
  const bullDiv = !priceHigher && rsiHigher;

  let score = 0;
  const signals = [];
  const shortW = 2.0;

  if (rsiVal < 25) { score += 3; signals.push('RSI_OVERSOLD'); }
  else if (rsiVal < 40) { score += 1.5; signals.push('rsi_low'); }
  else if (rsiVal > 75) { score -= 3; signals.push('RSI_OVERBOUGHT'); }
  else if (rsiVal > 60) { score -= 1.5; signals.push('rsi_high'); }

  if (mom.m1 > 0.05) { score += 1.8 * shortW * 0.5; signals.push('mom1_up'); }
  else if (mom.m1 < -0.05) { score -= 1.8 * shortW * 0.5; signals.push('mom1_down'); }
  if (mom.m1 > 0.08 && mom.m5 > 0.12) { score += 2; signals.push('mom_confluence_up'); }
  else if (mom.m1 < -0.08 && mom.m5 < -0.12) { score -= 2; signals.push('mom_confluence_down'); }
  if (Math.abs(mom.m15) > 0.25) {
    score += Math.sign(mom.m15) * 0.25;
    signals.push(mom.m15 > 0 ? 'mom15_soft_up' : 'mom15_soft_down');
  }

  if (macdData.hist > 0 && macdData.macd > 0) { score += 0.75; signals.push('macd_bull_strong'); }
  else if (macdData.hist > 0) { score += 0.25; signals.push('macd_bull'); }
  else if (macdData.hist < 0 && macdData.macd < 0) { score -= 0.75; signals.push('macd_bear_strong'); }
  else if (macdData.hist < 0) { score -= 0.25; signals.push('macd_bear'); }

  if (bbPos < 0.15) { score += 2; signals.push('bb_lower_band'); }
  else if (bbPos < 0.3) { score += 1; signals.push('bb_low'); }
  else if (bbPos > 0.85) { score -= 2; signals.push('bb_upper_band'); }
  else if (bbPos > 0.7) { score -= 1; signals.push('bb_high'); }
  if (bb.width < 3) signals.push('BB_SQUEEZE');

  if (adxData.trend === 'up') { score += 0.4; signals.push('adx_up'); }
  else if (adxData.trend === 'down') { score -= 0.4; signals.push('adx_down'); }
  if (adxData.adx > 30) signals.push('strong_trend');

  if (cur > ema9 && ema9 > ema21) { score += 0.5; signals.push('ema_bull'); }
  else if (cur < ema9 && ema9 < ema21) { score -= 0.5; signals.push('ema_bear'); }

  if (volRatio > 1.5 && mom.m1 > 0) { score += 1.2; signals.push('vol_surge_up'); }
  else if (volRatio > 1.5 && mom.m1 < 0) { score -= 1.2; signals.push('vol_surge_down'); }

  if (takerBuyRatio >= 0.58) { score += 1.4; signals.push('taker_buy_dom'); }
  else if (takerBuyRatio <= 0.42) { score -= 1.4; signals.push('taker_sell_dom'); }

  if (bearDiv) { score -= 1.5; signals.push('BEAR_DIV'); }
  if (bullDiv) { score += 1.5; signals.push('BULL_DIV'); }

  if (cur < vp.poc * 0.98) { score += 0.5; signals.push('below_poc'); }
  else if (cur > vp.poc * 1.02) { score -= 0.5; signals.push('above_poc'); }

  const funding = extras?.funding || null;
  if (funding && Number.isFinite(funding.fundingRate)) {
    if (funding.fundingRate > 0.00015) { score -= 0.8; signals.push('funding_long_crowd'); }
    else if (funding.fundingRate < -0.00015) { score += 0.8; signals.push('funding_short_crowd'); }
    if (Math.abs(funding.premium || 0) > 0.0008) {
      score += funding.premium > 0 ? -0.5 : 0.5;
      signals.push(funding.premium > 0 ? 'mark_premium' : 'mark_discount');
    }
  }

  const lead = extras?.leadMom1;
  if (lead != null && Number.isFinite(lead) && Math.abs(lead) > 0.04) {
    score += Math.sign(lead) * 1.1;
    signals.push(lead > 0 ? 'btc_lead_up' : 'btc_lead_down');
  }

  const skipTrade = atrPct > 0.5;
  const direction = score > 2.5 ? 'up' : score < -2.5 ? 'down' : 'neutral';
  const absScore = Math.abs(score);
  const confidence = clampConfidence(Math.round((CONF_FLOOR + absScore * 0.055) * 100) / 100);
  const edge = Math.sign(score) * confidence;

  return {
    score: Math.round(score * 10) / 10,
    direction,
    confidence: Math.round(confidence * 100) / 100,
    edge: Math.round(edge * 100) / 100,
    rsi: Math.round(rsiVal * 10) / 10,
    macd: macdData,
    // `pos` is where price sits in the band, 0 at the lower and 1 at the upper.
    // It was computed here and used for scoring but never returned, so
    // alphaFusion's `analysis.bb?.pos` fell through to its `?? 0.5` default and
    // pinned the Bollinger vote to exactly 0 on every scan — one of the five
    // fused modalities was silently contributing nothing.
    bb: { ...bb, pos: Number.isFinite(bbPos) ? Math.round(bbPos * 1000) / 1000 : 0.5 },
    adx: adxData,
    momentum: mom,
    volatility: { atr: Math.round(atr * 100) / 100, atrPct: Math.round(atrPct * 100) / 100 },
    volume: { ratio: Math.round(volRatio * 10) / 10, takerBuyRatio: Math.round(takerBuyRatio * 100) / 100 },
    ema: { ema9: Math.round(ema9 * 10) / 10, ema21, emaBull },
    funding: funding ? {
      rate: Math.round(funding.fundingRate * 1e6) / 1e6,
      premium: Math.round((funding.premium || 0) * 1e6) / 1e6,
    } : null,
    skipTrade,
    tooVolatile: skipTrade,
    signals,
    shortTf: true,
    price: cur,
    timestamp: Date.now(),
  };
}

export async function getSignal(asset = 'BTC', extras = {}) {
  const symbol = asset === 'BTC' ? 'BTCUSDT' : 'ETHUSDT';
  const [candles, funding] = await Promise.all([
    fetchCandles(symbol),
    fetchFunding(symbol),
  ]);
  if (!candles) return null;
  const analysis = analyze(candles, { ...extras, funding });
  return applyAlphaFusion(analysis, extras.fusionCtx || {});
}

export async function getSignalForBoth() {
  const [btcCandles, ethCandles, btcFund, ethFund] = await Promise.all([
    fetchCandles('BTCUSDT'),
    fetchCandles('ETHUSDT'),
    fetchFunding('BTCUSDT'),
    fetchFunding('ETHUSDT'),
  ]);
  const btcCandlesRaw = btcCandles ? analyze(btcCandles, { funding: btcFund }) : null;
  const ethCandlesRaw = ethCandles
    ? analyze(ethCandles, {
      funding: ethFund,
      leadMom1: btcCandlesRaw?.momentum?.m1 ?? null,
    })
    : null;
  const fusionCtx = globalThis.__zingerFusionCtx || {};
  const btc = applyAlphaFusion(btcCandlesRaw, {
    ...(fusionCtx.btc || {}),
    isEth: false,
  });
  const eth = applyAlphaFusion(ethCandlesRaw, {
    ...(fusionCtx.eth || {}),
    leadMom1: btcCandlesRaw?.momentum?.m1 ?? null,
    isEth: true,
  });
  return { btc, eth };
}

export async function fetchPriceHistory(symbol = 'BTCUSDT', interval = '5m', limit = 100) {
  return fetchCandles(symbol, interval, limit);
}
