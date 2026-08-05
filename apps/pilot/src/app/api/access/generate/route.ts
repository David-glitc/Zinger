import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(length = 8): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

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

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  const expectedToken = process.env.ACCESS_GENERATE_TOKEN;
  if (expectedToken && token !== expectedToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  try {
    const existing = await kv.hget(`access:email:${email}`, "code");
    if (existing) {
      return NextResponse.json({
        ok: true,
        code: String(existing),
        email,
        existing: true,
      });
    }

    const code = generateCode(8);
    await kv
      .multi()
      .sadd("access:codes", code)
      .hset(`access:code:${code}`, { email, used: false, ts: Date.now() })
      .hset(`access:email:${email}`, { code })
      .exec();

    return NextResponse.json({ ok: true, code, email, existing: false });
  } catch {
    return NextResponse.json(
      { ok: false, error: "storage_unavailable" },
      { status: 503 },
    );
  }
}
