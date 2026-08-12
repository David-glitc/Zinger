"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Key, ArrowRight, Loader2, Sparkles, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { storeToken, clearToken, readToken } from "@/lib/access";

interface AccessGateProps {
  children: React.ReactNode;
}

async function verifyStoredToken(): Promise<boolean> {
  const token = readToken();
  if (!token) return false;

  try {
    const res = await fetch("/api/access", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function AccessGate({ children }: AccessGateProps) {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [accessKind, setAccessKind] = useState<"full" | "paper" | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    verifyStoredToken().then((valid) => {
      if (valid) {
        const cookies = document.cookie.split("; ");
        const tokenCookie = cookies.find((c) => c.startsWith("zg_access="));
        if (tokenCookie) {
          try {
            const token = tokenCookie.split("=")[1];
            const [, body] = token.split(".");
            if (body) {
              const payload = JSON.parse(atob(body));
              setAccessKind(payload.kind === "paper" ? "paper" : "full");
            }
          } catch { /* keep as null */ }
        }
        setGranted(true);
      } else {
        clearToken();
        setGranted(false);
      }
    });
  }, []);

  useEffect(() => {
    if (granted && accessKind) {
      window.dispatchEvent(new CustomEvent("zg-access-granted", { detail: { kind: accessKind } }));
    }
  }, [granted, accessKind]);

  const submitCode = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const c = code.trim().toUpperCase();
      if (c.length < 6) return;

      setStatus("loading");
      setError("");

      try {
        const res = await fetch("/api/access", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: c }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string; token?: string };

        if (!data.ok) {
          const msgs: Record<string, string> = {
            not_found: "That access code is not valid. Check your email or try paper mode.",
            already_used: "This code has already been used.",
            rate_limited: "Too many attempts. Wait a minute and try again.",
            invalid_code: "Enter a valid access code from your invitation email.",
            storage_unavailable: "The gate is temporarily unavailable. Try paper mode.",
          };
          setError(msgs[data.error ?? ""] ?? "Something went wrong. Try again.");
          setStatus("error");
          return;
        }

        storeToken(data.token!);
        setAccessKind("full");
        setGranted(true);
      } catch {
        setError("Couldn't reach the access service. Check your connection.");
        setStatus("error");
      }
    },
    [code],
  );

  async function handlePaperMode() {
    setStatus("loading");
    try {
      const res = await fetch("/api/access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
      });
      const data = (await res.json()) as { ok: boolean; token?: string };

      if (!data.ok) {
        setError("Couldn't issue paper access token. Try again.");
        setStatus("error");
        return;
      }

      storeToken(data.token!);
      setAccessKind("paper");
      setGranted(true);
    } catch {
      setError("Couldn't reach the access service.");
      setStatus("error");
    }
  }

  if (granted === null) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (granted) return <>{children}</>;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none fixed inset-0 -z-10 zg-aurora" />
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh] zg-grid" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="zg-glass rounded-2xl p-6 text-center">
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.08 }}
            className="mx-auto flex size-14 items-center justify-center rounded-xl border border-primary/25 bg-primary/10"
          >
            <Key className="size-6 text-primary" />
          </motion.div>

          <h1 className="mt-4 font-display text-[20px] font-medium tracking-[-0.02em] text-foreground">
            Welcome to Zinger
          </h1>
          <p className="mx-auto mt-2 max-w-[280px] font-sans text-[13px] leading-relaxed text-muted-foreground">
            Live trading is invite-only. Try paper mode free right now, or enter your access code.
          </p>

          {!showCode ? (
            <>
              <button
                onClick={handlePaperMode}
                disabled={status === "loading"}
                className={cn(
                  "mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-white",
                  "zg-volt-btn",
                  status === "loading" && "opacity-60",
                )}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Setting up…
                  </>
                ) : (
                  <>
                    <PlayCircle className="size-4" /> Try paper mode — free
                  </>
                )}
              </button>
              <p className="mt-2 font-sans text-[11px] text-muted-foreground">
                No code, no deposit. Simulated funds to test the agent.
              </p>

              <div className="mt-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-border/50" />
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">
                  or
                </span>
                <span className="h-px flex-1 bg-border/50" />
              </div>

              <button
                onClick={() => setShowCode(true)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-foreground transition-colors hover:bg-muted/50"
              >
                <Key className="size-4 text-primary" />
                I have an access code
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowCode(false);
                }}
                className="mt-3 mb-1 font-mono text-[10px] text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                ← Try paper mode instead
              </button>

              <form onSubmit={submitCode} className="mt-1">
                <div className="relative">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      if (status === "error") setStatus("idle");
                    }}
                    placeholder="XXXX-XXXX"
                    maxLength={9}
                    autoComplete="off"
                    autoFocus
                    className="zg-num w-full py-2.5 text-center font-mono text-[16px] tracking-[0.28em] uppercase"
                    aria-label="Access code"
                  />
                </div>

                <button
                  type="submit"
                  disabled={status === "loading" || code.trim().length < 6}
                  className={cn(
                    "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-white",
                    "zg-volt-btn",
                    (status === "loading" || code.trim().length < 6) && "opacity-60",
                  )}
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Checking…
                    </>
                  ) : (
                    <>
                      Enter code <ArrowRight className="size-4" />
                    </>
                  )}
                </button>
              </form>

              {error ? (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 font-mono text-[11px] text-destructive"
                >
                  {error}
                </motion.p>
              ) : null}
            </>
          )}
        </div>

        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3 text-primary/50" />
            mainnet alpha · paper mode free
          </span>
        </p>
      </motion.div>
    </div>
  );
}
