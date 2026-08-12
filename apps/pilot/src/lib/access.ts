export const ACCESS_COOKIE = "zg_access";

export function storeToken(token: string) {
  document.cookie = `${ACCESS_COOKIE}=${token};path=/;max-age=${90 * 24 * 60 * 60};SameSite=Lax;secure`;
}

export function clearToken() {
  document.cookie = `${ACCESS_COOKIE}=;path=/;max-age=0`;
}

export function readToken(): string | null {
  const cookies = document.cookie.split("; ");
  const tokenCookie = cookies.find((c) => c.startsWith(`${ACCESS_COOKIE}=`));
  if (!tokenCookie) return null;
  const token = tokenCookie.split("=")[1];
  return token || null;
}

/** Decodes the unsigned payload of the zg_access token (for message building). */
export function readTokenClaims(): Record<string, unknown> | null {
  const token = readToken();
  if (!token) return null;
  try {
    const [body] = token.split(".");
    if (!body) return null;
    const b64 = body.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
