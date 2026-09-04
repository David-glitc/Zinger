// @ts-nocheck
/**
 * Directional and cost signals read from the CLOB depth ladder.
 *
 * `normalizeLevels` in clob.ts has been building ten priced levels per side —
 * each with `size`, `value` and a running `cum` — on every scan, and the only
 * things downstream ever read were `bestBid`, `bestAsk`, a single top-of-book
 * `imbalance` and `spreadPct`. The ladder itself was computed, attached, shipped
 * to the UI, and discarded by the decision path. That is the largest piece of
 * live information the bot already pays to fetch and does not use.
 *
 * Three distinct things live in a ladder, and conflating them is why a single
 * `imbalance` scalar was not enough:
 *
 *   pressure   who is queued, and how far from the touch. Size resting one tick
 *              away is a very different claim from the same size five ticks out,
 *              and a value-weighted sum cannot tell them apart.
 *   liquidity  what a given order would actually pay. This is a cost input, not
 *              a directional one, and it is the check that stops paper from
 *              "filling" 400 shares against a 12-share top level.
 *   quality    whether the book is worth reading at all. A two-level book with a
 *              9% spread produces a confident-looking imbalance that means
 *              nothing, and weighting it equally with a deep book is how noise
 *              gets promoted to signal.
 *
 * Everything here is a pure function of a depth snapshot so it can be tested
 * against fixtures rather than a live socket.
 */

/** Levels beyond this are too far from the touch to inform a 5m decision. */
export const MAX_LEVELS = 5;

/**
 * Decay applied per level away from the touch when weighting resting size.
 *
 * 0.6 makes level 2 worth 60% of level 1 and level 5 worth ~13%. Chosen so the
 * touch dominates without the deeper book being decorative: a flat weighting
 * lets a large passive order five ticks out swamp the live queue, which is the
 * classic way a spoofed ladder reads as conviction.
 */
export const LEVEL_DECAY = 0.6;

/** A book thinner than this many levels per side is not worth reading. */
export const MIN_LEVELS_FOR_SIGNAL = 2;

/**
 * Widest spread, in cents, that still permits a directional read.
 *
 * Measured in cents rather than as a percentage of mid, which is the natural
 * unit for a market whose prices are probabilities on a fixed 1-cent tick.
 *
 * The percentage version was tried first and is actively wrong here. A live
 * out-of-the-money token quoted 0.04 bid / 0.05 ask reports `spreadPct` of
 * 22.2%, which reads as a catastrophically wide book — but it is a one-tick
 * spread, the tightest quote the exchange can represent. Any percentage ceiling
 * low enough to exclude genuinely wide books also excludes every cheap token,
 * and cheap tokens are most of the ladder in a market that spends much of its
 * life far from 50/50. The first live check produced `null` on nearly every
 * candidate for exactly this reason.
 *
 * 4 cents is wide in absolute terms at any price level, which is the property
 * actually wanted.
 */
export const MAX_SPREAD_CENTS_FOR_SIGNAL = 4;

const clamp11 = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/**
 * Depth-weighted imbalance across the near ladder.
 *
 * Returns a value in [-1, 1], positive when bids dominate. Two things separate
 * this from the top-of-book `imbalance` already on the depth object.
 *
 * The first is distance weighting, which is the point of reading a ladder.
 *
 * The second is the unit. `clob.ts` sums `value` (price x size), and on a book
 * whose bids rest below its asks that is not neutral: equal share counts on both
 * sides produce more ask *value* purely because asks are priced higher. A
 * perfectly symmetric 5-level book measured -0.042 — a standing bearish tilt of
 * four percent from arithmetic alone. Shares queued is the correct measure of
 * directional pressure, so this sums `size`.
 */
export function weightedImbalance(bids = [], asks = [], levels = MAX_LEVELS) {
  let bidW = 0;
  let askW = 0;
  for (let i = 0; i < Math.min(levels, bids.length); i++) {
    bidW += (Number(bids[i]?.size) || 0) * LEVEL_DECAY ** i;
  }
  for (let i = 0; i < Math.min(levels, asks.length); i++) {
    askW += (Number(asks[i]?.size) || 0) * LEVEL_DECAY ** i;
  }
  const total = bidW + askW;
  if (!(total > 0)) return 0;
  return clamp11((bidW - askW) / total);
}

/**
 * Microprice: the mid implied by size at the touch.
 *
 * When the ask carries far more size than the bid, the true clearing price sits
 * nearer the bid. Its displacement from the arithmetic mid is a short-horizon
 * pressure reading that the mid, by construction, cannot express.
 */
export function microprice(bids = [], asks = []) {
  const bb = Number(bids[0]?.price) || 0;
  const ba = Number(asks[0]?.price) || 0;
  const bs = Number(bids[0]?.size) || 0;
  const as = Number(asks[0]?.size) || 0;
  if (!(bb > 0) || !(ba > 0) || !(bs + as > 0)) return null;
  // Weight each side by the size resting on the OPPOSITE side: heavy asks pull
  // the clearing price down toward the bid.
  const micro = (bb * as + ba * bs) / (bs + as);
  const mid = (bb + ba) / 2;
  const spread = ba - bb;
  return {
    micro,
    mid,
    // Normalised into [-1, 1] by half-spread, so it is comparable across books.
    tilt: spread > 0 ? clamp11((micro - mid) / (spread / 2)) : 0,
  };
}

/**
 * What buying `usdNotional` would actually cost, walking the ask ladder.
 *
 * `slippagePct` is the premium over the touch price. `filled` reports how much
 * of the request the visible book can absorb — the number that makes a paper
 * fill honest. Returns `null` on an empty book rather than pretending the touch
 * price is available in unlimited size.
 */
