import { findMarkets } from '../src/polymarket/markets.js';
import { isMarketWindowOpen } from '../src/polymarket/windows.js';

const { markets, diagnostics } = await findMarkets(['5m']);
console.log('markets', markets.length, 'diagnostics', diagnostics.length);
for (const m of markets) {
  const open = isMarketWindowOpen(m);
  console.log(m.symbol, m.slug, 'isCurrent', m.isCurrent, 'isNext', m.isNext, 'open', open, 'endTime', m.endTime);
}
const tradable = markets.filter((m) => m.isCurrent || isMarketWindowOpen(m));
console.log('tradable', tradable.length);
if (diagnostics.length) console.log('diag', JSON.stringify(diagnostics, null, 2));
