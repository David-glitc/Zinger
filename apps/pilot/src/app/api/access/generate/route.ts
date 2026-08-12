import { NextRequest, NextResponse } from "next/server";
import { generateAccessCode } from "@/lib/waitlist-db";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  const expectedToken = process.env.ACCESS_GENERATE_TOKEN;
  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  try {
    const result = await generateAccessCode(email);
    if (!result) {
      return NextResponse.json({ ok: false, error: "not_on_waitlist" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
