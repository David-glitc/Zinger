import { NextRequest, NextResponse } from "next/server";
import { addToWaitlist, getWaitlistCount } from "@/lib/waitlist-db";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  const allowed = await rateLimit(request, 3, 60 * 60 * 1000, "rl:waitlist");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* fall through */
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const xHandle = String(body?.xHandle ?? "").trim().replace(/^@+/, "");

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  try {
    const result = await addToWaitlist(email, xHandle);
    return NextResponse.json({ ok: true, ...result }, { status: result.already ? 200 : 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const count = await getWaitlistCount();
    return NextResponse.json({ ok: true, count });
  } catch {
    return NextResponse.json({ ok: true, count: 0 });
  }
}
