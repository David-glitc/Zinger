// @ts-nocheck
import { POLY, ASSETS, ALL_ASSETS, getCurrentSlug, getNextSlug, getPreviousSlug, assetsForDurations, durationFromSlug, windowSecondsForDuration } from './config.js';
import { isMarketWindowOpen, parseSlugWindow } from './windows.js';

/** Gamma blocks bare fetch (403) — always send a UA. */
const GAMMA_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Zinger/1.1 (+https://zinger.kierkegaard.space)',
};

async function gammaFetch(url, { timeoutMs = 8000, ...opts } = {}) {
  return fetch(url, {
    ...opts,
    headers: { ...GAMMA_HEADERS, ...(opts.headers || {}) },
    signal: opts.signal || AbortSignal.timeout(timeoutMs),
  });
}

/** Recompute isCurrent/isNext from UTC epoch slug — timezone-independent. */
export function rehydrateMarketWindows(markets, nowMs = Date.now()) {
  if (!Array.isArray(markets)) return [];
  return markets.map((market) => {
    const open = isMarketWindowOpen(market, nowMs);
    const parsed = parseSlugWindow(market?.slug);
    const nowSec = Math.floor(nowMs / 1000);
    const isNext = parsed ? nowSec < parsed.startSec : false;
    return {
      ...market,
      isCurrent: open,
      isNext: isNext && !open,
    };
  });
}

/** Gamma discovery is expensive — cache between 250ms scan ticks. */
const DISCOVERY_CACHE_MS = 5000;
let discoveryCache = null;
let lastDiscoveryWallBucket = null;

function wallBucketSec(windowSec = 300, nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);
  return Math.floor(nowSec / windowSec) * windowSec;
}

function resolveScanAssets(opts = true) {
  if (opts === false) return ASSETS;
  if (Array.isArray(opts)) return assetsForDurations(opts);
  if (opts && typeof opts === 'object') {
    if (Array.isArray(opts.durations)) return assetsForDurations(opts.durations);
    if (opts.include15m === false) return ASSETS;
    return ALL_ASSETS;
  }
  return ALL_ASSETS;
}

/** Force-fetch wall-clock current slugs when discovery only returned NEXT windows. */
async function ensureCurrentWindowMarkets(markets, scanAssets, diagnostics) {
  const merged = [...markets];
  for (const asset of scanAssets) {
    const windowSec = asset.windowSeconds || 300;
    const slug = getCurrentSlug(asset.slugPrefix, windowSec);
    const open = merged.find((m) => m.slug === slug && isMarketWindowOpen(m));
    if (open) continue;

    const { raw, error } = await fetchMarketForSlug(slug, { retries: 3 });
    if (!raw) {
      diagnostics.push({
        symbol: asset.symbol,
        slug,
        missing: true,
        error: error?.message || 'current window fetch failed',
      });
      continue;
    }

    const normalized = normalizeMarket(raw, asset.symbol, slug, asset);
    if (!normalized) {
      diagnostics.push({
        symbol: asset.symbol,
        slug,
        missing: true,
        error: 'unparseable current window',
      });
      continue;
    }

    const idx = merged.findIndex((m) => m.slug === slug);
    if (idx >= 0) merged[idx] = normalized;
    else merged.push(normalized);
  }
  return merged;
}

/** Markets whose wall-clock window is open (UTC epoch slugs — same globally). */
export function selectTradableMarkets(markets, cfg = {}) {
  if (!Array.isArray(markets)) return [];
  const hydrated = rehydrateMarketWindows(markets);
  if (cfg.tradeCurrentWindowOnly === false) return hydrated;
  return hydrated.filter((market) => isMarketWindowOpen(market));
}

function parseMaybeJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); }
    catch { return fallback; }
  }
  return value;
}

function toUnixSeconds(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) return null;
  return Math.floor(parsed / 1000);
}

function resolveAssetMeta(symbol, slug, assetHint = null) {
  if (assetHint?.slugPrefix && assetHint?.windowSeconds) return assetHint;
  const fromSlug = durationFromSlug(slug);
  if (fromSlug) {
    const hit = ALL_ASSETS.find(
      (a) => a.symbol === symbol && a.duration === fromSlug,
    );
    if (hit) return hit;
  }
  return ALL_ASSETS.find((a) => a.symbol === symbol && a.duration === '5m')
    || ASSETS.find((a) => a.symbol === symbol)
    || null;
}

