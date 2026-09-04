// @ts-nocheck
/**
 * Deterministic target-context gate for 5m/15m up-down windows.
 * Answers: is the strike reachable in remaining time, and does the book price already reflect it?
 * Uses the same driftless Gaussian as strikeForecast.ts but adds hard tradeability rules.
 */
import { forecastAboveStrike, volPerMinuteFromSignal, strikeEdge, MIN_TAU_SEC, MAX_PLAUSIBLE_EDGE } from './strikeForecast.js';

export function buildTargetContext({ market, signal, spotPrice, remaining, depth, prices }) {
  const windowSec = Number(market?.windowSeconds || 300);
  const strike = Number(market?.priceToBeat ?? market?.priceToBeatMeta?.openPrice ?? 0);
  const spot = Number(spotPrice ?? signal?.price ?? 0);
  const vol = volPerMinuteFromSignal(signal);
  const spotAgeMs = Date.now() - Number(signal?.timestamp || 0);
  const outcome = null; // caller supplies via decision

  if (!(strike > 0) || !(spot > 0)) {
    return { tradeable: false, reason: 'no strike/spot', veto: true, absent: true };
  }
  const fc = forecastAboveStrike({ spot, strike, secondsRemaining: remaining, volPerMinute: vol, spotAgeMs });
  if (!fc) {
    const r = remaining < MIN_TAU_SEC ? `tau ${remaining}s < ${MIN_TAU_SEC}s floor` : spotAgeMs > 15000 ? 'stale spot >15s' : 'no vol';
    return { tradeable: false, reason: r, veto: true, fc: null, spot, strike, remaining };
  }
  const z = fc.z;
  const distanceSigmas = fc.distanceInSigmas;
  // how decisive geometry is
  const decisive = Math.abs(z) > 1.5;
  const coinFlip = Math.abs(z) < 0.2;
  return {
    tradeable: true,
    fc,
    z,
    distanceSigmas,
    spot,
    strike,
    remaining,
    volPerMinute: vol,
    decisive,
    coinFlip,
    probUp: fc.probUp,
    probDown: fc.probDown,
  };
}

export function vetoForOutcome(targetCtx, price, outcome, cfg = {}) {
  if (!targetCtx || targetCtx.veto) return { veto: true, reason: targetCtx?.reason || 'no context' };
  const fc = targetCtx.fc;
  if (!fc) return { veto: true, reason: 'no forecast' };
  const edge = strikeEdge({ probUp: fc.probUp, price, outcome, feeRate: Number(cfg.feeRate ?? 0.07), exitIsSettlement: cfg.holdToSettleFavorites !== false });
  if (!edge) return { veto: false, edge: null };
  if (edge.implausible) {
    return { veto: true, reason: `implausible ${ (edge.grossEdge*100).toFixed(1)}c gap — feed divergence`, edge, implausible: true };
  }
  const vetoEdge = -Number(cfg.strikeForecastVetoEdge ?? 0.04);
  // decisive geometry + negative edge => hard veto
  if (edge.netEdge <= vetoEdge && Math.abs(targetCtx.z) > 0.8) {
    return { veto: true, reason: `forecast ${(edge.modelProb*100).toFixed(0)}% vs ask ${(price*100).toFixed(0)}c edge ${(edge.netEdge*100).toFixed(1)}c z=${targetCtx.z.toFixed(2)}`, edge };
  }
  // short time + low prob for side => unreachable target
  if (targetCtx.remaining < 45) {
    const p = outcome === 'up' ? fc.probUp : fc.probDown;
    if (p < 0.14) return { veto: true, reason: `target unreachable: P(${outcome}) ${(p*100).toFixed(1)}% in ${targetCtx.remaining}s z=${targetCtx.z.toFixed(2)}`, edge };
  }
  return { veto: false, edge, reason: edge.netEdge > 0 ? `edge +${(edge.netEdge*100).toFixed(1)}c` : `thin ${(edge.netEdge*100).toFixed(1)}c` };
}
