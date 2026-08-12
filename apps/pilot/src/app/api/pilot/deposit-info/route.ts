import { NextResponse } from "next/server";
import { normalizeAddress } from "@/lib/pilot-db";
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

    return NextResponse.json({
      receiveAddress: address,
      depositWallet: address,
      depositWalletBalance: 0,
      usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      pusdAddress: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      chainId: 137,
      network: "Polygon",
      scanActive: true,
      note: "Send Polygon USDC to your wallet address. We credit your account when confirmed.",
    });
  } catch (err) {
    return routeError("pilot.deposit-info", err, request);
  }
}
