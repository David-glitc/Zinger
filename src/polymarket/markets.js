import { POLY, ASSETS, ALL_ASSETS, getCurrentSlug, getNextSlug } from './config.js';

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

function normalizeMarket(raw, symbol, slug) {
  if (!raw) return null;

  const asset = ASSETS.find((item) => item.symbol === symbol);
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

  const assetObj = ASSETS.find((a) => a.symbol === symbol) || ALL_ASSETS.find((a) => a.symbol === symbol);
  return {
    id: raw.id,
    conditionId: raw.conditionId,
    question: raw.question || raw.title || slug,
    outcomes,
    tokenIds,
    gammaPrices: prices,
    endTime,
    endDate: raw.endDate || raw.endDateIso || null,
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
    asset,
    duration: assetObj?.duration || '5m',
    windowSeconds: assetObj?.windowSeconds || 300,
    isCurrent: assetObj ? slug === getCurrentSlug(assetObj.slugPrefix, assetObj.windowSeconds) : false,
  };
}

async function fetchMarketBySlug(slug) {
  const url = `${POLY.gammaApi}/events/slug/${slug}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  const market = data.markets?.[0];
  if (!market) return null;
  return market;
}

async function fetchMarketDirect(slug) {
  const url = `${POLY.gammaApi}/markets?slug=${encodeURIComponent(slug)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data[0] : null;
}

async function discoverAssetMarkets(asset) {
  const windowSec = asset.windowSeconds || 300;
  const slugs = [getCurrentSlug(asset.slugPrefix, windowSec), getNextSlug(asset.slugPrefix, windowSec)];
  const found = [];

  for (const slug of slugs) {
    let raw = null;
    let error = null;

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

    if (!raw) {
      found.push({
        symbol: asset.symbol,
        slug,
        missing: true,
        error: error?.message || 'not found',
      });
      continue;
    }

    const normalized = normalizeMarket(raw, asset.symbol, slug);
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

export async function findMarkets(include15m = true) {
  const markets = [];
  const diagnostics = [];

  const scanAssets = include15m ? ALL_ASSETS : ASSETS;
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

  return { markets, diagnostics };
}

export async function searchMarkets(query = 'bitcoin up or down') {
  const url = `${POLY.gammaApi}/public-search?q=${encodeURIComponent(query)}&limit_per_type=10`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
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

export { normalizeMarket, parseMaybeJson, toUnixSeconds };
