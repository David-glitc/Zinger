// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { buildObservabilitySnapshot } from '../../src/polymarket/observability/snapshot.js';
import { deriveObservabilityAlerts } from '../../src/polymarket/observability/alerts.js';

describe('observability', () => {
  it('flags orphan paper and stale scan', () => {
    const state = {
      running: true,
      scanning: false,
      lastScan: Date.now() - 120_000,
      session: { id: 's1', startedAt: Date.now() - 60_000 },
      trades: [],
      positions: [{
        id: 'p1',
        mode: 'paper',
        closed: false,
        slug: 'btc-updown-5m-1000',
        symbol: 'BTC',
        outcome: 'up',
      }],
      config: { paperBankroll: 1000, maxOpenPositions: 4 },
      governor: {},
      dataAssurance: { canBuy: false, blocking: ['orphan_paper'], warnings: [], checks: [] },
    };
    const snap = buildObservabilitySnapshot(state, { status: 'ok', directionalTrustworthy: true, checks: [] });
    expect(snap.orphans.length).toBe(1);
    const { alerts, status } = deriveObservabilityAlerts(snap);
    expect(status).toBe('error');
    expect(alerts.some((a) => a.id.startsWith('orphan_'))).toBe(true);
    expect(alerts.some((a) => a.id === 'stale_scan')).toBe(true);
  });

  it('reports healthy when all gates pass', () => {
    const state = {
      running: true,
      lastScan: Date.now() - 2000,
      session: { id: 's2', startedAt: Date.now() - 60_000 },
      trades: [],
      positions: [],
      config: { paperBankroll: 1000 },
      governor: { regime: 'scalp' },
      dataAssurance: { canBuy: true, blocking: [], warnings: [], score: 100, checks: [] },
      stats: { scansDone: 42 },
    };
    const snap = buildObservabilitySnapshot(state, { status: 'ok', directionalTrustworthy: true, checks: [] });
    const { alerts, status, canTrade } = deriveObservabilityAlerts(snap);
    expect(status).toBe('ok');
    expect(canTrade).toBe(true);
    expect(alerts.some((a) => a.id === 'healthy')).toBe(true);
  });
});
