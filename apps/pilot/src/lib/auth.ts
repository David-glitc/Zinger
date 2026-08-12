import { cookies } from "next/headers";
import { validateAccessToken } from "@/lib/waitlist-db";
import { ACCESS_COOKIE } from "@/lib/access";

export type AuthContext = {
  kind: "full" | "paper";
  wallet: string | null;
  sub: string | null;
  iat: number | null;
};

/** Reads and verifies the zg_access cookie. Returns null when absent/invalid. */
export async function getAuth(): Promise<AuthContext | null> {
  try {
    const store = await cookies();
    const token = store.get(ACCESS_COOKIE)?.value;
    if (!token) return null;
    const payload = validateAccessToken(token);
    if (!payload) return null;
    return {
      kind: payload.kind === "paper" ? "paper" : "full",
      wallet: typeof payload.wallet === "string" ? payload.wallet.toLowerCase() : null,
      sub: typeof payload.sub === "string" ? payload.sub : null,
      iat: typeof payload.iat === "number" ? payload.iat : null,
    };
  } catch {
    return null;
  }
}

/**
 * An account operation is allowed only when a valid, wallet-bound token
 * exists and the token's wallet matches the requested address.
 */
export function canAccessAccount(auth: AuthContext | null, address: string | null): boolean {
  if (!auth || !address) return false;
  if (!auth.wallet) return false;
  return auth.wallet === address.toLowerCase();
}

export function authFailure(status: 401 | 403, error: string) {
  return Response.json({ error }, { status });
}

export function unauthorized() {
  return authFailure(401, "Unauthorized");
}

export function forbidden() {
  return authFailure(403, "Not authorized for this account");
}
