import { NextResponse } from "next/server";
import { connectWallet, getAccount, sanitizeAccount, normalizeAddress } from "@/lib/pilot-db";
import { buildPaperSnapshot } from "@/lib/paper-engine";
import { getAuth, canAccessAccount, unauthorized, forbidden } from "@/lib/auth";
import { routeError } from "@/lib/logger";

const CORE_API = process.env.NEXT_PUBLIC_API_URL || "https://zinger.kierkegaard.space/api/v1";

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
    const safe = sanitizeAccount(account);

    let markets: unknown[] = [];
    let signals: unknown = null;

    try {
      const sigRes = await fetch(`${CORE_API}/pilot?address=public`);
      if (sigRes.ok) {
        const coreData = await sigRes.json().catch(() => ({}));
        markets = (coreData as Record<string, unknown>).markets as unknown[] ?? [];
        signals = (coreData as Record<string, unknown>).signals ?? null;
      }
    } catch {
      /* core unreachable — show empty markets */
    }

    const cash = Number(safe?.cash ?? 0);
    const deposited = Number(safe?.depositedGross ?? 0);
    const fees = Number(safe?.platformFeesPaid ?? 0);
    const withdrawn = Number(safe?.withdrawn ?? 0);
    const paper = buildPaperSnapshot(account);
    const equity = paper.equity;

    return NextResponse.json({
      timestamp: Date.now(),
      account: safe,
      markets,
      signals,
      paper: {
        ...paper,
        open: paper.open.map((p) => ({
          ...p,
          title: `${p.asset} ${p.outcome} · ${p.duration}`,
          entryPrice: p.entry,
          pnl: p.unrealizedPnl,
          symbol: p.asset,
        })),
        trades: paper.trades.map((t) => ({
          ...t,
          symbol: t.asset,
          exitReason: t.reason,
          title: `${t.asset} ${t.outcome} · ${t.duration}`,
        })),
        events: (safe?.events ?? []),
      },
      accounting: {
        equity,
        cash,
        realizedPnl: paper.realizedPnl,
        unrealizedPnl: paper.unrealizedPnl,
        clobFees: 0,
        platformFees: fees,
        winRate: paper.winRate,
        wins: paper.wins,
        losses: paper.losses,
        openCount: paper.openCount,
        depositedGross: deposited,
        withdrawn,
      },
      opens: paper.open.map((p) => ({
        ...p,
        title: `${p.asset} ${p.outcome} · ${p.duration}`,
        entryPrice: p.entry,
        pnl: p.unrealizedPnl,
        symbol: p.asset,
        mode: "paper",
      })),
      botPaper: null,
      liveTrading: null,
      liveAccount: null,
      sessionLedger: null,
      session: safe?.session ?? null,
      platformFeeRate: 0.01,
      feed: { ageMs: 0, botRunning: false },
    });
  } catch (err) {
    return routeError("pilot.snapshot", err, request);
  }
}

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
    const { account } = await connectWallet(address, chainId);
    return NextResponse.json({ ok: true, account: sanitizeAccount(account) });
  } catch (err) {
    return routeError("pilot.connect-legacy", err, request);
  }
}
