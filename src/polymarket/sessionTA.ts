// @ts-nocheck
/**
 * Deterministic short-session TA — horizon-scaled view of the generic signal.
 * Generic TA (signal.ts analyze) is ~200x1m lookback. For a 5m window with tau remaining,
 * short momentum must dominate, long MA/ADX must fade.
 * Returns a horizon-adjusted score contribution and veto flags.
 */
import { clampConfidence } from './confidenceScale.js';

export function horizonScale(fracRemaining) {
  const f = Math.max(0, Math.min(1, Number(fracRemaining) || 0));
  // front-loaded: last 30% of window, short signal dominates
  return { shortW: 1 + (1 - f) * 1.2, longW: 0.3 + f * 0.7, timePressure: 1 - f };
}

export function sessionTA({ signal, remaining, windowSec }) {
  if (!signal) return { scoreAdj: 0, veto: false, reasons: ['no signal'] };
  const win = Number(windowSec || 300);
  const rem = Number(remaining || 0);
  const frac = win > 0 ? rem / win : 0;
  const { shortW, longW, timePressure } = horizonScale(frac);

  let adj = 0;
  const reasons = [];
  let veto = false;

  // Scale momentum: m1 is most horizon-relevant
  const m1 = Number(signal.momentum?.m1 || 0);
  const m5 = Number(signal.momentum?.m5 || 0);
  const m15 = Number(signal.momentum?.m15 || 0);
  const origMom = m1*8 + m5*3;
  const scaledMom = m1*8*shortW + m5*3*0.6*longW + m15*0.5*longW;
  const momDelta = (scaledMom - origMom) * 0.15;
  adj += momDelta;
  if (Math.abs(momDelta) > 0.4) reasons.push(`mom horizon x${shortW.toFixed(2)}`);

  // RSI/BB long mean-reversion fades near expiry — no time to revert
  if (rem < 60) {
    const over = signal.rsi > 72 || signal.rsi < 28;
    if (over) {
      adj -= Math.sign(signal.score || 0) * 0.8;
      reasons.push('rsi mean-rev faded <60s');
    }
    // BB squeeze near expiry is not a setup — it's stasis
    if (signal.bb?.width < 2.5) {
      reasons.push('bb squeeze <60s — decay');
      adj *= 0.7;
    }
  }

  // ADX trend strength is stale near expiry — decay its contribution
  if (rem < 90 && Math.abs(signal.adx?.adx || 0) > 35) {
    adj -= 0.5;
    reasons.push('adx long trend decay');
  }

  // Vol regime: high atrPct near expiry => veto (no traversal)
  const atrPct = Number(signal.volatility?.atrPct || 0);
  if (atrPct > 0.55 && rem < 90) {
    veto = true;
    reasons.push(`atr ${atrPct.toFixed(2)}% too volatile for ${rem}s`);
  }

  // Time pressure: if signal says up but price already near top (0.78+) with <60s, it's priced in
  // caller will provide price separately; we just flag pressure here

  return {
    scoreAdj: Math.round(adj*10)/10,
    veto,
    reasons,
    fracRemaining: Math.round(frac*1000)/1000,
    horizon: { shortW: Math.round(shortW*100)/100, longW: Math.round(longW*100)/100, timePressure: Math.round(timePressure*100)/100 },
  };
}
