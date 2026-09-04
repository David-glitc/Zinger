// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetSignalHealth,
  recordFusedSignal,
  recordMlPrediction,
  getSignalHealth,
  mlOverrideAllowed,
  MIN_SAMPLES,
  SATURATION_LIMIT,
} from '../../src/polymarket/signalHealth.js';

const comps = (momVote = 0.2) => [
  { id: 'TA_MEANREV', vote: 0.1 },
  { id: 'TA_MOMENTUM', vote: momVote },
];

/** A healthy scan: alternating direction, sane MACD, unsaturated components. */
function healthyScan(i) {
  return {
    direction: i % 2 ? 'up' : 'down',
    confidence: 0.4,
    components: comps(0.2),
    analysis: { macd: { histPct: 0.01 } },
  };
}

describe('signalHealth', () => {
  beforeEach(() => resetSignalHealth());

  it('reports ok on a healthy mixed stream', () => {
    for (let i = 0; i < MIN_SAMPLES + 5; i++) recordFusedSignal(healthyScan(i));
    const h = getSignalHealth();
    expect(h.status).toBe('ok');
    expect(h.directionalTrustworthy).toBe(true);
  });

  it('does not fail on thin data at cold start', () => {
    recordFusedSignal(healthyScan(0));
    const h = getSignalHealth();
    expect(h.status).toBe('ok');
    expect(h.checks.find((c) => c.id === 'direction_degenerate').pending).toBe(true);
  });

  // The exact break of 2026-08-31: hist came out near minus the asset price.
  it('fails when the MACD histogram is at price scale rather than percent', () => {
    recordFusedSignal({
      direction: 'down',
      confidence: 0.4,
      components: comps(),
      analysis: { macd: { histPct: -62751 } },
    });
    const h = getSignalHealth();
    expect(h.status).toBe('fail');
    expect(h.checks.find((c) => c.id === 'macd_scale').status).toBe('fail');
  });

  it('fails when a component is pinned at the clamp bound', () => {
    for (let i = 0; i < SATURATION_LIMIT + 1; i++) {
      recordFusedSignal({ ...healthyScan(i), components: comps(-1) });
    }
    const h = getSignalHealth();
    expect(h.status).toBe('fail');
    const sat = h.checks.find((c) => c.id === 'saturation');
    expect(sat.component).toBe('TA_MOMENTUM');
  });

  it('clears a saturation run once the component moves again', () => {
    for (let i = 0; i < SATURATION_LIMIT + 1; i++) {
      recordFusedSignal({ ...healthyScan(i), components: comps(-1) });
    }
    recordFusedSignal(healthyScan(0));
    expect(getSignalHealth().checks.some((c) => c.id === 'saturation')).toBe(false);
  });

  it('fails when the fused direction distribution collapses onto one side', () => {
    for (let i = 0; i < MIN_SAMPLES + 5; i++) {
      recordFusedSignal({ ...healthyScan(i), direction: 'down' });
    }
    const h = getSignalHealth();
    expect(h.status).toBe('fail');
    expect(h.checks.find((c) => c.id === 'direction_degenerate').value).toBe('down');
    expect(h.directionalTrustworthy).toBe(false);
  });

  it('fails when one modality goes dark while its peers report', () => {
    for (let i = 0; i < 8; i++) {
      recordFusedSignal({ ...healthyScan(i), components: [{ id: 'TA_MEANREV', vote: 0.1 }] });
    }
    const missing = getSignalHealth().checks.find((c) => c.id === 'component_missing');
    expect(missing.component).toBe('TA_MOMENTUM');
  });

  // Regression: the check read `signal.alpha` while applyAlphaFusion attaches
  // `.alphaFusion`, so no component was ever recorded and a healthy bot was
  // suspended for a "dead modality".
  it('reads components from the alphaFusion key the pipeline actually sets', () => {
    for (let i = 0; i < 8; i++) {
      recordFusedSignal({
        direction: i % 2 ? 'up' : 'down',
        confidence: 0.3,
        alphaFusion: { components: comps(0.2) },
        macd: { histPct: 0.01 },
      });
    }
    const h = getSignalHealth();
    expect(h.checks.some((c) => c.id === 'component_missing')).toBe(false);
    expect(h.status).toBe('ok');
  });

  it('warns rather than halting when no components are recorded at all', () => {
    for (let i = 0; i < 8; i++) {
      recordFusedSignal({ direction: 'up', confidence: 0.3, macd: { histPct: 0.01 } });
    }
    const h = getSignalHealth();
    expect(h.checks.find((c) => c.id === 'components_uninstrumented').status).toBe('warn');
    // An instrumentation gap must not suspend trading.
    expect(h.directionalTrustworthy).toBe(true);
  });

  it('fails when confidence escapes the shared cap', () => {
    recordFusedSignal({ ...healthyScan(0), confidence: 0.86 });
    const h = getSignalHealth();
    expect(h.checks.find((c) => c.id === 'confidence_cap').status).toBe('fail');
  });
});

describe('mlOverrideAllowed', () => {
  beforeEach(() => resetSignalHealth());

  it('allows the override before there are enough predictions to judge', () => {
    for (let i = 0; i < MIN_SAMPLES - 1; i++) recordMlPrediction({ direction: 1 });
    expect(mlOverrideAllowed().allowed).toBe(true);
  });

  // The measured case: 545 of 545 predictions were "up".
  it('blocks the override when the model always answers the same thing', () => {
    for (let i = 0; i < MIN_SAMPLES + 5; i++) recordMlPrediction({ direction: 1 });
    const gate = mlOverrideAllowed();
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('up');
  });

  // The override guard is the mitigation; suspending trading on top of it would
  // penalise a healthy TA signal for a broken model.
  it('warns rather than failing on a degenerate model, since the override is already blocked', () => {
    for (let i = 0; i < MIN_SAMPLES + 5; i++) {
      recordMlPrediction({ direction: 1 });
      recordFusedSignal(healthyScan(i));
    }
    const h = getSignalHealth();
    expect(h.checks.find((c) => c.id === 'ml_degenerate').status).toBe('warn');
    expect(h.status).toBe('warn');
    expect(h.directionalTrustworthy).toBe(true);
    expect(mlOverrideAllowed().allowed).toBe(false);
  });

  it('allows the override for a model with a real spread of opinions', () => {
    for (let i = 0; i < MIN_SAMPLES + 5; i++) recordMlPrediction({ direction: i % 3 ? 1 : -1 });
    expect(mlOverrideAllowed().allowed).toBe(true);
  });

  it('ignores neutral predictions rather than counting them as a side', () => {
    for (let i = 0; i < MIN_SAMPLES + 5; i++) recordMlPrediction({ direction: 'neutral' });
    expect(mlOverrideAllowed().allowed).toBe(true);
  });
});
