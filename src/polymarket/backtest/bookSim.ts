// @ts-nocheck
/**
 * Synthetic Polymarket CLOB from underlying spot + strike.
 *
 * Polymarket 5m windows resolve on Chainlink open vs close. We don't have 6
 * months of historical CLOB snapshots, so we model:
 *   - fair UP prob from moneyness + time remaining (like strikeForecast)
 *   - ask = fair + half-spread + noise
 *   - multi-level ladder with decaying size (for arbDepth walk)
 *   - occasional mispricing gaps when vol spikes (arb opportunities)
 */
import { forecastAboveStrike, volPerMinuteFromSignal } from '../strikeForecast.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Fair UP probability from strike geometry.
 */
export function fairProbUp({ spot, strike, secondsRemaining, atrPct = 0.03 }) {
  const vol = (Number(atrPct) / 100) / Math.sqrt(8 / Math.PI);
  const f = forecastAboveStrike({
    spot: Number(spot),
    strike: Number(strike),
    secondsRemaining: Math.max(25, Number(secondsRemaining) || 60),
    volPerMinute: vol,
    spotAgeMs: 0,
  });
  if (f?.probUp != null) return f.probUp;
  if (!(spot > 0) || !(strike > 0)) return 0.5;
  const m = (spot - strike) / strike;
  return clamp(0.5 + m * 80, 0.06, 0.94);
}

function buildLadder(bestAsk, levels = 5, baseSize = 120) {
  const asks = [];
  let price = bestAsk;
  for (let i = 0; i < levels; i++) {
    const size = Math.max(5, baseSize * (0.55 ** i));
    asks.push({ price, size, value: price * size });
    price = Math.min(0.99, price + 0.01);
  }
  let cum = 0;
  for (const a of asks) {
    cum += a.size;
    a.cum = cum;
  }
  const bids = [];
  let bid = Math.max(0.01, bestAsk - 0.01);
  for (let i = 0; i < levels; i++) {
    const size = Math.max(5, baseSize * 0.9 * (0.55 ** i));
    bids.push({ price: bid, size, value: bid * size });
    bid = Math.max(0.01, bid - 0.01);
  }
  cum = 0;
  for (const b of bids) {
    cum += b.size;
    b.cum = cum;
  }
  const bestBid = bids[0]?.price || 0;
  const spread = bestAsk - bestBid;
  return {
    bids,
    asks,
    bestBid,
    bestAsk,
    spread,
    spreadPct: bestAsk > 0 ? (spread / bestAsk) * 100 : 0,
    mid: (bestBid + bestAsk) / 2,
    imbalance: 0,
    bidCount: bids.length,
    askCount: asks.length,
  };
}

/**
 * Build synthetic UP/DOWN books for one scan tick.
 *
 * `mispriceSeed` injects occasional arb gaps (sum < 1 after fees) when high —
 * models fleeting CLOB dislocations.
 */
export function simulateMarketBooks({
  spot,
  strike,
  secondsRemaining,
  atrPct = 0.03,
  mispriceSeed = 0,
} = {}) {
  const probUp = fairProbUp({ spot, strike, secondsRemaining, atrPct });
  const spreadHalf = clamp(0.005 + (Number(atrPct) || 0.03) * 0.08, 0.004, 0.014);

  // Inject dislocations when seed high — models fleeting CLOB sum < $1 packages
  let gapInject = 0;
  if (mispriceSeed > 0.92) gapInject = 0.028 + (mispriceSeed - 0.92) * 0.12;
  else if (mispriceSeed > 0.85) gapInject = 0.018;
  else if (mispriceSeed > 0.75) gapInject = 0.01;

  const upFair = probUp;
  const downFair = 1 - probUp;
  const upAsk = clamp(upFair + spreadHalf - gapInject * 0.5, 0.02, 0.98);
  const downAsk = clamp(downFair + spreadHalf - gapInject * 0.5, 0.02, 0.98);

  const up = buildLadder(upAsk);
  const down = buildLadder(downAsk);
  const sum = upAsk + downAsk;

  return {
    prices: { up: upAsk, down: downAsk, upAsk, downAsk, upBid: up.bestBid, downBid: down.bestBid },
    depth: { up, down },
    probUp,
    strike,
    spot,
    sum,
    gap: 1 - sum,
    secondsRemaining,
  };
}
