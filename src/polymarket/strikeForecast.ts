// @ts-nocheck
/**
 * Probability that a fixed-strike crypto window settles above its strike.
 *
 * ## Why this is the right model for these markets
 *
 * Polymarket's 5m/15m BTC and ETH markets are not "will price go up" in any
 * vague sense. They resolve on a single comparison: the Chainlink close at the
 * window end versus `openPrice`, the spot at the window open. `fetchPriceToBeat`
 * has been retrieving both every scan since long before this file existed, and
 * `buildDecision` never saw either of them — the entry scorer was reading RSI
 * and MACD to guess at a question whose two operands were already in memory.
 *
 * With a known strike `S`, a known spot `P`, and a known time remaining, the
 * question has a closed form. Over a few minutes, log-returns of a liquid
 * crypto pair are well approximated as driftless Gaussian:
 *
 *     ln(P_T / P) ~ N(0, sigma^2 * tau)
 *     P(P_T > S)  = Phi( ln(P / S) / (sigma * sqrt(tau)) )
 *
 * Drift is deliberately omitted. Over a 300-second horizon any plausible drift
 * is an order of magnitude below the noise term, and estimating it from recent
 * candles fits momentum that has already happened — which is precisely the
 * error the rest of the TA stack is already prone to. A driftless model says
 * "the strike is 0.4 sigma away with 90 seconds left", which is a statement
 * about geometry and time, and is the part the market misprices.
 *
 * ## What makes this tradeable
 *
 * The model output is a probability, and the market quotes one: the ask on the
 * UP token is roughly the market-implied P(up). Edge is the difference. Unlike
 * a TA score, this is directly comparable to a price, so it can be netted
 * against fees and turned into a sizing decision without an arbitrary mapping.
 *
 * ## Where it breaks, and what it refuses to do
 *
 * As `tau -> 0` the denominator vanishes and the probability saturates to 0 or
 * 1. That is real — a window with four seconds left genuinely is nearly decided
 * — but a model that returns 0.999 invites betting the account on a stale quote
 * or a Chainlink print that has not landed. `MIN_TAU_SEC` and `MAX_PROB` bound
 * it. Likewise a stale `spot` is far more dangerous here than in a TA signal,
 * because the whole edge is a small difference between two large numbers, so
 * callers must pass a freshness age and the model refuses when it is too old.
 */

/** Below this many seconds remaining, the estimate is not trustworthy. */
export const MIN_TAU_SEC = 20;

/** Spot older than this makes the ln(P/S) term meaningless. */
export const MAX_SPOT_AGE_MS = 15_000;

/** Never claim more certainty than this, regardless of how small tau gets. */
export const MAX_PROB = 0.97;

/** Floor on per-minute vol, guarding a divide-by-zero on a flat candle run. */
export const MIN_VOL_PER_MIN = 1e-5;

/**
 * Beyond this disagreement with the market, the model is wrong — not the market.
 *
 * This bound is the most important line in the file, and it was added after the
 * model was observed claiming a 40-cent edge on a live 5m BTC window.
 *
 * The measurement: strike 78761.18, our spot feed reading 78768.01 — six dollars
 * *above* the strike, 77 seconds left — while the book priced UP at 7.5 cents.
 * Inverting the market's own price through the same model puts its implied spot
 * near 78745, roughly twenty-three dollars below what we were reading. The
 * market was not mispricing anything. These windows settle on Chainlink, our
 * spot arrives from a different feed, and the gap that decides a 5m window is
 * routinely smaller than the disagreement between those two sources.
 *
 * So a large computed edge is evidence of a data fault — a stale tick, a feed
 * that has diverged, a strike from the adjacent window — and never evidence of
 * opportunity. Genuine mispricings in a liquid 5m book are worth a few cents.
 * Sizing up on a 40-cent edge means betting the account precisely when the
 * inputs are least trustworthy, which is the worst available behaviour.
 *
 * Note the asymmetry this creates, which is intended: the model stays useful in
 * the band where it and the market broadly agree and it can sharpen a marginal
 * call, and it switches itself off exactly where it looks most exciting.
 */
export const MAX_PLAUSIBLE_EDGE = 0.15;

/**
 * Abramowitz & Stegun 7.1.26 error function, ~1e-7 absolute.
 *
 * A lookup table or a dependency would both be worse here: this runs a few
 * times per scan and needs to be auditable in one screen.
 */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  // Horner form of the A&S coefficients a1..a5.
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}

/** Standard normal CDF. */
export function normalCdf(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return 0.5;
  return 0.5 * (1 + erf(n / Math.SQRT2));
}

/**
 * Per-minute stdev of log returns from 1m candles.
 *
 * Sample stdev of `ln(c[i]/c[i-1])`. `lookback` of 30 is a compromise: long
 * enough that the estimate is not dominated by a single bar, short enough that
 * it tracks the volatility regime the window will actually settle in.
 */
export function realizedVolPerMinute(candles, lookback = 30) {
  if (!Array.isArray(candles) || candles.length < 5) return null;
  const closes = candles.slice(-(lookback + 1)).map((c) => Number(c?.close ?? c)).filter(Number.isFinite);
  if (closes.length < 5) return null;

  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 4) return null;

  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(Math.max(0, variance));
  return Number.isFinite(sd) && sd > 0 ? sd : null;
}

