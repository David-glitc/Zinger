// @ts-nocheck
/**
 * The one definition of what a confidence number means in this system.
 *
 * `0.65` was being re-declared as a local constant in five places
 * (`signal.ts`, `scan/inputs.ts` x3, `confidence.ts`, `kelly.ts`,
 * `engines/directional.ts`) and every one of them clamped to it — except
 * `alphaFusion`, which computed confidence with its own formula:
 *
 *     clamp01(0.5 + mag * 0.5) * 0.6 + baseConf * 0.4 * volScale
 *
 * That has two defects. Its maximum is `0.6 + 0.65 * 0.4 = 0.86`, so the fused
 * value escaped the cap that every other stage enforced. And its minimum is
 * `0.5 * 0.6 = 0.30` at `mag = 0` — a signal carrying no directional
 * information at all still announced 30% confidence, which is not a floor so
 * much as a fabrication. Since `applyAlphaFusion` overwrites `analysis.confidence`
 * with this value, the fabricated floor was what the rest of the pipeline saw.
 *
 * Confidence here is an ordinal in `[0, CONF_CAP]`. It is not a probability and
 * is not calibrated as one; `CONF_CAP` exists because inflated certainty
 * produced bad TP/SL placement, not because 0.65 is a meaningful likelihood.
 */

/** Upper bound on any confidence anywhere in the pipeline. */
export const CONF_CAP = 0.65;

/**
 * What `analyze()` reports when its additive score is exactly zero.
 *
 * `signal.ts` computes `0.28 + absScore * 0.055`, so 0.28 is the no-information
 * reading and anything at or below it carries no directional content.
 */
export const CONF_FLOOR = 0.28;

/**
 * Calibrated gate levels for the repaired scale.
 *
 * Every confidence threshold in this system was tuned against the pre-repair
 * scale, which had a fabricated 0.30 floor and could reach 0.86. Those numbers
 * described a distribution that no longer exists: with `macd()` fixed and the
 * floor removed, the fused confidence measured over 1,400 live BTC and ETH bars
 * is
 *
 *   p10 0.053 · p25 0.095 · p50 0.142 · p80 0.215 · p90 0.256 · max 0.455
 *
 * so a threshold of 0.50 — what the paper profile carried — is not strict, it is
 * unreachable, and the bot would simply never trade again. The levels below are
 * chosen by measured pass rate rather than by rescaling the old constants,
 * because the old constants were fitted to a broken signal and carry no
 * information worth preserving.
 *
 * Pass rates at each level, and the side split at that level (the split is what
 * confirms the repair: before it, every threshold gave 100% one side):
 *
 *   LOOSE     0.20   25.1% of scans    163 up / 184 down
 *   STANDARD  0.22   ~20%
 *   STRICT    0.25   11.5% of scans     78 up /  83 down
 *
 * These are TA-only measurements taken without an order book or ML input, so
 * live values run slightly higher; treat them as a floor to re-measure against,
 * not as a permanent fit.
 */
export const CONF_GATE = Object.freeze({
  /** Excludes noise but keeps roughly a quarter of scans. */
  LOOSE: 0.20,
  /** Default directional entry bar. */
  STANDARD: 0.22,
  /** Live, and any regime that should trade rarely. */
  STRICT: 0.25,
  /**
   * "Was this a real directional read at all" — used to decide whether a trade
   * belongs in the expectancy sample, not whether to take it. Deliberately low.
   */
  SAMPLE_FLOOR: 0.15,
});

/**
 * Confidence band that position sizing interpolates across.
 *
 * Sizing needs a different mapping from gating. A gate asks "is this above the
 * bar", so it can use a single level; sizing asks "how much better than the bar
 * is this", which needs the range the signal actually occupies. Feeding raw
 * confidence into a sizing formula silently assumes the value spans `[0, 1]`,
 * and it does not — post-repair it spans roughly `[0.05, 0.46]`.
 *
 * The cost of that assumption was concrete. `computeKellySize` sized on
 * `0.15 + conf * 0.25`; at a realistic 0.22 that is 0.205, and at the best
 * signal ever measured (0.455) it is 0.264. So the strongest read the system can
 * produce sized within a few percent of the weakest one, and the top two-thirds
 * of the range was unreachable — sizing was effectively flat and near its floor
 * regardless of signal quality.
 *
 * `HI` is set near the observed maximum rather than at `CONF_CAP`, because
 * interpolating to a ceiling the signal never reaches wastes most of the range.
 */
export const CONF_SIZING_LO = 0.12;
export const CONF_SIZING_HI = 0.40;

/**
 * Map confidence onto `[0, 1]` across the band sizing actually cares about.
 *
 * Returns 0 at or below `CONF_SIZING_LO` and 1 at or above `CONF_SIZING_HI`, so
 * callers can interpolate their own size range over the full span.
 */
export function sizingScalar(confidence) {
  const n = Number(confidence);
  if (!Number.isFinite(n)) return 0;
  const span = CONF_SIZING_HI - CONF_SIZING_LO;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (n - CONF_SIZING_LO) / span));
}

/** Clamp any confidence-like value into the canonical range. */
export function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(CONF_CAP, n));
}

/**
 * Map a base-TA confidence onto `[0, 1]` by how far it sits above the
 * no-information floor, so a zero-score signal contributes zero rather than
 * dragging a fabricated 0.28 into every blend.
 */
export function baseConfidenceMagnitude(baseConf) {
  const n = Number(baseConf);
  if (!Number.isFinite(n)) return 0;
  const span = CONF_CAP - CONF_FLOOR;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (n - CONF_FLOOR) / span));
}

/**
 * Fused confidence from a signed alpha magnitude and the base TA confidence.
 *
 * Both inputs are magnitudes in `[0, 1]`, blended 60/40 toward the fused alpha
 * and then scaled by `CONF_CAP`, which makes exceeding the cap structurally
 * impossible instead of merely clamped after the fact. `volScale` de-rates the
 * base-TA half only, matching the previous intent: high idiosyncratic vol should
 * discount the slower TA read, not the live fused one.
 */
export function fusedConfidence(alphaMagnitude, baseConf, volScale = 1) {
  const mag = Math.max(0, Math.min(1, Number(alphaMagnitude) || 0));
  const baseMag = baseConfidenceMagnitude(baseConf);
  const vs = Math.max(0, Math.min(1, Number.isFinite(Number(volScale)) ? Number(volScale) : 1));
  const blended = Math.max(0, Math.min(1, 0.6 * mag + 0.4 * baseMag * vs));
  return blended * CONF_CAP;
}
