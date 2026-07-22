export const POLY = {
  gammaApi: 'https://gamma-api.polymarket.com',
  clobApi: 'https://clob.polymarket.com',
  chainId: 137,
  usdc: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  pUsd: '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB',
  ctfExchange: '0x4bFb41d5B3570C1aE5bE8e1FcE77fB7C0c1a1a1',
  negRiskAdapter: '0xd91E80cF2Ba13D2A2F09b49f2E6834f8E1E1A1a1',
};

export const POLY_MIN_ORDER_USD = 0.4;
export const POLY_DEFAULT_MIN_BET = 0.4;
export const POLY_DEFAULT_MAX_BET = 50;
export const POLY_WINDOW_SECONDS = 300;
export const POLY_WINDOW_SECONDS_15M = 900;
export const POLY_SCAN_INTERVAL_MS = 250;

export const ASSETS = [
  { symbol: 'BTC', duration: '5m', slugPrefix: 'btc-updown-5m', windowSeconds: 300 },
  { symbol: 'ETH', duration: '5m', slugPrefix: 'eth-updown-5m', windowSeconds: 300 },
];

export const ASSETS_15M = [
  { symbol: 'BTC', duration: '15m', slugPrefix: 'btc-updown-15m', windowSeconds: 900 },
  { symbol: 'ETH', duration: '15m', slugPrefix: 'eth-updown-15m', windowSeconds: 900 },
];

export const ALL_ASSETS = [...ASSETS, ...ASSETS_15M];

export function getCurrentSlug(symbolPrefix, windowSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const interval = Math.floor(now / windowSeconds) * windowSeconds;
  return `${symbolPrefix}-${interval}`;
}

export function getNextSlug(symbolPrefix, windowSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const interval = Math.floor(now / windowSeconds) * windowSeconds + windowSeconds;
  return `${symbolPrefix}-${interval}`;
}

export function getRemainingSeconds(windowSeconds) {
  return Math.ceil(getRemainingMs(windowSeconds) / 1000);
}

export function getRemainingMs(windowSeconds) {
  const ws = windowSeconds || POLY_WINDOW_SECONDS;
  const now = Date.now();
  const nextInterval = (Math.floor(now / 1000 / ws) + 1) * ws * 1000;
  return nextInterval - now;
}

export function getCycleEndMs(windowSeconds) {
  return Date.now() + getRemainingMs(windowSeconds);
}

export function formatRemainingMs(ms = getRemainingMs()) {
  const safe = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function getIntervalBoundary(timestamp, windowSeconds = 300) {
  return Math.floor(timestamp / windowSeconds) * windowSeconds;
}
