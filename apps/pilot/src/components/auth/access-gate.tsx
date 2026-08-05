"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Key, ArrowRight, Loader2, Sparkles, PlayCircle, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "zg_access";

interface AccessGateProps {
  children: React.ReactNode;
}

export function AccessGate({ children }: AccessGateProps) {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState<"idle" | "loading" | "sent" | "notFound">("idle");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { code?: string; paper?: boolean; ts?: number };
        if (parsed.code || parsed.paper) {
          setGranted(true);
          return;
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setGranted(false);
  }, []);

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
        const data = (await res.json()) as { ok: boolean; error?: string; email?: string };

        if (!data.ok) {
          const msgs: Record<string, string> = {
            not_found: "That access code isn't valid. Check your email or try paper mode.",
            already_used: "This code has already been used.",
            invalid_code: "Enter a valid access code from your invitation email.",
            storage_unavailable: "The gate is warming up. Try again.",
          };
          setError(msgs[data.error ?? ""] ?? "Something went wrong. Try again.");
          setStatus("error");
          return;
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: c, ts: Date.now(), email: data.email }));
        setGranted(true);
      } catch {
        setError("Couldn't reach the access service. Check your connection.");
        setStatus("error");
      }
    },
    [code],
  );

  async function handlePaperMode() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ paper: true, ts: Date.now() }));
    setGranted(true);
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault();
    setRecoveryStatus("loading");
    try {
      const res = await fetch(`/api/access?email=${encodeURIComponent(recoveryEmail.trim().toLowerCase())}`);
      const data = (await res.json()) as { ok: boolean; code?: string };
      if (data.ok && data.code) {
        setRecoveryStatus("sent");
      } else {
        setRecoveryStatus("notFound");
      }
    } catch {
      setRecoveryStatus("notFound");
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
            Alpha access
          </h1>
          <p className="mx-auto mt-2 max-w-[280px] font-sans text-[13px] leading-relaxed text-muted-foreground">
            Zinger is invite-only for live trading. Enter your access code, or try paper mode with simulated funds.
          </p>

          {!showRecovery ? (
            <>
              <form onSubmit={submitCode} className="mt-5">
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

              <div className="mt-4 border-t border-border/50 pt-4">
                <button
                  onClick={handlePaperMode}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-foreground transition-colors hover:bg-muted/50"
                >
                  <PlayCircle className="size-4 text-primary" />
                  Try paper mode — no code needed
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowRecovery(true)}
                className="mt-3 font-mono text-[10px] text-muted-foreground/70 hover:text-primary transition-colors"
              >
                <Mail className="mr-1 inline size-3" />
                Lost your access code?
              </button>
            </>
          ) : (
            <div className="mt-5">
              <p className="mb-3 font-sans text-[12px] text-muted-foreground">
                Enter the email you signed up with. We&apos;ll look up your code.
              </p>
              <form onSubmit={handleRecovery}>
                <input
                  type="email"
                  value={recoveryEmail}
                  onChange={(e) => {
                    setRecoveryEmail(e.target.value);
                    if (recoveryStatus !== "idle") setRecoveryStatus("idle");
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="zg-num w-full"
                  aria-label="Email for code recovery"
                />
                <button
                  type="submit"
                  disabled={recoveryStatus === "loading" || !recoveryEmail.trim()}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white zg-volt-btn disabled:opacity-60"
                >
                  {recoveryStatus === "loading" ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Looking up…
                    </>
                  ) : (
                    "Find my code"
                  )}
                </button>
              </form>

              {recoveryStatus === "sent" ? (
                <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 font-mono text-[11px] text-[var(--success)]">
                  Code found! Check your inbox for your access code from when you joined the waitlist.
                </motion.p>
              ) : recoveryStatus === "notFound" ? (
                <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 font-mono text-[11px] text-destructive">
                  No code found for that email. Try paper mode or join the waitlist.
                </motion.p>
              ) : null}

              <button
                type="button"
                onClick={() => { setShowRecovery(false); setRecoveryStatus("idle"); }}
                className="mt-4 font-mono text-[10px] text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                ← Back
              </button>
            </div>
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
