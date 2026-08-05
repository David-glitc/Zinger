import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/app")) return NextResponse.next();
  if (pathname.startsWith("/app/_next")) return NextResponse.next();
  if (pathname.startsWith("/app/api")) return NextResponse.next();

  const token = request.cookies.get("zg_access")?.value;
  if (!token || !token.includes(".")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
