import { API_BASE } from "@/lib/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function doFetch<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const isMutation = init?.method && init.method !== "GET";
  const res = await fetch(`${base}${path}`, {
    ...init,
    cache: isMutation ? undefined : "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error || res.statusText || "request failed",
      res.status,
    );
  }
  return data as T;
}

/** Fetch from the core backend API (signals, markets, price history). */
export function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return doFetch<T>(API_BASE, path, init);
}

/** Fetch from the pilot app's own API routes (MongoDB-backed accounts). */
export function localFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return doFetch<T>("", path, init);
}
