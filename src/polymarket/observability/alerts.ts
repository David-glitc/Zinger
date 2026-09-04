// @ts-nocheck
/**
 * Derive actionable alerts from an observability snapshot.
 */

const SEVERITY_RANK = { ok: 0, info: 1, warn: 2, error: 3 };

function maxSeverity(a, b) {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * @returns {{ alerts: object[], status: 'ok'|'warn'|'error', canTrade: boolean }}
 */
export function deriveObservabilityAlerts(snapshot) {
  const alerts = [];
  let status = 'ok';
  let canTrade = Boolean(snapshot.running && snapshot.dataAssurance?.canBuy);

  if (!snapshot.running) {
    alerts.push({
      id: 'bot_stopped',
      severity: 'warn',
      title: 'Bot stopped',
      detail: 'Trading loop is not running — start the bot to resume scans.',
    });
    status = maxSeverity(status, 'warn');
    canTrade = false;
  }

  if (snapshot.running && snapshot.lastScanAgeMs != null && snapshot.lastScanAgeMs > 60_000) {
    alerts.push({
      id: 'stale_scan',
      severity: 'error',
      title: 'Stale scan loop',
      detail: `Last scan ${Math.round(snapshot.lastScanAgeMs / 1000)}s ago — loop may be hung.`,
    });
    status = maxSeverity(status, 'error');
    canTrade = false;
  }

  if (snapshot.scanning && snapshot.lastScanAgeMs != null && snapshot.lastScanAgeMs > 90_000) {
    alerts.push({
      id: 'scan_stuck',
      severity: 'error',
      title: 'Scan lock stuck',
      detail: 'Scan flag active but no fresh completion — watchdog may need to fire.',
    });
    status = maxSeverity(status, 'error');
  }

  for (const orphan of snapshot.orphans || []) {
    alerts.push({
      id: `orphan_${orphan.id}`,
      severity: 'error',
      title: 'Orphan paper position',
      detail: `${orphan.symbol} ${String(orphan.outcome).toUpperCase()} past window end · ${orphan.slug}`,
      positionId: orphan.id,
    });
    status = maxSeverity(status, 'error');
    canTrade = false;
  }

  if (snapshot.governorBreaker) {
    alerts.push({
      id: 'governor_breaker',
      severity: 'error',
      title: 'Drawdown breaker active',
      detail: snapshot.governorReason || `DD ${snapshot.drawdownPct}% — arb-only until recovery.`,
    });
    status = maxSeverity(status, 'error');
  }

  for (const blockId of snapshot.dataAssurance?.blocking || []) {
    if (blockId === 'orphan_paper' && (snapshot.orphans || []).length === 0) continue;
    const check = (snapshot.dataAssurance?.checks || []).find((c) => c.id === blockId);
    alerts.push({
      id: `data_${blockId}`,
      severity: 'error',
      title: `Data gate: ${blockId}`,
      detail: check?.detail || snapshot.dataAssurance?.note || 'Buy path blocked',
    });
    status = maxSeverity(status, 'error');
    canTrade = false;
  }

  for (const warnId of snapshot.dataAssurance?.warnings || []) {
    const check = (snapshot.dataAssurance?.checks || []).find((c) => c.id === warnId);
    alerts.push({
      id: `warn_${warnId}`,
      severity: 'warn',
      title: `Data degraded: ${warnId}`,
      detail: check?.detail || warnId,
    });
    status = maxSeverity(status, 'warn');
  }

  if (snapshot.signalHealth?.status === 'fail' && !snapshot.forceArbOnly) {
    alerts.push({
      id: 'signal_health_fail',
      severity: 'error',
      title: 'Signal health failed',
      detail: (snapshot.signalHealth.checks || [])
        .filter((c) => c.status === 'fail')
        .map((c) => c.message)
        .join(' · ') || 'Directional suspended',
    });
    status = maxSeverity(status, 'error');
  } else if (snapshot.signalHealth?.status === 'warn' && !snapshot.forceArbOnly) {
    alerts.push({
      id: 'signal_health_warn',
      severity: 'warn',
      title: 'Signal health degraded',
      detail: (snapshot.signalHealth.checks || [])
        .filter((c) => c.status === 'warn')
        .map((c) => c.message)
        .join(' · ') || 'Review signal checks',
    });
    status = maxSeverity(status, 'warn');
  }

  if (snapshot.edgeGate?.arbOnly || snapshot.edgeGate?.edgeOk === false) {
    alerts.push({
      id: 'edge_gate',
      severity: 'warn',
      title: 'Edge gate restrictive',
      detail: snapshot.edgeGate?.reason || 'Directional may be limited',
    });
    status = maxSeverity(status, 'warn');
  }

  if (snapshot.clobWs && snapshot.running && !snapshot.clobWs.connected) {
    alerts.push({
      id: 'clob_ws_down',
      severity: 'warn',
      title: 'CLOB WebSocket disconnected',
      detail: 'Book microstructure and arb depth may be stale.',
    });
    status = maxSeverity(status, 'warn');
  }

  if (alerts.length === 0 && snapshot.running) {
    alerts.push({
      id: 'healthy',
      severity: 'ok',
      title: 'All systems nominal',
      detail: `Regime ${snapshot.regime || '—'} · scans ${snapshot.scansDone} · canBuy ${snapshot.dataAssurance?.canBuy ? 'yes' : 'no'}`,
    });
  }

  return { alerts, status, canTrade };
}
