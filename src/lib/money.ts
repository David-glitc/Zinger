// @ts-nocheck
/**
 * Signed USD formatting for logs, Telegram, and telemetry.
 *
 * Three spellings of "format a PnL" had accumulated across the codebase, and
 * two of them were wrong:
 *
 *   `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`
 *       Drops the minus entirely — `Math.abs` strips it and the ternary only
 *       ever adds a `+`. A $1.44 loss rendered as `$1.44`, one character away
 *       from the `+$1.44` a gain of the same size produced. Every stop-loss,
 *       trail and exit line in the scan log shared this.
 *
 *   `${v >= 0 ? '+' : ''}$${v.toFixed(2)}`
 *       Keeps the sign but puts it inside the amount: `$-1.44`.
 *
 * The sign belongs outside the currency symbol, and a loss must never be
 * ambiguous with a gain. `signedUsd` is the single answer.
 */

/** `+$1.44` / `-$1.44` / `+$0.00`. Sign always shown, outside the `$`. */
export function signedUsd(value, decimals = 2) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  // -0 must not print as "-$0.00".
  const normalized = safe === 0 ? 0 : safe;
  const sign = normalized < 0 ? '-' : '+';
  return `${sign}$${Math.abs(normalized).toFixed(decimals)}`;
}

/** `$1.44` / `-$1.44`. No `+` on gains, minus still outside the `$`. */
export function usd(value, decimals = 2) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  const normalized = safe === 0 ? 0 : safe;
  return `${normalized < 0 ? '-' : ''}$${Math.abs(normalized).toFixed(decimals)}`;
}
