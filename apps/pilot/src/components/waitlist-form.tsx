"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AtSign, Mail, PartyPopper, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "done" }
  | { state: "error"; message: string };

export function WaitlistForm({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/waitlist")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Number(d?.count) > 0) setCount(Number(d.count));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status.state === "loading") return;
    setStatus({ state: "loading" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, xHandle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({
          state: "error",
          message:
            data?.error === "invalid_email"
              ? "That email doesn't look right — double-check and try again."
              : "Signup service is warming up. Try again in a moment.",
        });
        return;
      }
      setCount((c) => (data?.already ? c : (c ?? 0) + 1));
      setStatus({ state: "done" });
    } catch {
      setStatus({
        state: "error",
        message: "Couldn't reach the signup service. Check your connection and try again.",
      });
    }
  }

  if (status.state === "done") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "zg-glass flex flex-col items-center gap-3 rounded-2xl px-6 py-8 text-center",
          className,
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--success)]/15">
          <PartyPopper className="size-5 text-[var(--success)]" />
        </span>
        <div>
          <p className="font-display text-[16px] font-[500] text-foreground">
            You&apos;re on the list
          </p>
          <p className="mx-auto mt-1 max-w-sm font-sans text-[12px] text-muted-foreground">
            Mainnet alpha invite coming to{" "}
            <span className="text-foreground">{email}</span> as soon as the vault
            opens. Talk soon.
          </p>
        </div>
        {count != null ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
            {count} on the list already
          </p>
        ) : null}
      </motion.div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className={cn("zg-glass rounded-2xl p-4 sm:p-5", className)}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="zg-num w-full pl-9"
            aria-label="Email address"
          />
        </div>
        <div className="relative">
          <AtSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={xHandle}
            onChange={(e) => setXHandle(e.target.value)}
            placeholder="@yourhandle (optional)"
            autoComplete="off"
            className="zg-num w-full pl-9"
            aria-label="X handle (optional)"
          />
        </div>
        <button
          type="submit"
          disabled={status.state === "loading"}
          className={cn(
            "zg-volt-btn inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white",
            status.state === "loading" && "opacity-70",
          )}
        >
          {status.state === "loading" ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Joining…
            </>
          ) : (
            "Notify me"
          )}
        </button>
      </div>

      {status.state === "error" ? (
        <p className="mt-2.5 font-mono text-[11px] text-destructive">
          {status.message}
        </p>
      ) : (
        <p className="mt-2.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          <span className="zg-live-dot" />
          {count != null ? `${count} already on the list` : "mainnet alpha · invite-only"}
        </p>
      )}
    </form>
  );
}
