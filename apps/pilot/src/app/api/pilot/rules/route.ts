import { NextResponse } from "next/server";
import { saveRules, normalizeAddress, sanitizeAccount } from "@/lib/pilot-db";
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

    const rules = body.rules;
    if (!rules || typeof rules !== "object") {
      return NextResponse.json({ error: "rules required" }, { status: 400 });
    }
    const result = await saveRules(address, rules);
    return NextResponse.json({ ok: true, account: sanitizeAccount(result.account) });
  } catch (err) {
    return routeError("pilot.rules", err, request);
  }
}
