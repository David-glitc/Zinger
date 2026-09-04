// @ts-nocheck
/**
 * Runtime revalidation for the signal pipeline.
 *
 * ## Why this exists
 *
 * On 2026-08-31 the bot was found to be structurally incapable of taking a
 * bearish trade. `macd()` built its signal line with
 * `ema([...prices.slice(-9), m], 9)` — nine raw closes with one MACD value
 * appended — and since `ema()` seeds from the mean of the first `period`
 * elements, the seed was ~110,000 rather than ~5. `hist` came out at roughly
 * minus the asset price (measured: -62751), `clamp11(... + macdH * 40)`
 * saturated at -1 on every scan, and across 800 bars the fused signal printed
 * 639 down, 161 neutral and 0 up. The ML overlay then disagreed every time and
 * flipped all of it to "up", so 35 of 36 trades went one way.
 *
 * Every individual number involved was finite, in range, and plausible on its
 * own. Nothing threw. The failure was only visible in the *distribution* of
 * outputs over time, and nothing was looking at that. Config validation would
 * not have caught it; neither would a unit test of any single function.
 *
 * So these are the checks that operate on aggregates and on cross-field
 * relationships — the two places a silent numerical break can hide:
 *
 *   scale        an indicator's magnitude against what its own units allow
 *   saturation   a component pinned at a clamp bound scan after scan
 *   degeneracy   an output distribution collapsed onto one value
 *   liveness     a modality that has silently dropped out of the blend
 *
 * ## What a failure does
 *
 * `fail` on a directional input is not a reason to keep trading with a
 * different number — it means the number is not trustworthy, so the honest
 * response is to stop expressing a directional view. Callers degrade to
 * arb-only rather than halting outright, because the arb engine reads none of
 * this and stays valid.
 *
 * This module only *reports*. It holds the rolling state and grades it; the
 * decision to degrade lives with the caller, so the checks stay testable and
 * this file can never itself take the bot down.
 */

/** Rolling window length for distribution checks. */
export const WINDOW = 60;

/** Consecutive saturated scans before a component is considered stuck. */
export const SATURATION_LIMIT = 12;

/**
 * A direction distribution is degenerate past this share.
 *
 * 0.85 rather than something tighter: a genuinely trending hour can legitimately
 * print one direction 80% of the time, and crying wolf on a real trend would
 * train the operator to ignore this. The broken pipeline sat at 100%.
 */
export const DEGENERACY_SHARE = 0.85;

/** Minimum samples before a distribution check is allowed to fail. */
export const MIN_SAMPLES = 25;

/**
 * MACD is denominated in price. Expressed as a percent of price, a histogram
 * beyond this is not a market move, it is a units bug. Measured range on 600
 * live bars of each of BTC and ETH after the repair: -0.049 to 0.061.
 */
export const MAX_MACD_HIST_PCT = 1.0;

const OK = 'ok';
const WARN = 'warn';
const FAIL = 'fail';

function emptyState() {
  return {
    directions: [],
    confidences: [],
    mlDirections: [],
    saturationRun: {},
    componentSeen: {},
    scans: 0,
    lastAt: 0,
  };
}

let _state = emptyState();

/** Test seam. */
export function resetSignalHealth() {
  _state = emptyState();
}

function pushCapped(arr, value, cap = WINDOW) {
  arr.push(value);
  if (arr.length > cap) arr.shift();
  return arr;
}

function share(arr, predicate) {
  if (!arr.length) return 0;
  return arr.filter(predicate).length / arr.length;
}

function topShare(arr) {
  if (!arr.length) return { value: null, share: 0 };
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  let best = null;
  let bestN = 0;
  for (const [v, n] of Object.entries(counts)) {
    if (n > bestN) { best = v; bestN = n; }
  }
  return { value: best, share: bestN / arr.length };
}

/**
 * Record one scan's signal output.
 *
 * `fused.components` is the alphaFusion component array; `analysis` is the raw
 * `analyze()` result. Both are optional so a partial scan still advances the
 * counters it can.
 */
