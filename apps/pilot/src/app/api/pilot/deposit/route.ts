import { NextResponse } from "next/server";
import { deposit, getAccount, normalizeAddress, sanitizeAccount } from "@/lib/pilot-db";
import { getAuth, canAccessAccount, unauthorized, forbidden } from "@/lib/auth";
import { routeError } from "@/lib/logger";

const MAX_DEPOSIT = 5_000;
const MAX_DEPOSITED_TOTAL = 25_000;

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

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (amount > MAX_DEPOSIT) {
      return NextResponse.json(
        { error: `Deposits are capped at $${MAX_DEPOSIT.toLocaleString()} per transaction` },
        { status: 400 },
      );
    }
    const account = await getAccount(address);
    const projectedTotal = Number(account?.depositedGross ?? 0) + amount;
    if (projectedTotal > MAX_DEPOSITED_TOTAL) {
      return NextResponse.json(
        { error: `Total deposits are capped at $${MAX_DEPOSITED_TOTAL.toLocaleString()}` },
        { status: 400 },
      );
    }
    const result = await deposit(address, amount);
    return NextResponse.json({ ok: true, account: sanitizeAccount(result.account), gross: result.gross, fee: result.fee, net: result.net });
  } catch (err) {
    return routeError("pilot.deposit", err, request);
  }
}
