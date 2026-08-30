// @ts-nocheck
// Kelly Criterion position sizing with dynamic TP/SL, trailing stops, partial profits

const MAX_KELLY = 0.5;
const MIN_KELLY_FRAC = 0.01;

let tradeHistory = [];

export function setKellyTradeHistory(trades) {
  tradeHistory = trades;
}

export function getKellyStats() {
  const wins = tradeHistory.filter((x) => (x.pnl || 0) > 0);
  const losses = tradeHistory.filter((x) => (x.pnl || 0) <= 0);
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
    const cappedConf = Math.min(0.65, Number(signalConfidence || 0));
    const size = minUsd + (maxUsd - minUsd) * (0.15 + cappedConf * 0.25);
    return {
      sizeUsd: Math.round(Math.max(minUsd, Math.min(size, maxUsd)) * 100) / 100,
      kellyFraction: 0,
      kellyRaw: 0,
      method: 'confidence_scaling',
      ...(stats || { winRate: 0, totalTrades: tradeCount }),
    };
  }

  // Negative edge → size 0 (do not floor into forced min bets)
  if (!(stats.kelly > 0) || !(stats.edge > 0)) {
    return {
      sizeUsd: 0,
      kellyFraction: 0,
      kellyRaw: stats.kelly,
      method: 'negative_kelly',
      ...stats,
    };
  }

  const betPct = Math.max(MIN_KELLY_FRAC, Math.min(stats.kelly * kellyFraction, MAX_KELLY));
  const sizedByBankroll = bankroll * betPct;
  const cappedConf = Math.min(0.65, Number(signalConfidence || 0));
  const sizedBySignal = sizedByBankroll * (0.35 + cappedConf * 0.5);
  const finalSize = Math.max(minUsd, Math.min(sizedBySignal, maxUsd, bankroll * maxPositionPct));

  return {
    sizeUsd: Math.round(finalSize * 100) / 100,
    kellyFraction: Math.round(betPct * 10000) / 100,
    kellyRaw: stats.kelly,
    method: 'kelly',
    ...stats,
  };
}

