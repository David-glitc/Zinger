import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { createHmac } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = process.env.ACCESS_TOKEN_SECRET || "zg-local-dev-secret";

function sign(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify(token: string): Record<string, unknown> | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && typeof payload.exp === "number" && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function storageConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN && process.env.KV_URL);
}

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 10;

async function checkRateLimit(ip: string): Promise<boolean> {
  if (!storageConfigured()) return true;
  try {
    const key = `ratelimit:access:${ip}`;
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, Math.ceil(RATE_LIMIT_WINDOW / 1000));
    return count <= RATE_LIMIT_MAX;
  } catch {
    return true;
  }
}

/** Validates an access code and returns a signed token. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";

  if (!(await checkRateLimit(ip))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  if (!storageConfigured()) {
    return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
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
    const entry = await kv.hgetall<{ email?: string; used?: boolean; ts?: number }>(`access:code:${code}`);
    if (!entry) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (entry.used) {
      return NextResponse.json({ ok: false, error: "already_used" }, { status: 409 });
    }

    await kv.hset(`access:code:${code}`, { used: true, usedAt: Date.now() });
    await kv.sadd("access:accessed", entry.email ?? code);

    const token = sign({
      sub: entry.email ?? code,
      code,
      kind: "full",
      iat: Date.now(),
      exp: Date.now() + 90 * 24 * 60 * 60 * 1000,
    });

    return NextResponse.json({ ok: true, token, email: entry.email ?? null });
  } catch {
    return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
  }
}

/** Verify a signed token. */
export async function PUT(request: NextRequest) {
  let body: Record<string, unknown> | null = null;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const token = String(body?.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  const payload = verify(token);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, kind: payload.kind || "full", sub: payload.sub });
}

/** Issues a paper-mode token (no code needed). */
export async function PATCH(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!(await checkRateLimit(ip))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const token = sign({
    kind: "paper",
    iat: Date.now(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });

  return NextResponse.json({ ok: true, token, kind: "paper" });
}

/** Looks up an access code by email (for recovery). Rate-limited. */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!(await checkRateLimit(ip))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

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
