import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/app")) return NextResponse.next();
  if (pathname.startsWith("/app/_next")) return NextResponse.next();
  if (pathname.startsWith("/app/api")) return NextResponse.next();

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};