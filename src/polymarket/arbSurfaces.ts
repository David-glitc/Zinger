// @ts-nocheck
/**
 * Two-stage orderbook arb surfaces.
 *
 * Stage 1 — complementary ASK arb (existing engine): buy UP ask + DOWN ask
 *   when askSum < 1 − fees.
 *
 * Stage 2 — complementary BID (reverse) arb: when bidSum > 1 + sell fees,
 *   mint/split $1 → sell both into bids (paper sim or live CTF split+sell).
 *
 * Also reports per-outcome bid/ask spreads. Crossing a single-outcome spread
 * (buy ask, sell bid) is NOT arb — it is a scalp / maker edge. We surface it
 * so the UI and audits can see the full four-corner book.
 */
import { arbBreakEvenGap, takerFeeUsdc } from './fees.js';

function touch(side, field, fallback = 0) {
  const v = Number(side?.[field] ?? fallback);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function sideSpread(side) {
  const bid = touch(side, 'bestBid');
  const ask = touch(side, 'bestAsk');
  if (!(bid > 0 && ask > 0)) {
    return {
      bid: bid || null,
      ask: ask || null,
      mid: null,
      spread: null,
      spreadPct: null,
      crossable: false,
    };
  }
  const mid = (bid + ask) / 2;
  const spread = ask - bid;
  return {
    bid,
    ask,
    mid,
    spread,
    spreadPct: mid > 0 ? spread / mid : null,
    // Taker cannot lock arb by buying ask and selling bid — always lose the spread.
    crossable: false,
    note: 'single-leg bid/ask is spread (scalp/maker), not locked arb',
  };
}

/**
 * Snapshot all four corners + both complementary stages.
 *
 * @returns {{
 *   up: object, down: object,
 *   stage1Ask: object, stage2Bid: object,
 *   bestStage: 'ask'|'bid'|'none',
 * }}
 */
export function evaluateArbSurfaces(depth, prices = {}, feeParams = 'crypto', opts = {}) {
  const minGap = Number(opts.minGap ?? 0.008);
  const marginPct = Number(opts.marginPct ?? 0.005);
  const minBidPremium = Number(opts.minBidPremium ?? 0.008);

  const upAsk = touch(depth?.up, 'bestAsk', prices?.up);
  const downAsk = touch(depth?.down, 'bestAsk', prices?.down);
  const upBid = touch(depth?.up, 'bestBid', 0);
  const downBid = touch(depth?.down, 'bestBid', 0);

  const up = sideSpread({ bestBid: upBid, bestAsk: upAsk });
  const down = sideSpread({ bestBid: downBid, bestAsk: downAsk });

  const askSum = upAsk && downAsk ? upAsk + downAsk : null;
  const askGap = askSum != null ? 1 - askSum : null;
  const askBreakEven = upAsk && downAsk ? arbBreakEvenGap(upAsk, downAsk, feeParams) : Infinity;
  const askNeed = askBreakEven + marginPct;
  const stage1Ask = {
    kind: 'complementary_ask',
    stage: 1,
    upAsk,
    downAsk,
    sum: askSum,
    gap: askGap,
    breakEvenGap: Number.isFinite(askBreakEven) ? askBreakEven : null,
    actionable: askGap != null && askGap >= minGap && askGap > askNeed,
    edgeOverBreakEven: askGap != null && Number.isFinite(askBreakEven)
      ? askGap - askBreakEven
      : null,
  };

  // Reverse: sell into both bids after minting a $1 pair.
  // Gross per share = bidSum − 1; pay taker fees on both sells.
  const bidSum = upBid && downBid ? upBid + downBid : null;
  const bidPremium = bidSum != null ? bidSum - 1 : null;
  let sellFeesPerShare = 0;
  if (upBid > 0 && downBid > 0) {
    // Fee for 1 share on each leg
    sellFeesPerShare = takerFeeUsdc(1, upBid, feeParams) + takerFeeUsdc(1, downBid, feeParams);
  }
  const stage2Bid = {
    kind: 'complementary_bid_reverse',
    stage: 2,
    upBid,
    downBid,
    sum: bidSum,
    premium: bidPremium,
    sellFeesPerShare,
    netPerShare: bidPremium != null ? bidPremium - sellFeesPerShare : null,
    actionable: bidPremium != null
      && bidPremium >= minBidPremium
      && bidPremium > sellFeesPerShare + marginPct,
  };

  let bestStage = 'none';
  if (stage1Ask.actionable && stage2Bid.actionable) {
    bestStage = (stage1Ask.gap || 0) >= (stage2Bid.netPerShare || 0) ? 'ask' : 'bid';
  } else if (stage1Ask.actionable) bestStage = 'ask';
  else if (stage2Bid.actionable) bestStage = 'bid';

  return {
    up,
    down,
    stage1Ask,
    stage2Bid,
    bestStage,
    touchAskGap: askGap,
    touchBidPremium: bidPremium,
  };
}

/**
 * Size a paper reverse (bid-sum) package: mint `shares` pairs, sell both bids.
 */
export function evaluateReverseBidOpportunity({
  depth,
  prices,
  maxBudgetUsd = 50,
  feeParams = 'crypto',
  marginPct = 0.005,
  minBidPremium = 0.008,
  minShares = 1,
  minPackageUsd = 10,
}) {
  const surfaces = evaluateArbSurfaces(depth, prices, feeParams, {
    marginPct,
    minBidPremium,
  });
  const s2 = surfaces.stage2Bid;
  if (!s2.actionable) return null;

  const upBid = s2.upBid;
  const downBid = s2.downBid;
  // Mint costs $1/share; budget caps shares
  const sharesByBudget = Math.floor((Number(maxBudgetUsd) / 1) * 1000) / 1000;
  const upSize = Number(depth?.up?.bids?.[0]?.size ?? depth?.up?.totalBidVol ?? sharesByBudget);
  const downSize = Number(depth?.down?.bids?.[0]?.size ?? depth?.down?.totalBidVol ?? sharesByBudget);
  const shares = Math.min(sharesByBudget, upSize || sharesByBudget, downSize || sharesByBudget);
  if (!(shares >= minShares)) return null;

  const mintCost = Math.round(shares * 100) / 100;
  if (mintCost < minPackageUsd) return null;

  const feeUp = takerFeeUsdc(shares, upBid, feeParams);
  const feeDown = takerFeeUsdc(shares, downBid, feeParams);
  const gross = shares * (upBid + downBid);
  const netProceeds = Math.round((gross - feeUp - feeDown) * 100) / 100;
  const lockedProfitUsd = Math.round((netProceeds - mintCost) * 100) / 100;
  if (!(lockedProfitUsd > 0)) return null;

  return {
    ...s2,
    shares,
    mintCost,
    feesEstUsd: Math.round((feeUp + feeDown) * 100) / 100,
    netProceeds,
    lockedProfitUsd,
    lockedProfitPct: mintCost > 0 ? (lockedProfitUsd / mintCost) * 100 : 0,
    surfaces,
  };
}
