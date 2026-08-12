import { NextResponse } from "next/server";
import { ensureAccount, normalizeAddress, sanitizeAccount } from "@/lib/pilot-db";
import { getAuth, canAccessAccount, unauthorized, forbidden } from "@/lib/auth";
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
    if (!canAccessAccount(auth, address)) return forbidden();

    const chainId = Number(body.chainId) || 137;
    const mode = body.mode === "live" ? "live" : ("paper" as const);
    const account = await ensureAccount(address, chainId);
    if (account.mode !== mode) {
      const { getCollection } = await import("@/lib/mongo");
      const col = await getCollection("pilot_accounts");
      await col.updateOne({ wallet: address }, { $set: { mode, updatedAt: Date.now() } });
      account.mode = mode;
    }
    return NextResponse.json({ ok: true, account: sanitizeAccount(account) });
  } catch (err) {
    return routeError("pilot.account", err, request);
  }
}