export function recordSignalSample({ analysis = null, fused = null, ml = null, at = Date.now() } = {}) {
  _state.scans += 1;
  _state.lastAt = at;

  if (fused?.direction) pushCapped(_state.directions, fused.direction);
  if (Number.isFinite(fused?.confidence)) pushCapped(_state.confidences, Number(fused.confidence));
  if (ml?.direction != null && ml.direction !== 'neutral' && ml.direction !== 0) {
    const dir = ml.direction === 1 || ml.direction === 'up' ? 'up' : 'down';
    pushCapped(_state.mlDirections, dir);
  }

  for (const comp of fused?.components || []) {
    const id = comp?.id;
    if (!id) continue;
    _state.componentSeen[id] = at;
    const saturated = Math.abs(Number(comp.vote ?? 0)) >= 0.999;
    _state.saturationRun[id] = saturated ? (_state.saturationRun[id] || 0) + 1 : 0;
  }

  if (analysis) _state._lastAnalysis = analysis;
  return _state;
}

/**
 * Record one ML prediction on its own.
 *
 * Separate from `recordSignalSample` because the scan loop sees ML output once
 * per asset per scan, and folding that into the scan counter would make the
 * saturation and liveness windows count double.
 */
export function recordMlPrediction(ml) {
  if (ml?.direction == null || ml.direction === 'neutral' || ml.direction === 0) return;
  const dir = ml.direction === 1 || ml.direction === 'up' ? 'up' : 'down';
  pushCapped(_state.mlDirections, dir);
}

/** Record the fused signal actually handed to the engines. */
export function recordFusedSignal(signal) {
  if (!signal) return;
  if (signal.direction) pushCapped(_state.directions, signal.direction);
  if (Number.isFinite(signal.confidence)) pushCapped(_state.confidences, Number(signal.confidence));
  // `applyAlphaFusion` attaches the fused result as `.alphaFusion`. Reading the
  // wrong key here is not a silent miss: an empty component list looks exactly
  // like a dead modality, so the liveness check fires and suspends directional
  // trading on a signal that was in fact healthy.
  for (const comp of signal.alphaFusion?.components || signal.alpha?.components || signal.components || []) {
    const id = comp?.id;
    if (!id) continue;
    _state.componentSeen[id] = Date.now();
    const saturated = Math.abs(Number(comp.vote ?? 0)) >= 0.999;
    _state.saturationRun[id] = saturated ? (_state.saturationRun[id] || 0) + 1 : 0;
  }
  if (signal.macd || signal.analysis) _state._lastAnalysis = signal.analysis || signal;
  _state.scans += 1;
  _state.lastAt = Date.now();
}

function check(id, status, message, detail = {}) {
  return { id, status, message, ...detail };
}

/**
 * Grade everything recorded so far.
 *
 * Returns `{ status, checks, sampleCount }` where `status` is the worst
 * individual grade. Checks that lack the samples to be meaningful report `ok`
 * with `pending: true` rather than failing on thin data — a cold start must not
 * look like a broken pipeline.
 */
