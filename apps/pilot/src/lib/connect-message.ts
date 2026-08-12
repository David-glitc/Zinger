export interface ConnectMessageOpts {
  sub?: string | null;
  iat?: number | null;
}

/**
 * Canonical message a wallet must sign to prove ownership when binding an
 * unbound zg_access token to its address. Bound to the token's subject and
 * issuance time so a captured signature can't be replayed against another
 * token or another address.
 */
export function buildConnectMessage(address: string, opts: ConnectMessageOpts = {}): string {
  return [
    "Zinger Paper Trading",
    "Connect wallet",
    `Address: ${address.toLowerCase()}`,
    `Account: ${opts.sub ?? "paper"}`,
    `Issued: ${opts.iat ?? 0}`,
  ].join("\n");
}