export function estimateBuyCost(asks = [], usdNotional = 0) {
  const want = Number(usdNotional);
  if (!(want > 0) || !asks.length) return null;
  const touch = Number(asks[0]?.price) || 0;
  if (!(touch > 0)) return null;

  let remaining = want;
  let spent = 0;
  let shares = 0;
  for (const level of asks) {
    const price = Number(level?.price) || 0;
    const size = Number(level?.size) || 0;
    if (!(price > 0) || !(size > 0)) continue;
    const levelValue = price * size;
    const take = Math.min(remaining, levelValue);
    spent += take;
    shares += take / price;
    remaining -= take;
    if (remaining <= 1e-9) break;
  }

  if (!(shares > 0)) return null;
  const avgPrice = spent / shares;
  return {
    avgPrice,
    touchPrice: touch,
    shares,
    filledUsd: spent,
    requestedUsd: want,
    fillRatio: clamp01(spent / want),
    slippagePct: touch > 0 ? ((avgPrice - touch) / touch) * 100 : 0,
    // True when the visible ladder cannot absorb the order at all.
    exhausted: remaining > 1e-9,
  };
}

/**
 * Walk the ask ladder for an exact share count (arb needs N UP + N DOWN).
 *
 * Returns null when the visible book cannot fill the full size — the arb engine
 * uses this to size down until both legs fit without phantom touch fills.
 */
export function estimateBuyForShares(asks = [], sharesWanted = 0) {
  const want = Number(sharesWanted);
  if (!(want > 0)) return null;
  const touch = Number(asks[0]?.price) || 0;
  if (!(touch > 0)) return null;

  let remaining = want;
  let spent = 0;
  for (const level of asks) {
    const price = Number(level?.price) || 0;
    const size = Number(level?.size) || 0;
    if (!(price > 0) || !(size > 0)) continue;
    const take = Math.min(remaining, size);
    spent += take * price;
    remaining -= take;
    if (remaining <= 1e-9) break;
  }

  if (remaining > 1e-9) {
    return {
      avgPrice: touch,
      touchPrice: touch,
      shares: want - remaining,
      spent,
      fillRatio: clamp01((want - remaining) / want),
      slippagePct: 0,
      exhausted: true,
    };
  }

  return {
    avgPrice: spent / want,
    touchPrice: touch,
    shares: want,
    spent,
    fillRatio: 1,
    slippagePct: touch > 0 ? ((spent / want - touch) / touch) * 100 : 0,
    exhausted: false,
  };
}

/**
 * How much to trust anything this book says, in [0, 1].
 *
 * Multiplicative rather than additive: a book can fail on any one of depth,
 * spread or one-sidedness, and any single failure should be able to collapse
 * the weight on its own. Summing would let a very deep book carry a 4c spread.
 */
export function bookQuality(depth) {
  if (!depth) return 0;
  const bidN = Number(depth.bidCount ?? depth.bids?.length ?? 0);
  const askN = Number(depth.askCount ?? depth.asks?.length ?? 0);
  if (bidN < MIN_LEVELS_FOR_SIGNAL || askN < MIN_LEVELS_FOR_SIGNAL) return 0;

  const bestBid = Number(depth.bestBid ?? 0);
  const bestAsk = Number(depth.bestAsk ?? 0);
  if (!(bestBid > 0) || !(bestAsk > 0) || bestAsk < bestBid) return 0;
  const spreadCents = (bestAsk - bestBid) * 100;
  if (spreadCents > MAX_SPREAD_CENTS_FOR_SIGNAL) return 0;
  // A one-tick spread scores 1 and decays to 0 at the ceiling.
  const spreadScore = clamp01(1 - (spreadCents - 1) / (MAX_SPREAD_CENTS_FOR_SIGNAL - 1));

  const depthScore = clamp01(Math.min(bidN, askN) / MAX_LEVELS);

  // A book with all its value on one side is usually stale or being worked,
  // not a consensus. Penalise the extremes without eliminating them.
  const totalBid = Number(depth.totalBidVol ?? 0);
  const totalAsk = Number(depth.totalAskVol ?? 0);
  const total = totalBid + totalAsk;
  const onesided = total > 0 ? Math.abs(totalBid - totalAsk) / total : 1;
  const balanceScore = clamp01(1 - Math.max(0, onesided - 0.85) / 0.15);

  return clamp01(spreadScore * depthScore * balanceScore);
}

/**
 * Full read of one side's book.
 *
 * `vote` is the directional opinion in [-1, 1] for the token this depth belongs
 * to (positive = pressure toward this token settling YES). `weight` is the
 * quality, intended to be handed straight to a weighted blend so a poor book
 * contributes proportionally little rather than being dropped by a threshold.
 */
export function readBook(depth, { notionalUsd = 0 } = {}) {
  if (!depth) return null;
  const bids = depth.bids || [];
  const asks = depth.asks || [];
  const quality = bookQuality(depth);

  const wImb = weightedImbalance(bids, asks);
  const micro = microprice(bids, asks);
  const cost = notionalUsd > 0 ? estimateBuyCost(asks, notionalUsd) : null;

  // Imbalance carries the directional weight; microprice tilt is a faster but
  // noisier confirmation, so it gets a third of the say.
  const vote = clamp11(0.7 * wImb + 0.3 * (micro?.tilt ?? 0));

  return {
    vote,
    weight: quality,
    weightedImbalance: wImb,
    microTilt: micro?.tilt ?? 0,
    micro: micro?.micro ?? null,
    quality,
    spreadPct: Number(depth.spreadPct ?? 0),
    levels: Math.min(Number(depth.bidCount ?? bids.length ?? 0), Number(depth.askCount ?? asks.length ?? 0)),
    cost,
  };
}
