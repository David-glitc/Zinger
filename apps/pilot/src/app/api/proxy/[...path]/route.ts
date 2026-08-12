const CLOB_BASE = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxyRequest(request: Request, targetBase: string) {
  const url = new URL(request.url);
  const targetPath = url.pathname.replace(/^\/api\/proxy\/(clob|gamma)/, "");
  const targetUrl = `${targetBase}${targetPath}${url.search}`;

  const headers = new Headers();
  const allowlist = new Set(["accept", "accept-language", "content-type", "origin", "user-agent", "poly-address", "poly-signature", "poly-timestamp", "poly-nonce", "poly-api-key"]);
  for (const [k, v] of request.headers.entries()) {
    if (allowlist.has(k.toLowerCase())) headers.set(k, v);
  }
  headers.set("accept", "application/json");

  try {
    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      redirect: "manual",
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
  if (!["GET", "HEAD"].includes(request.method)) {
    return Response.json({ ok: false, error: "method not allowed" }, { status: 405 });
  }
  const url = new URL(request.url);
  const base = url.pathname.startsWith("/api/proxy/gamma") ? GAMMA_BASE : CLOB_BASE;
  return proxyRequest(request, base);
}

export const GET = proxyForMethod;

