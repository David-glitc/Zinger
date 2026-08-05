import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const SECRET = process.env.ACCESS_TOKEN_SECRET || "zg-local-dev-secret";

function verifyToken(token: string): Record<string, unknown> | null {
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/app")) return NextResponse.next();
  if (pathname.startsWith("/app/_next")) return NextResponse.next();

  const token = request.cookies.get("zg_access")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const payload = verifyToken(token);
  if (!payload) {
    const resp = NextResponse.redirect(new URL("/", request.url));
    resp.cookies.delete("zg_access");
    return resp;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