function normalizeMarket(raw, symbol, slug, assetHint = null) {
  if (!raw) return null;

  const assetObj = resolveAssetMeta(symbol, slug, assetHint);
  const outcomes = parseMaybeJson(raw.outcomes, ['Up', 'Down']);
  const clobTokenIds = parseMaybeJson(raw.clobTokenIds, []);
  const outcomePrices = parseMaybeJson(raw.outcomePrices, []);

  if (!Array.isArray(outcomes) || outcomes.length === 0) return null;

  const tokenIds = {};
  const prices = {};
  for (let i = 0; i < outcomes.length; i++) {
    const label = String(outcomes[i] || '').toLowerCase();
    if (!label) continue;
    if (clobTokenIds[i]) tokenIds[label] = String(clobTokenIds[i]);
    const price = Number(outcomePrices[i]);
    if (Number.isFinite(price)) prices[label] = price;
  }

  const endTime = toUnixSeconds(raw.endTime ?? raw.endDate ?? raw.endDateIso);
  if (!Object.keys(tokenIds).length && !Object.keys(prices).length) return null;

  const windowSeconds = assetObj?.windowSeconds
    || windowSecondsForDuration(durationFromSlug(slug))
    || 300;
  const duration = assetObj?.duration || durationFromSlug(slug) || '5m';
  const eventStartTimeIso = raw.eventStartTime
    || (endTime != null ? new Date((endTime - windowSeconds) * 1000).toISOString() : null);
  return {
    id: raw.id,
    conditionId: raw.conditionId,
    question: raw.question || raw.title || slug,
    outcomes,
    tokenIds,
    gammaPrices: prices,
    endTime,
    endDate: raw.endDate || raw.endDateIso || null,
    eventStartTime: eventStartTimeIso,
    volume: Number(raw.volumeNum ?? raw.volume ?? 0) || 0,
    liquidity: Number(raw.liquidityNum ?? raw.liquidity ?? 0) || 0,
    acceptingOrders: raw.acceptingOrders !== false,
    active: raw.active !== false,
    closed: !!raw.closed,
    negRisk: !!raw.negRisk,
    tickSize: String(raw.orderPriceMinTickSize ?? 0.01),
    minShares: Number(raw.orderMinSize ?? 5) || 5,
    bestBid: raw.bestBid != null ? Number(raw.bestBid) : null,
    bestAsk: raw.bestAsk != null ? Number(raw.bestAsk) : null,
    symbol,
    slug,
    asset: assetObj || ASSETS.find((item) => item.symbol === symbol) || null,
    duration,
    windowSeconds,
    isCurrent: (() => {
      if (!assetObj || raw.closed) return false;
      // Wall-clock window from slug epoch — ignore stale Gamma endTime so we don't
      // drop the live bucket at boundaries (root cause of 0-mkt scans).
      return isMarketWindowOpen({
        symbol,
        slug,
        endTime,
        windowSeconds,
        closed: !!raw.closed,
        acceptingOrders: raw.acceptingOrders !== false,
      });
    })(),
    isNext: (() => {
      if (!assetObj) return false;
      const parsed = parseSlugWindow(slug);
      if (!parsed) return slug === getNextSlug(assetObj.slugPrefix, assetObj.windowSeconds);
      const nowSec = Math.floor(Date.now() / 1000);
      return nowSec < parsed.startSec;
    })(),
  };
}

async function fetchMarketBySlug(slug) {
  const url = `${POLY.gammaApi}/events/slug/${slug}`;
  const res = await gammaFetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const market = data.markets?.[0];
  if (!market) return null;
  return market;
}

async function fetchMarketDirect(slug) {
  const url = `${POLY.gammaApi}/markets?slug=${encodeURIComponent(slug)}`;
  const res = await gammaFetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] : null;
}

async function fetchMarketForSlug(slug, { retries = 1 } = {}) {
  let raw = null;
  let error = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      raw = await fetchMarketBySlug(slug);
    } catch (err) {
      error = err;
    }
    if (!raw) {
      try {
        raw = await fetchMarketDirect(slug);
      } catch (err) {
        error = err;
      }
    }
    if (raw || attempt >= retries) break;
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return { raw, error };
}

async function discoverAssetMarkets(asset) {
  const windowSec = asset.windowSeconds || 300;
  const currentSlug = getCurrentSlug(asset.slugPrefix, windowSec);
  const slugSet = new Set([
    getPreviousSlug(asset.slugPrefix, windowSec),
    currentSlug,
    getNextSlug(asset.slugPrefix, windowSec),
  ]);
  const slugs = [...slugSet];
  const found = [];

  for (const slug of slugs) {
    const isCurrentSlug = slug === currentSlug;
    const { raw, error } = await fetchMarketForSlug(slug, { retries: isCurrentSlug ? 3 : 1 });

    if (!raw) {
      found.push({
        symbol: asset.symbol,
        slug,
        missing: true,
        error: error?.message || 'not found',
      });
      continue;
    }

    const normalized = normalizeMarket(raw, asset.symbol, slug, asset);
    if (!normalized || normalized.closed) {
      found.push({
        symbol: asset.symbol,
        slug,
        missing: true,
        error: normalized?.closed ? 'closed' : 'unparseable',
      });
      continue;
    }

    found.push(normalized);
  }

  return found;
}

