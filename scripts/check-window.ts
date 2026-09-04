#!/usr/bin/env node
import { findMarkets, selectTradableMarkets, rehydrateMarketWindows } from '../src/polymarket/markets.js';
import { isMarketWindowOpen } from '../src/polymarket/windows.js';
import { getCurrentSlug } from '../src/polymarket/config.js';

const { markets, diagnostics } = await findMarkets(['5m'], { force: true });
const tradable = selectTradableMarkets(markets, {});
console.log('current slug', getCurrentSlug('btc-updown-5m', 300));
console.log('found', markets.map((m) => ({
  slug: m.slug,
  isCurrent: m.isCurrent,
  open: isMarketWindowOpen(m),
  closed: m.closed,
  accepting: m.acceptingOrders,
})));
console.log('tradable', tradable.map((m) => m.slug));
console.log('diag', diagnostics);
