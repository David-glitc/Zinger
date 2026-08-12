import { NextResponse } from "next/server";
import { getAccount, normalizeAddress } from "@/lib/pilot-db";
import { getAuth, canAccessAccount, unauthorized, forbidden } from "@/lib/auth";
import { routeError } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = normalizeAddress(searchParams.get("address") || "");
    if (!address) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }

    const auth = await getAuth();
    if (!auth) return unauthorized();
    if (!canAccessAccount(auth, address)) return forbidden();

    const account = await getAccount(address);
    return NextResponse.json({
      deposits: account?.usdcDeposits ?? [],
    });
  } catch (err) {
    return routeError("pilot.deposits", err, request);
  }
}
