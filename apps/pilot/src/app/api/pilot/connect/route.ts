import { NextResponse } from "next/server";
import { connectWallet, normalizeAddress, sanitizeAccount } from "@/lib/pilot-db";
import { getAuth, unauthorized, forbidden } from "@/lib/auth";
import { issueBoundToken } from "@/lib/waitlist-db";
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
