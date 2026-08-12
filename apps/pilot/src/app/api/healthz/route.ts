import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const checks: Record<string, "ok" | "error"> = {};

  // Mongo connectivity
  try {
    const { getDb } = await import("@/lib/mongo");
    const db = await getDb();
    await db.command({ ping: 1 });
    checks.mongo = "ok";
  } catch {
    checks.mongo = "error";
  }

  // Vercel KV (only if configured)
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import("@vercel/kv");
      await kv.ping();
      checks.kv = "ok";
    } catch {
      checks.kv = "error";
    }
  }

  const healthy = Object.values(checks).every((c) => c === "ok");

  return NextResponse.json(
    {
      ok: healthy,
      status: healthy ? "healthy" : "degraded",
      timestamp: Date.now(),
      uptimeSec: Math.round(process.uptime()),
      region: process.env.VERCEL_REGION || "unknown",
      version: process.env.NEXT_PUBLIC_APP_VERSION || "dev",
      checks,
      latencyMs: Date.now() - started,
    },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-cache, no-store" } },
  );
}
