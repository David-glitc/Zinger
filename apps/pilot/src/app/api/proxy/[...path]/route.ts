const CLOB_BASE = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxyRequest(request: Request, targetBase: string) {
  const url = new URL(request.url);
  const targetPath = url.pathname.replace(/^\/api\/proxy\/(clob|gamma)/, "");
  const targetUrl = `${targetBase}${targetPath}${url.search}`;

  const headers = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const lower = k.toLowerCase();
    if (
      lower === "host" ||
      lower === "connection" ||
      lower === "x-forwarded-proto" ||
      lower === "x-forwarded-for" ||
      lower === "x-vercel-id" ||
      lower === "x-vercel-deployment-url" ||
      lower === "x-vercel-ip" ||
      lower === "x-vercel-country" ||
      lower === "x-vercel-region" ||
      lower === "x-real-ip"
    )
      continue;
    headers.set(k, v);
  }
  headers.set("accept", "application/json");

  try {
    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
      signal: AbortSignal.timeout(15000),
    });

    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
        "cache-control": "no-cache, no-store, must-revalidate",
        "x-proxy": "vercel",
        "x-proxy-region": process.env.VERCEL_REGION || "unknown",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, error: message.slice(0, 300), proxy: "vercel" },
      { status: 502 },
    );
  }
}

async function proxyForMethod(request: Request) {
  const url = new URL(request.url);
  const base = url.pathname.startsWith("/api/proxy/gamma") ? GAMMA_BASE : CLOB_BASE;
  return proxyRequest(request, base);
}

export const GET = proxyForMethod;
export const POST = proxyForMethod;
export const DELETE = proxyForMethod;
export const PUT = proxyForMethod;