/**
 * Per-minute vol from whatever the signal object actually carries.
 *
 * `analyze()` publishes `volatility.atrPct` on every signal but does not expose
 * the candle series outside the signal module, so at the decision layer ATR is
 * the only volatility estimate available. ATR is a range statistic, not a
 * standard deviation, and using it directly as sigma would overstate volatility
 * by about 60% — which biases every forecast toward 0.5 and quietly throws away
 * the edge this model exists to find.
 *
 * For a driftless Brownian path the expected high-low range over a period is
 * `sigma * sqrt(8/pi)`, about `1.596 * sigma`. Dividing by that recovers a
 * usable sigma. It is an approximation on real candles, which have jumps and
 * finite sampling, but it is the right order of magnitude and errs slightly
 * high, meaning the forecast stays conservative.
 */
export const ATR_TO_SIGMA = Math.sqrt(8 / Math.PI);

export function volPerMinuteFromSignal(signal, candles = null) {
  const measured = realizedVolPerMinute(candles);
  if (measured != null) return measured;

  const atrPct = Number(signal?.volatility?.atrPct);
  if (!Number.isFinite(atrPct) || atrPct <= 0) return null;
  // atrPct is a percentage of price; convert to a fraction, then to sigma.
  const sigma = (atrPct / 100) / ATR_TO_SIGMA;
  return sigma > MIN_VOL_PER_MIN ? sigma : null;
}

/**
 * P(settle above strike).
 *
 * Returns `null` — never a default probability — whenever an input is missing,
 * stale, or out of domain. A caller that cannot distinguish "no opinion" from
 * "50/50" will size a coin flip as if it were a read, so the absence of an
 * answer has to be representable.
 */
export function forecastAboveStrike({
  spot,
  strike,
  secondsRemaining,
  volPerMinute,
  spotAgeMs = 0,
} = {}) {
  const P = Number(spot);
  const S = Number(strike);
  const tau = Number(secondsRemaining);
  const sigma = Number(volPerMinute);

  if (!(P > 0) || !(S > 0)) return null;
  if (!Number.isFinite(tau) || tau < MIN_TAU_SEC) return null;
  if (!Number.isFinite(sigma) || sigma < MIN_VOL_PER_MIN) return null;
  if (Number(spotAgeMs) > MAX_SPOT_AGE_MS) return null;

  // sigma is per minute; scale to the remaining horizon in minutes.
  const sigmaTau = sigma * Math.sqrt(tau / 60);
  if (!(sigmaTau > 0)) return null;

  const logDistance = Math.log(P / S);
  const z = logDistance / sigmaTau;
  const raw = normalCdf(z);
  const probUp = Math.min(MAX_PROB, Math.max(1 - MAX_PROB, raw));

  return {
    probUp,
    probDown: 1 - probUp,
    z,
    sigmaTau,
    logDistance,
    // How far the strike sits from spot, in units of remaining-horizon vol.
    // This is the number worth logging: |z| < 0.2 is a coin flip no matter what
    // the TA stack thinks, and |z| > 1.5 is close to decided.
    distanceInSigmas: z,
  };
}

/**
 * Edge on one side, net of the round-trip taker fee.
 *
 * Polymarket's fee is `shares * rate * p * (1 - p)`, which per unit of notional
 * is `rate * (1 - p)` — cheaper the more expensive the contract. Netting it here
 * rather than at sizing time means a candidate that only looks profitable
 * because the fee was ignored never reaches the scorer. Measured on 34 closed
 * trades: fees were 3.49% of notional against a gross edge of 2.3%, so an
 * un-netted edge is not a smaller version of the truth, it has the wrong sign.
 *
 * `exitIsSettlement` reflects that redemption at window end pays no taker fee,
 * so a hold-to-settle plan carries roughly half the cost of a round trip.
 */
export function strikeEdge({
  probUp,
  price,
  outcome = 'up',
  feeRate = 0.07,
  exitIsSettlement = true,
} = {}) {
  const p = Number(price);
  const pu = Number(probUp);
  if (!(p > 0) || !(p < 1) || !Number.isFinite(pu)) return null;

  const modelProb = outcome === 'down' ? 1 - pu : pu;
  const grossEdge = modelProb - p;

  const entryFeeFrac = feeRate * (1 - p);
  const exitFeeFrac = exitIsSettlement ? 0 : feeRate * (1 - p);
  const feeFrac = entryFeeFrac + exitFeeFrac;

  const netEdge = grossEdge - feeFrac;

  return {
    modelProb,
    marketProb: p,
    grossEdge,
    feeFrac,
    netEdge,
    // Edge per unit of risk, which is what sizing should scale on.
    edgeRatio: p > 0 ? netEdge / p : 0,
    /**
     * True when the disagreement is too large to be real. Callers must check
     * this before acting on `netEdge` in either direction — an implausible
     * edge is equally untrustworthy as a reason to buy and as a reason to veto,
     * because the same bad spot produces both.
     */
    implausible: Math.abs(grossEdge) > MAX_PLAUSIBLE_EDGE,
  };
}
