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
