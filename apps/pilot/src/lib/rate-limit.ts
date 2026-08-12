import { NextRequest } from "next/server";

const memory = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** In-memory sliding window. Per-instance only, but always available. */
function memoryAllow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = memory.get(key);
  if (!cur || cur.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

/** KV-backed counter with expiry when Upstash is configured. */
async function kvAllow(key: string, limit: number, windowMs: number): Promise<boolean> {
  const { kv } = await import("@vercel/kv");
  const count = await kv.incr(key);
  if (count === 1) await kv.expire(key, Math.ceil(windowMs / 1000));
  return count <= limit;
}

/**
 * Distributed rate limit via Vercel KV when configured, with an in-memory
 * fallback otherwise. Returns true when the request is allowed.
 */
export async function rateLimit(
  request: NextRequest,
  limit: number,
  windowMs: number,
  scope: string,
): Promise<boolean> {
  const key = `${scope}:${getClientIp(request)}`;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      return await kvAllow(key, limit, windowMs);
    } catch {
      // KV unavailable — fall back to the in-memory limiter.
    }
  }
  return memoryAllow(key, limit, windowMs);
}
