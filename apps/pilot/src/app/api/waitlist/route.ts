import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAILS_KEY = "waitlist:emails";
const HANDLES_KEY = "waitlist:handles";

function storageConfigured() {
  return Boolean(
    process.env.KV_REST_API_URL &&
      process.env.KV_REST_API_TOKEN &&
      process.env.KV_URL,
  );
}

export async function POST(request: NextRequest) {
  if (!storageConfigured()) {
    return NextResponse.json(
      { ok: false, error: "storage_unavailable" },
      { status: 503 },
    );
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* fall through */
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const xHandle = String(body?.xHandle ?? "")
    .trim()
    .replace(/^@+/, "");

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "invalid_email" },
      { status: 400 },
    );
  }

  try {
    const existing = await kv.sismember(EMAILS_KEY, email);
    if (existing) {
      return NextResponse.json({ ok: true, already: true }, { status: 200 });
    }

    const entry = { email, xHandle, ts: Date.now() };
    await kv
      .multi()
      .sadd(EMAILS_KEY, email)
      .sadd(HANDLES_KEY, xHandle || email)
      .hset(`waitlist:entry:${email}`, entry)
      .lpush(`waitlist:recent`, JSON.stringify(entry))
      .ltrim(`waitlist:recent`, 0, 499)
      .exec();

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "storage_unavailable" },
      { status: 503 },
    );
  }
}

export async function GET() {
  if (!storageConfigured()) {
    return NextResponse.json({ ok: false, count: 0 }, { status: 200 });
  }
  try {
    const count = await kv.scard(EMAILS_KEY);
    return NextResponse.json({ ok: true, count: count ?? 0 }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, count: 0 }, { status: 200 });
  }
}
