import { describe, expect, it } from 'vitest';
import { selectTradableMarkets, rehydrateMarketWindows } from '../../src/polymarket/markets.js';
import { currentWallWindow, isMarketWindowOpen } from '../../src/polymarket/windows.js';
import { getCurrentSlug } from '../../src/polymarket/config.js';

describe('selectTradableMarkets', () => {
  it('returns only wall-clock open markets by default', () => {
    const wall = currentWallWindow(300);
    const nowMs = wall.startAtMs + 120_000;
    const cur = {
      slug: `btc-updown-5m-${wall.startSec}`,
      symbol: 'BTC',
      windowSeconds: 300,
      acceptingOrders: true,
      isCurrent: true,
    };
    const nxt = {
      slug: `btc-updown-5m-${wall.endSec}`,
      symbol: 'BTC',
      windowSeconds: 300,
      acceptingOrders: true,
      isCurrent: false,
    };
    const markets = [cur, nxt];
    const tradable = selectTradableMarkets(markets, { tradeCurrentWindowOnly: true });
    expect(tradable.map((m) => m.slug)).toEqual([cur.slug]);
    expect(isMarketWindowOpen(cur, nowMs)).toBe(true);
    expect(isMarketWindowOpen(nxt, nowMs)).toBe(false);
  });

  it('returns all markets when tradeCurrentWindowOnly is false', () => {
    const wall = currentWallWindow(300);
    const cur = { slug: `btc-updown-5m-${wall.startSec}`, symbol: 'BTC', windowSeconds: 300, acceptingOrders: true };
    const nxt = { slug: `btc-updown-5m-${wall.endSec}`, symbol: 'BTC', windowSeconds: 300, acceptingOrders: true };
    expect(selectTradableMarkets([cur, nxt], { tradeCurrentWindowOnly: false })).toHaveLength(2);
  });

  it('keeps slug-open market when Gamma endTime is stale', () => {
    const wall = currentWallWindow(300);
    const nowMs = wall.startAtMs + 60_000;
    const staleEnd = {
      slug: `btc-updown-5m-${wall.startSec}`,
      symbol: 'BTC',
      windowSeconds: 300,
      acceptingOrders: true,
      endTime: wall.startSec - 30,
    };
    expect(isMarketWindowOpen(staleEnd, nowMs)).toBe(true);
    expect(selectTradableMarkets([staleEnd], { tradeCurrentWindowOnly: true })).toHaveLength(1);
  });

  it('rehydrates isCurrent from slug epoch when flag was stale', () => {
    const wall = currentWallWindow(300);
    const nowMs = wall.startAtMs + 90_000;
    const curSlug = getCurrentSlug('btc-updown-5m', 300);
    const stale = {
      slug: curSlug,
      symbol: 'BTC',
      windowSeconds: 300,
      acceptingOrders: true,
      isCurrent: false,
    };
    const [fixed] = rehydrateMarketWindows([stale], nowMs);
    expect(fixed.isCurrent).toBe(true);
    expect(selectTradableMarkets([stale], { tradeCurrentWindowOnly: true })).toHaveLength(1);
  });
});
