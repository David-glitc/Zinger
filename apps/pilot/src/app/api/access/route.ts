import { NextRequest, NextResponse } from "next/server";
import { validateCode, validateAccessToken, createPaperToken } from "@/lib/waitlist-db";
import { normalizeAddress } from "@/lib/pilot-db";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Validates an access code and returns a signed token. Locks code to wallet. */
export async function POST(request: NextRequest) {
  const allowed = await rateLimit(request, 10, 15 * 60 * 1000, "rl:access:redeem");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!code || code.length < 6) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
  }

  const wallet =
    normalizeAddress(String(body?.wallet ?? "")) ?? undefined;

  try {
    const result = await validateCode(code, wallet);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    }
    return NextResponse.json({ ok: true, token: result.token, email: result.email });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** Verify a signed token. */
export async function PUT(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const token = String(body?.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  const payload = validateAccessToken(token);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, kind: payload.kind || "full", sub: payload.sub, wallet: payload.wallet });
}

/** Issues a paper-mode token (no code needed). Rate-limited per IP. */
export async function PATCH(request: NextRequest) {
  const allowed = await rateLimit(request, 20, 60 * 60 * 1000, "rl:access:paper");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const token = createPaperToken();
  return NextResponse.json({ ok: true, token, kind: "paper" });
}
