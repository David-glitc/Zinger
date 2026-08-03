export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const region = process.env.VERCEL_REGION || "unknown";

  let clobOk = false;
  try {
    const clob = await fetch("https://clob.polymarket.com/time", {
      signal: AbortSignal.timeout(5000),
    });
    clobOk = clob.ok;
  } catch {}

  let geoblock: { blocked: boolean | null; ip: string | null; country: string | null } | null = null;
  try {
    const gb = await fetch("https://polymarket.com/api/geoblock", {
      signal: AbortSignal.timeout(5000),
    });
    if (gb.ok) {
      const data = await gb.json();
      geoblock = {
        blocked: data.blocked ?? null,
        ip: data.ip ?? null,
        country: data.country ?? null,
      };
    }
  } catch {}

  let gammaOk = false;
  try {
    const gamma = await fetch("https://gamma-api.polymarket.com/markets?limit=1", {
      signal: AbortSignal.timeout(5000),
    });
    gammaOk = gamma.ok;
  } catch {}

  return Response.json(
    {
      ok: clobOk && gammaOk,
      timestamp: Date.now(),
      region,
      clobReachable: clobOk,
      polymarketReachable: gammaOk,
      geoblock: {
        blocked: clobOk ? false : (geoblock?.blocked ?? true),
        ip: geoblock?.ip ?? null,
        country: geoblock?.country ?? null,
        note: clobOk && geoblock?.blocked ? "sig returned blocked but clob reachable — trading ok" : undefined,
      },
      proxy: "vercel-direct",
      latencyMs: Date.now() - started,
    },
    { headers: { "cache-control": "no-cache" } },
  );
}
