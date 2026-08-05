"use client";

import { useEffect, useState } from "react";

function base64UrlDecode(str: string): string {
  try {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(base64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export function useAccessKind(): "full" | "paper" | null {
  const [kind, setKind] = useState<"full" | "paper" | null>(null);

  useEffect(() => {
    function readKind() {
      const cookies = document.cookie.split("; ");
      const tokenCookie = cookies.find((c) => c.startsWith("zg_access="));
      if (!tokenCookie) { setKind(null); return; }
      try {
        const token = tokenCookie.split("=")[1];
        const [, body] = token.split(".");
        if (!body) { setKind(null); return; }
        const payload = JSON.parse(base64UrlDecode(body));
        setKind(payload.kind === "paper" ? "paper" : "full");
      } catch {
        setKind(null);
      }
    }

    readKind();

    const handler = () => readKind();
    window.addEventListener("zg-access-granted", handler);
    return () => window.removeEventListener("zg-access-granted", handler);
  }, []);

  return kind;
}