/**
 * Discover markets across durations.
 * @param {boolean|string[]|{durations?:string[], include15m?:boolean}} opts
 *  - true / omit → 5m+15m+30m+1h
 *  - false → 5m only
 *  - string[] → explicit durations
 */
export async function findMarkets(opts = true, { force = false } = {}) {
  const now = Date.now();
  const wallBucket = wallBucketSec(300, now);
  if (lastDiscoveryWallBucket != null && wallBucket !== lastDiscoveryWallBucket) {
    force = true;
    discoveryCache = null;
  }
  lastDiscoveryWallBucket = wallBucket;

  if (!force && discoveryCache && (now - discoveryCache.at) < DISCOVERY_CACHE_MS) {
    return discoveryCache.result;
  }

  const markets = [];
  const diagnostics = [];
  const scanAssets = resolveScanAssets(opts);

  for (const asset of scanAssets) {
    const discovered = await discoverAssetMarkets(asset);
    for (const item of discovered) {
      if (item.missing) {
        diagnostics.push(item);
        continue;
      }
      if (!markets.find((existing) => existing.slug === item.slug)) {
        markets.push(item);
      }
    }
  }

  // Keep still-open cached markets when a rate-limited refresh only returned NEXT slugs.
  if (discoveryCache?.result?.markets?.length) {
    for (const cached of discoveryCache.result.markets) {
      if (!isMarketWindowOpen(cached)) continue;
      if (!markets.find((existing) => existing.slug === cached.slug)) {
        markets.push(cached);
      }
    }
  }

  const withCurrent = await ensureCurrentWindowMarkets(markets, scanAssets, diagnostics);
  const hydrated = rehydrateMarketWindows(withCurrent);
  const result = { markets: hydrated, diagnostics };
  discoveryCache = { at: now, result };
  return result;
}

export async function searchMarkets(query = 'bitcoin up or down') {
  const url = `${POLY.gammaApi}/public-search?q=${encodeURIComponent(query)}&limit_per_type=10`;
  const res = await gammaFetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.events || []).flatMap((event) =>
    (event.markets || []).map((market) => ({
      ...market,
      eventTitle: event.title,
      eventSlug: event.slug,
    }))
  );
}

/** Cache Polymarket Chainlink window open/close (price-to-beat) by slug. */
const priceToBeatCache = new Map();

/**
 * Polymarket crypto up/down resolves vs the Chainlink price at window open.
 * GET https://polymarket.com/api/crypto/crypto-price?symbol=BTC&eventStartTime=…&variant=fiveminute&endDate=…
 */
export async function fetchPriceToBeat(market) {
  if (!market?.symbol) return null;
  const windowSec = Number(market.windowSeconds || market.durationSec || 300) || 300;
  // Derive window open when Gamma omits eventStartTime (common on slug discovery).
  const eventStartTime = market.eventStartTime
    || (market.endTime != null
      ? new Date((Number(market.endTime) - windowSec) * 1000).toISOString()
      : null);
  if (!eventStartTime) return null;

  const cached = priceToBeatCache.get(market.slug);
  if (cached?.openPrice != null && Date.now() - cached.fetchedAt < 20_000) return cached;
  // Once we have an openPrice for this slug, keep it (it is fixed for the window).
  if (cached?.openPrice != null && cached.slug === market.slug) {
    // Still refresh closePrice periodically while window is live.
    if (Date.now() - cached.fetchedAt < 8_000) return cached;
  }

  const variant = windowSec >= 3600
    ? 'hourly'
    : windowSec >= 1800
      ? 'thirtyminute'
      : windowSec >= 900
        ? 'fifteen'
        : 'fiveminute';
  const params = new URLSearchParams({
    symbol: String(market.symbol).toUpperCase(),
    eventStartTime,
    variant,
  });
  if (market.endDate) params.set('endDate', String(market.endDate));
  else if (market.endTime) params.set('endDate', new Date(market.endTime * 1000).toISOString());

  try {
    const url = `https://polymarket.com/api/crypto/crypto-price?${params}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return cached || null;
    const data = await res.json();
    const openPrice = Number(data.openPrice);
    const closePrice = data.closePrice != null ? Number(data.closePrice) : null;
    // Future windows often return openPrice: 0 until the window opens — treat as missing.
    if (!Number.isFinite(openPrice) || openPrice <= 0) return cached || null;
    const entry = {
      slug: market.slug,
      symbol: market.symbol,
      openPrice,
      closePrice: Number.isFinite(closePrice) && closePrice > 0 ? closePrice : null,
      completed: !!data.completed,
      eventStartTime,
      fetchedAt: Date.now(),
      source: 'polymarket_crypto_price',
    };
    priceToBeatCache.set(market.slug, entry);
    return entry;
  } catch {
    return cached || null;
  }
}

export { normalizeMarket, parseMaybeJson, toUnixSeconds };
