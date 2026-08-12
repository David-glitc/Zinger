import { NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { connectWallet, normalizeAddress, sanitizeAccount } from "@/lib/pilot-db";
import { getAuth, unauthorized, forbidden } from "@/lib/auth";
import { issueBoundToken } from "@/lib/waitlist-db";
import { buildConnectMessage } from "@/lib/connect-message";
import { routeError } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const address = normalizeAddress(body.address || "");
    if (!address) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const auth = await getAuth();
    if (!auth) return unauthorized();
    if (auth.wallet && auth.wallet !== address) return forbidden();

    if (!auth.wallet) {
      // Unbound token: wallet ownership must be proven before this token can
      // be bound to an address. Otherwise any waitlisted user could bind their
      // token to a victim's address and read/write that account.
      const { message, signature } = body;
      const expected = buildConnectMessage(address, { sub: auth.sub, iat: auth.iat });
      if (
        typeof message !== "string" ||
        typeof signature !== "string" ||
        message !== expected
      ) {
        return NextResponse.json({ error: "Wallet signature required" }, { status: 400 });
      }
      try {
        const signer = await recoverMessageAddress({
          message,
          signature: signature as `0x${string}`,
        });
        if (signer.toLowerCase() !== address.toLowerCase()) {
          return NextResponse.json(
            { error: "Signature does not match wallet" },
            { status: 403 },
          );
        }
      } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    }

    const chainId = Number(body.chainId) || 137;
    const { account, isNew } = await connectWallet(address, chainId);

    // Bind an unbound token (paper or full) to this wallet on first connect.
    let token: string | undefined;
    if (!auth.wallet) {
      token = issueBoundToken(auth.kind, address, auth.sub);
    }

    return NextResponse.json({ ok: true, account: sanitizeAccount(account), isNew, ...(token ? { token } : {}) });
  } catch (err) {
    return routeError("pilot.connect", err, request);
  }
}