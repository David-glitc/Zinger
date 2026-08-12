import { NextResponse } from "next/server";
import { getAccount, normalizeAddress, sanitizeAccount } from "@/lib/pilot-db";
import {
  buildPaperSnapshot,
  fetchCoreSignals,
  persistPaperCycle,
  runPaperCycle,
} from "@/lib/paper-engine";
import { getAuth, canAccessAccount, unauthorized, forbidden } from "@/lib/auth";
import { routeError } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const address = normalizeAddress(body.address || "");
    if (!address) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }

    const auth = await getAuth();
    if (!auth) return unauthorized();
    if (!canAccessAccount(auth, address)) return forbidden();

    const account = await getAccount(address);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!account.session?.running) {
      const paper = buildPaperSnapshot(account);
      return NextResponse.json({ ok: true, skipped: true, paper, account: sanitizeAccount(account) });
    }

    const { signals, markets } = await fetchCoreSignals();
    const cycle = runPaperCycle(account, signals, markets, { closeAll: false });
    await persistPaperCycle(address, cycle);

    return NextResponse.json({
      ok: true,
      opened: cycle.opened.length,
      closed: cycle.closed.length,
      paper: buildPaperSnapshot(cycle.account),
      account: sanitizeAccount(cycle.account),
    });
  } catch (err) {
    return routeError("pilot.paper.tick", err, request);
  }
}
