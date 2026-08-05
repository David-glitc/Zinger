import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { Resend } from "resend";

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

  if (!storageConfigured()) {
    return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return NextResponse.json({ ok: false, error: "email_not_configured" }, { status: 503 });
  }

  try {
    const existing = await kv.hget(`access:email:${email}`, "code");
    const code = existing ? String(existing) : generateCode(8);

    if (!existing) {
      await kv
        .multi()
        .sadd("access:codes", code)
        .hset(`access:code:${code}`, { email, used: false, ts: Date.now() })
        .hset(`access:email:${email}`, { code })
        .exec();
    }

    const resend = new Resend(resendApiKey);
    const from = process.env.ACCESS_FROM_EMAIL || "Zinger <noreply@usezinger.xyz>";

    const { error: sendError } = await resend.emails.send({
      from,
      to: email,
      subject: "Your Zinger Alpha Access Code",
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0a0b;color:#f5f5f6;border-radius:16px;border:1px solid #1e1e24">
        <h1 style="font-size:20px;font-weight:600;margin:0 0 8px">Zinger Alpha</h1>
        <p style="font-size:14px;color:#8b8fa3;margin:0 0 24px;line-height:1.6">You're in. Your access code for the Zinger alpha is below. Enter it at <a href="https://usezinger.xyz/app" style="color:#3b82f6">usezinger.xyz/app</a>.</p>
        <div style="background:#0f0f11;border:1px solid #1e1e24;border-radius:12px;padding:16px 24px;text-align:center;margin:0 0 24px">
          <code style="font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.2em;color:#3b82f6">${code}</code>
        </div>
        <p style="font-size:12px;color:#8b8fa3;margin:0;line-height:1.5">No code? Try <a href="https://usezinger.xyz/app" style="color:#3b82f6">paper mode</a> with simulated funds — no code needed. Live trading requires this code.</p>
        <hr style="border:none;border-top:1px solid #1e1e24;margin:24px 0" />
        <p style="font-size:11px;color:#52525b;margin:0">Zinger · Autonomous Polymarket trading · <a href="https://usezinger.xyz" style="color:#52525b">usezinger.xyz</a></p>
      </div>`,
    });

    if (sendError) {
      return NextResponse.json({ ok: false, error: sendError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, code, email, sent: true });
  } catch {
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 500 });
  }
}
