import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARE_TTL = 60 * 60 * 24 * 30;

function storageConfigured() {
  return Boolean(
    process.env.KV_REST_API_URL &&
      process.env.KV_REST_API_TOKEN &&
      process.env.KV_URL,
  );
}

function shortToken(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 10);
}

export async function POST(request: NextRequest) {
  if (!storageConfigured()) {
    return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const pnl = Number(body?.pnl ?? null);
  const entryPrice = body?.entryPrice != null ? String(body.entryPrice) : null;
  const exitPrice = body?.exitPrice != null ? String(body.exitPrice) : null;
  const outcome = body?.outcome != null ? String(body.outcome) : null;
  const asset = body?.asset != null ? String(body.asset) : null;
  const slug = body?.slug != null ? String(body.slug) : null;

  if (!Number.isFinite(pnl)) {
    return NextResponse.json({ ok: false, error: "invalid_pnl" }, { status: 400 });
  }

  try {
    const token = shortToken();
    const data = {
      pnl,
      entryPrice,
      exitPrice,
      outcome,
      asset,
      slug,
      timestamp: Date.now(),
    };

    await kv.set(`share:${token}`, data, { ex: SHARE_TTL });

    return NextResponse.json({ ok: true, token }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  if (!storageConfigured()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  try {
    const data = await kv.get<Record<string, unknown>>(`share:${token}`);
    if (!data) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
