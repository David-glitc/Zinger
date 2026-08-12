import { NextResponse } from "next/server";

/**
 * Lightweight structured JSON logger for API route handlers.
 * No dependencies; output is grep-able in Vercel function logs.
 */
export function logError(scope: string, err: unknown, request?: Request) {
  let method = "?";
  let path = "?";
  try {
    if (request?.url) {
      const u = new URL(request.url);
      method = request.method || "?";
      path = u.pathname;
    }
  } catch {
    /* ignore malformed url */
  }
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      method,
      path,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      timestamp: new Date().toISOString(),
    }),
  );
}

/** Logs an unexpected error and returns a generic 500 response. */
export function routeError(scope: string, err: unknown, request?: Request) {
  logError(scope, err, request);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status: 500 },
  );
}
