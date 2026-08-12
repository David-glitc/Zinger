"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Loader2, ArrowRight, Sparkles, CheckCircle2, PlayCircle } from "lucide-react";
import { CountUp } from "@/components/animations/count-up";

export default function Hero() {
  const [tvl, setTvl] = useState(0);
  const [users, setUsers] = useState(0);
  const [email, setEmail] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => {
        setTvl(Math.round(d.tvl || 0));
        setUsers(d.totalUsers || 0);
      })
      .catch(() => {});
  }, []);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          xHandle: xHandle.trim().replace(/^@+/, ""),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="relative mx-auto flex min-h-[92vh] max-w-6xl flex-col justify-center px-6 pb-16 pt-28 sm:px-8 sm:pt-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="self-start inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary"
      >
        Polymarket CLOB agent
        <span className="ml-1 flex size-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="mt-5 max-w-4xl font-display text-[clamp(2.5rem,8vw,5.5rem)] leading-[1.06] tracking-[-0.03em] text-foreground"
      >
        Trade Polymarket
        <br />
        <span className="text-primary">on autopilot</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="mt-5 max-w-xl font-sans text-lg leading-relaxed text-muted-foreground sm:text-xl"
      >
        Connect your wallet, set risk bands, and let Zinger execute directional
        BTC/ETH trades on Polymarket CLOB. Invite-only alpha.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="mt-8"
      >
        {status !== "done" ? (
          <form onSubmit={handleJoin} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1 max-w-sm">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (status === "error") setStatus("idle"); }}
                placeholder="you@email.com"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-border/70 bg-muted/50 px-4 py-3 font-sans text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                aria-label="Email address"
              />
              <input
                type="text"
                value={xHandle}
                onChange={(e) => setXHandle(e.target.value)}
                placeholder="@x_handle (optional)"
                className="mt-2 w-full rounded-xl border border-border/70 bg-muted/50 px-4 py-2.5 font-sans text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                aria-label="X / Twitter handle"
              />
            </div>
            <button
              type="submit"
              disabled={status === "loading" || !email.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-mono text-[12px] uppercase tracking-[0.14em] text-white zg-volt-btn disabled:opacity-60 h-fit"
            >
              {status === "loading" ? (
                <><Loader2 className="size-4 animate-spin" /> Joining…</>
              ) : (
                <>Join waitlist <ArrowRight className="size-4" /></>
              )}
            </button>
          </form>
        ) : (
          <div className="max-w-sm rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/5 px-5 py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 text-[var(--success)] shrink-0" />
              <p className="font-sans text-sm text-foreground">
                You&apos;re on the list. We&apos;ll email your access code when your account is ready.
              </p>
            </div>
            <Link
              href="/app"
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary hover:underline"
            >
              Start exploring paper mode <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}

        {status === "error" ? (
          <p className="mt-2 font-mono text-[11px] text-destructive">
            Something went wrong. Try again or DM <a href="https://x.com/usezinger" className="underline">@usezinger</a>.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary/20"
          >
            <PlayCircle className="size-3.5" /> Try paper mode — free
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center gap-1 font-sans text-[13px] text-muted-foreground transition-colors hover:text-primary"
          >
            Have a code? <span className="text-primary underline">Enter it</span>
          </Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 font-sans text-[13px] text-muted-foreground"
      >
        <span className="inline-flex items-center gap-1 text-primary">
          <Sparkles className="size-3.5" /> Paper mode free
        </span>
        <span className="hidden sm:inline text-border">·</span>
        <span>Powered by Polymarket CLOB</span>
        <span className="hidden sm:inline text-border">·</span>
        <span>1% deposit fee</span>
        <span className="hidden sm:inline text-border">·</span>
        <span>No token gate</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.5 }}
        className="mt-10 flex flex-wrap items-center gap-6 rounded-2xl border border-border/60 bg-background/40 p-5 sm:gap-10 sm:px-8"
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Total value deposited
          </p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl">
            <CountUp value={tvl} decimals={0} prefix="$" />
          </p>
        </div>
        <div className="hidden h-10 w-px bg-border/60 sm:block" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Wallets
          </p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl">
            <CountUp value={users} decimals={0} />
          </p>
        </div>
        <div className="hidden h-10 w-px bg-border/60 sm:block" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Engine
          </p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
            CLOB
          </p>
        </div>
        <div className="hidden h-10 w-px bg-border/60 sm:block" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Network
          </p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
            Polygon
          </p>
        </div>
      </motion.div>
    </section>
  );
}
