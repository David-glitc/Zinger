// Kelly Criterion position sizing with dynamic TP/SL, trailing stops, partial profits

const MAX_KELLY = 0.5;
const MIN_KELLY_FRAC = 0.01;

let tradeHistory = [];

export function setKellyTradeHistory(trades) {
  tradeHistory = trades;
}

export function getKellyStats() {
  const wins = tradeHistory.filter(x => (x.pnl || 0) > 0);
  const losses = tradeHistory.filter(x => (x.pnl || 0) <= 0);
  const total = tradeHistory.length;
  if (total < 5) return null;

  const winRate = wins.length / total;
  const avgWin = wins.length > 0 ? wins.reduce((s, x) => s + (x.pnl || 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, x) => s + (x.pnl || 0), 0) / losses.length) : 0;
  const ratio = avgLoss > 0 ? avgWin / avgLoss : 0;
  const kelly = ratio > 0 ? (winRate * ratio - (1 - winRate)) / ratio : 0;
  const edge = winRate * avgWin - (1 - winRate) * avgLoss;

  return {
    winRate: Math.round(winRate * 1000) / 10,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    ratio: Math.round(ratio * 10) / 10,
    kelly: Math.round(kelly * 1000) / 1000,
    edge: Math.round(edge * 100) / 100,
    totalTrades: total,
  };
}

export function computeKellySize({
  bankroll,
  price,
  signalConfidence,
  historicalWinRate,
  tradeCount,
  minUsd = 0.4,
  maxUsd,
  kellyFraction = 0.25,
  maxPositionPct = 0.4,
}) {
  const stats = getKellyStats();

  if (!stats || tradeCount < 10) {
    // Confidence-based sizing when data is thin
    const size = minUsd + (maxUsd - minUsd) * (0.3 + signalConfidence * 0.3);
    return {
      sizeUsd: Math.round(Math.max(minUsd, Math.min(size, maxUsd)) * 100) / 100,
      kellyFraction: 0,
      kellyRaw: 0,
      method: 'confidence_scaling',
      ...(stats || { winRate: 0, totalTrades: tradeCount }),
    };
  }

  const betPct = Math.max(MIN_KELLY_FRAC, Math.min(stats.kelly * kellyFraction, MAX_KELLY));
  const sizedByBankroll = bankroll * betPct;
  const sizedBySignal = sizedByBankroll * (0.3 + signalConfidence * 0.7);
  const finalSize = Math.max(minUsd, Math.min(sizedBySignal, maxUsd, bankroll * maxPositionPct));

  return {
    sizeUsd: Math.round(finalSize * 100) / 100,
    kellyFraction: Math.round(betPct * 10000) / 100,
    kellyRaw: stats.kelly,
    method: 'kelly',
    ...stats,
  };
}

export function resolveDynamicLimits(cfg, bankroll) {
  const min = Math.max(Number(cfg.minPositionSize ?? 0.4), 0.1);
  const maxPct = Number(cfg.maxPositionPct ?? 0.4);
  const cap = Number(cfg.maxPositionCap ?? 50);
  const maxByBankroll = bankroll * maxPct;
  const maxUsd = Math.min(maxByBankroll, cap, Number(cfg.maxPositionSize ?? cap));
  const minUsd = Math.min(min, maxUsd);
  return { minUsd, maxUsd, spendable: bankroll };
}

export function buildDynamicPlan({ cfg, price, analysis, signal }) {
  const vol = analysis?.volatility?.atrPct || 0.2;
  const volFactor = Math.max(0.5, Math.min(vol / 0.2, 3));
  const trendStrength = analysis?.adx?.adx || 25;

  // Base TP/SL from config
  const baseTpLow = Number(cfg.tpPctLow ?? 25);
  const baseTpHigh = Number(cfg.tpPctHigh ?? 55);
  const baseSl = Number(cfg.slPct ?? 18);

  // Dynamic TP: wider in high vol, tighter in low vol
  const tpPct = baseTpLow + Math.random() * (baseTpHigh - baseTpLow);
  const scaledTp = tpPct * (1 + (volFactor - 1) * 0.3);
  const dynamicTp = Math.round(Math.max(baseTpLow * 0.7, Math.min(scaledTp, baseTpHigh * 1.5)) * 10) / 10;

  // Dynamic SL: wider in high vol (avoid noise stops), but tighter in strong trends
  const trendNarrowing = trendStrength > 30 ? 0.8 : 1;
  const scaledSl = baseSl * volFactor * trendNarrowing;
  const dynamicSl = Math.round(Math.max(baseSl * 0.5, Math.min(scaledSl, baseSl * 2)) * 10) / 10;

  // Trailing activates after reaching 50% of TP
  const trailActivatePct = Math.round(dynamicTp * 0.5 * 10) / 10;
  const trailDistance = Math.min(vol * 3, 15); // trailing kicks in after retrace of this %

  // Partial profit: bank more earlier (45% of TP, sell 60%) so runners keep edge
  const conf = Number(signal?.confidence ?? 0.5);
  const partialTpPct = Math.round(dynamicTp * (conf >= 0.7 ? 0.4 : 0.45) * 10) / 10;
  const partialPct = conf >= 0.7 ? 0.55 : 0.6;

  return {
    tpPct: dynamicTp,
    slPct: dynamicSl,
    trailActivatePct,
    trailDistancePct: Math.round(trailDistance * 10) / 10,
    partialTpPct,
    partialPct,
    volFactor: Math.round(volFactor * 10) / 10,
    method: 'dynamic',
  };
}

export function checkTrailingStop(pos, currentPrice) {
  if (!pos.highestPrice || currentPrice > pos.highestPrice) {
    pos.highestPrice = currentPrice;
  }
  const trailPct = pos.trailDistancePct || 10;
  const activatePct = pos.trailActivatePct || 50;
  const gainPct = ((pos.highestPrice - pos.entryPrice) / pos.entryPrice) * 100;

  if (gainPct < activatePct) return null;

  const retracePct = ((pos.highestPrice - currentPrice) / pos.highestPrice) * 100;
  if (retracePct >= trailPct) return 'trail';

  return null;
}

export function checkPartialProfit(pos, currentPrice) {
  if (pos.partialSold) return null;
  const gainPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
  if (gainPct >= (pos.partialTpPct || 999)) {
    return 'partial';
  }
  return null;
}
