// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { ingestClobMessage, getClobWsBook } from '../../src/polymarket/clobWs.js';

const book = (assetId, bids, asks) => JSON.stringify({
  event_type: 'book',
  asset_id: assetId,
  bids: bids.map(([price, size]) => ({ price: String(price), size: String(size) })),
  asks: asks.map(([price, size]) => ({ price: String(price), size: String(size) })),
  timestamp: Date.now(),
});

const priceChange = (assetId, side, price, size) => JSON.stringify({
  event_type: 'price_change',
  price_changes: [{ asset_id: assetId, side, price: String(price), size: String(size) }],
  timestamp: Date.now(),
});

describe('CLOB WebSocket ladder', () => {
  it('derives depth, spread and imbalance from a book snapshot', () => {
    ingestClobMessage(book('tok-basic', [[0.45, 100], [0.44, 50]], [[0.47, 100], [0.48, 50]]));
    const b = getClobWsBook('tok-basic');

    expect(b.bestBid).toBe(0.45);
    expect(b.bestAsk).toBe(0.47);
    expect(b.bidCount).toBe(2);
    expect(b.askCount).toBe(2);
    // These four are the fields the WS path used to omit entirely.
    expect(b.spread).toBeCloseTo(0.02, 6);
    expect(b.spreadPct).toBeCloseTo((0.02 / 0.46) * 100, 4);
    expect(b.totalBidVol).toBeCloseTo(0.45 * 100 + 0.44 * 50, 6);
    expect(b.imbalance).toBeLessThan(0);
  });

  it('reports positive imbalance when bid value dominates', () => {
    ingestClobMessage(book('tok-imb', [[0.45, 1000]], [[0.47, 10]]));
    expect(getClobWsBook('tok-imb').imbalance).toBeGreaterThan(0.9);
  });

  it('replaces the ladder wholesale on a new snapshot rather than merging', () => {
    ingestClobMessage(book('tok-replace', [[0.45, 100], [0.40, 100]], [[0.47, 100]]));
    ingestClobMessage(book('tok-replace', [[0.30, 100]], [[0.47, 100]]));
    const b = getClobWsBook('tok-replace');
    // A level that vanished server-side must not survive locally.
    expect(b.bidCount).toBe(1);
    expect(b.bestBid).toBe(0.30);
  });

  it('applies incremental price changes to the ladder', () => {
    ingestClobMessage(book('tok-delta', [[0.45, 100]], [[0.47, 100]]));
    ingestClobMessage(priceChange('tok-delta', 'BUY', 0.46, 200));
    const b = getClobWsBook('tok-delta');
    expect(b.bestBid).toBe(0.46);
    expect(b.bidCount).toBe(2);
  });

  it('removes a level when a price change carries size 0', () => {
    ingestClobMessage(book('tok-remove', [[0.45, 100], [0.44, 100]], [[0.47, 100]]));
    ingestClobMessage(priceChange('tok-remove', 'BUY', 0.45, 0));
    const b = getClobWsBook('tok-remove');
    expect(b.bestBid).toBe(0.44);
    expect(b.bidCount).toBe(1);
  });

  it('caps the ladder at 10 levels per side', () => {
    const bids = Array.from({ length: 25 }, (_, i) => [0.5 - i * 0.01, 10]);
    ingestClobMessage(book('tok-cap', bids, [[0.6, 10]]));
    expect(getClobWsBook('tok-cap').bidCount).toBe(10);
  });

  it('survives a one-sided book without producing NaN', () => {
    ingestClobMessage(book('tok-oneside', [[0.45, 100]], []));
    const b = getClobWsBook('tok-oneside');
    expect(b.bestAsk).toBeNull();
    expect(Number.isFinite(b.spreadPct)).toBe(true);
    expect(Number.isFinite(b.imbalance)).toBe(true);
    expect(b.imbalance).toBe(1);
  });
});
