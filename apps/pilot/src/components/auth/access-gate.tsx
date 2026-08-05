"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Key, ArrowRight, Loader2, Sparkles } from "lucide-react";
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

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const { code: storedCode } = JSON.parse(stored) as { code: string; ts: number };
        if (storedCode.length >= 6) {
          setGranted(true);
          return;
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setGranted(false);
  }, []);

  const submit = useCallback(
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
        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          email?: string;
          code?: string;
        };

        if (!data.ok) {
          const msgs: Record<string, string> = {
            not_found: "That access code isn't valid. Check your email and try again.",
            already_used: "This code has already been used.",
            invalid_code: "Enter a valid access code from your invitation email.",
            storage_unavailable: "The gate is warming up. Try again in a moment.",
          };
          setError(msgs[data.error ?? ""] ?? "Something went wrong. Try again.");
          setStatus("error");
          return;
        }

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ code: c, ts: Date.now(), email: data.email }),
        );
        setGranted(true);
      } catch {
        setError("Couldn't reach the access service. Check your connection.");
        setStatus("error");
      }
    },
    [code],
  );

  if (granted === null) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (granted) return <>{children}</>;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-16">
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

          <h1 className="mt-4 font-display text-[20px] font-[500] tracking-[-0.02em] text-foreground">
            Alpha access
          </h1>
          <p className="mx-auto mt-2 max-w-[260px] font-sans text-[13px] leading-relaxed text-muted-foreground">
            Zinger is invite-only during mainnet alpha. Enter the access code from
            your invitation email.
          </p>

          <form onSubmit={submit} className="mt-5">
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
                  Enter <ArrowRight className="size-4" />
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
        </div>

        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3 text-primary/50" />
            mainnet alpha · invite-only
          </span>
        </p>
      </motion.div>
    </div>
  );
}
