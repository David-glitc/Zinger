import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESSED_KEY = "access:accessed";

function storageConfigured() {
  return Boolean(
    process.env.KV_REST_API_URL &&
      process.env.KV_REST_API_TOKEN &&
      process.env.KV_URL,
  );
}

/** Validates an access code against stored codes. */
export async function POST(request: NextRequest) {
  if (!storageConfigured()) {
    return NextResponse.json(
      { ok: true, message: "storage_unavailable" },
      { status: 200 },
    );
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const code = String(body?.code ?? "").trim().toUpperCase();

  if (!code || code.length < 6) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
  }

  try {
    const entry = await kv.hgetall<{ email?: string; used?: boolean; ts?: number }>(
      `access:code:${code}`,
    );

    if (!entry) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    if (entry.used) {
      return NextResponse.json({ ok: false, error: "already_used" }, { status: 409 });
    }

    await kv.hset(`access:code:${code}`, { used: true, usedAt: Date.now() });
    await kv.sadd(ACCESSED_KEY, entry.email ?? code);

    return NextResponse.json({
      ok: true,
      email: entry.email ?? null,
      code,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "storage_unavailable" },
      { status: 503 },
    );
  }
}

/** Looks up an access code by email (for recovery). */
export async function GET(request: NextRequest) {
  if (!storageConfigured()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 });
  }

  try {
    const code = await kv.hget(`access:email:${email}`, "code");
    if (!code) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, code: String(code) });
  } catch {
    return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
  }
}
