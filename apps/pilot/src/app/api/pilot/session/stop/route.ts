import { NextResponse } from "next/server";
import { getAccount, normalizeAddress, sanitizeAccount } from "@/lib/pilot-db";
import { persistPaperCycle, runPaperCycle } from "@/lib/paper-engine";
import { getCollection } from "@/lib/mongo";
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

    const account = await getAccount(address);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let next = account;
    const positions = Array.isArray(account.positions) ? account.positions : [];
    if (positions.length > 0) {
      const cycle = runPaperCycle(account, null, [], { closeAll: true });
      await persistPaperCycle(address, cycle);
      next = cycle.account;
    }

    const stopped = {
      ...next,
      session: {
        running: false,
        id: next.session?.id ?? null,
        startedAt: next.session?.startedAt ?? null,
        stoppedAt: Date.now(),
      },
      updatedAt: Date.now(),
    };

    const col = await getCollection("pilot_accounts");
    await col.updateOne(
      { wallet: address },
      { $set: { session: stopped.session, updatedAt: stopped.updatedAt } },
    );

    return NextResponse.json({ ok: true, account: sanitizeAccount(stopped) });
  } catch (err) {
    return routeError("pilot.session.stop", err, request);
  }
}
