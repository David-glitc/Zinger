// @ts-nocheck
export { buildObservabilitySnapshot, sessionTrades, closedPaperTrades } from './snapshot.js';
export { deriveObservabilityAlerts } from './alerts.js';

import { buildObservabilitySnapshot } from './snapshot.js';
import { deriveObservabilityAlerts } from './alerts.js';

/**
 * Full observability bundle for API, SSE, and external observers.
 */
export function buildObservabilityBundle(state, signalHealth = null, extras = {}) {
  const snapshot = buildObservabilitySnapshot(state, signalHealth, extras);
  const { alerts, status, canTrade } = deriveObservabilityAlerts(snapshot);
  return {
    ok: status !== 'error',
    status,
    canTrade,
    snapshot,
    alerts,
    telemetry: extras.telemetry || null,
    packages: extras.packages || null,
    updatedAt: Date.now(),
  };
}