export function getSignalHealth({ confCap = 0.65 } = {}) {
  const checks = [];
  const n = _state.directions.length;

  // ── scale: MACD histogram in percent-of-price terms ──────────────
  const histPct = Number(_state._lastAnalysis?.macd?.histPct);
  if (Number.isFinite(histPct)) {
    const abs = Math.abs(histPct);
    checks.push(abs > MAX_MACD_HIST_PCT
      ? check('macd_scale', FAIL,
        `MACD histogram ${histPct.toFixed(3)}% of price exceeds ${MAX_MACD_HIST_PCT}% — units bug, not a market move`,
        { value: histPct })
      : check('macd_scale', OK, `MACD histogram ${histPct.toFixed(4)}% of price`, { value: histPct }));
  } else {
    checks.push(check('macd_scale', _state.scans > 3 ? WARN : OK,
      'MACD histPct missing — alphaFusion momentum will read 0', { pending: _state.scans <= 3 }));
  }

  // ── saturation: a component pinned at a clamp bound ──────────────
  for (const [id, run] of Object.entries(_state.saturationRun)) {
    if (run >= SATURATION_LIMIT) {
      checks.push(check('saturation', FAIL,
        `${id} pinned at clamp bound for ${run} consecutive scans — it cannot influence the blend`,
        { component: id, run }));
    }
  }

  // ── liveness: a modality that dropped out ────────────────────────
  //
  // "No components at all" and "every component but this one" are different
  // failures and must not share a verdict. The first means we are reading the
  // wrong field or fusion never ran — an instrumentation fault, where halting
  // directional trading punishes the operator for a defect in the monitoring
  // rather than in the signal. (Measured: this check read `signal.alpha` while
  // `applyAlphaFusion` attaches `.alphaFusion`, and suspended a healthy bot.)
  // The second is real evidence that one modality has gone dark while its peers
  // report normally, which is worth stopping for.
  const expected = ['TA_MEANREV', 'TA_MOMENTUM'];
  const anySeen = Object.keys(_state.componentSeen).length > 0;
  if (_state.scans > 5 && !anySeen) {
    checks.push(check('components_uninstrumented', WARN,
      'no fusion components recorded — signal health cannot see the blend, check the field name',
      { instrumentation: true }));
  } else if (anySeen) {
    for (const id of expected) {
      if (_state.scans > 5 && !_state.componentSeen[id]) {
        checks.push(check('component_missing', FAIL,
          `${id} has never appeared in the fusion components — modality is dead`, { component: id }));
      }
    }
  }

  // ── degeneracy: fused direction distribution ─────────────────────
  const dirTop = topShare(_state.directions);
  if (n >= MIN_SAMPLES) {
    checks.push(dirTop.share > DEGENERACY_SHARE
      ? check('direction_degenerate', FAIL,
        `fused direction is "${dirTop.value}" on ${(dirTop.share * 100).toFixed(0)}% of the last ${n} scans`,
        { value: dirTop.value, share: dirTop.share, samples: n })
      : check('direction_degenerate', OK,
        `direction spread across ${n} scans, top side ${(dirTop.share * 100).toFixed(0)}%`,
        { share: dirTop.share, samples: n }));
  } else {
    checks.push(check('direction_degenerate', OK, `only ${n}/${MIN_SAMPLES} samples`, { pending: true, samples: n }));
  }

  // ── degeneracy: ML predictions ───────────────────────────────────
  const mlTop = topShare(_state.mlDirections);
  const mlN = _state.mlDirections.length;
  if (mlN >= MIN_SAMPLES) {
    // WARN, not FAIL. A degenerate model is a real defect, but `mlOverrideAllowed`
    // already refuses to let it flip the direction, so the signal reaching the
    // engines is the TA read — which has its own checks above. Failing here too
    // would suspend directional trading on a pipeline we have already made safe,
    // punishing the bot twice for one broken input. Observed live: the 5m model
    // returned "up" on 60 of 60 predictions while the fused direction stayed
    // healthy at a 72% top-side split.
    checks.push(mlTop.share > DEGENERACY_SHARE
      ? check('ml_degenerate', WARN,
        `ML predicted "${mlTop.value}" on ${(mlTop.share * 100).toFixed(0)}% of the last ${mlN} predictions — override suppressed, TA read stands`,
        { value: mlTop.value, share: mlTop.share, samples: mlN })
      : check('ml_degenerate', OK,
        `ML spread across ${mlN} predictions, top side ${(mlTop.share * 100).toFixed(0)}%`,
        { share: mlTop.share, samples: mlN }));
  } else {
    checks.push(check('ml_degenerate', OK, `only ${mlN}/${MIN_SAMPLES} ML samples`, { pending: true, samples: mlN }));
  }

  // ── confidence within the shared cap ─────────────────────────────
  if (_state.confidences.length) {
    const max = Math.max(..._state.confidences);
    checks.push(max > confCap + 1e-9
      ? check('confidence_cap', FAIL,
        `confidence reached ${max.toFixed(3)}, above the ${confCap} cap — a stage is bypassing clampConfidence`,
        { value: max })
      : check('confidence_cap', OK, `peak confidence ${max.toFixed(3)} within ${confCap}`, { value: max }));
  }

  const status = checks.some((c) => c.status === FAIL)
    ? FAIL
    : checks.some((c) => c.status === WARN) ? WARN : OK;

  return {
    status,
    checks,
    sampleCount: n,
    scans: _state.scans,
    lastAt: _state.lastAt,
    // The one thing a caller needs without reading the whole list.
    directionalTrustworthy: status !== FAIL,
  };
}

/**
 * Whether the ML override may flip the fused direction right now.
 *
 * Separated from the full report because the scan loop asks this question on
 * every asset every scan and should not pay for the rest of the grading.
 */
export function mlOverrideAllowed() {
  const mlN = _state.mlDirections.length;
  if (mlN < MIN_SAMPLES) return { allowed: true, reason: null };
  const top = topShare(_state.mlDirections);
  if (top.share > DEGENERACY_SHARE) {
    return {
      allowed: false,
      reason: `ML predicted "${top.value}" on ${(top.share * 100).toFixed(0)}% of the last ${mlN} — degenerate, not evidence`,
    };
  }
  return { allowed: true, reason: null };
}
