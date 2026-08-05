"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Share2, Check, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

type ShareData = {
  pnl: number;
  entryPrice?: string | null;
  exitPrice?: string | null;
  outcome?: string | null;
  asset?: string | null;
  slug?: string | null;
  timestamp: number;
};

export function ShareCard({ token }: { token: string }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/share?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.data) setData(d.data as ShareData);
        else setError("Share link expired or not found.");
      })
      .catch(() => setError("Could not load shared trade."))
      .finally(() => setLoading(false));
  }, [token]);

  const positive = (data?.pnl ?? 0) >= 0;
  const pnlStr = `${positive ? "+" : "-"}$${Math.abs(data?.pnl ?? 0).toFixed(2)}`;
  const pct = data?.entryPrice && data?.exitPrice
    ? `${((Number(data.exitPrice) - Number(data.entryPrice)) / Number(data.entryPrice) * 100).toFixed(1)}%`
    : null;

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
          <Radio className="size-4 animate-spin" />
          Loading trade…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="text-center">
          <p className="font-display text-lg text-foreground">{error || "Not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-16">
      <div className="pointer-events-none fixed inset-0 -z-10 zg-aurora" />
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh] zg-grid" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-sm"
      >
        <div className="zg-glass relative overflow-hidden rounded-2xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          <div className="p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
                  <span className="zg-live-dot" />
                </span>
                <span className="font-display text-[16px] font-[500] tracking-tight text-foreground">
                  Zinger
                </span>
              </div>
              <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                {data.asset || "TRADE"}
              </span>
            </div>

            <div className="mt-5 border-t border-border/60 pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Realized P&L
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={cn(
                    "font-display text-[36px] font-[600] tracking-tight",
                    positive ? "text-[var(--success)]" : "text-destructive",
                  )}
                >
                  {pnlStr}
                </span>
                {pct ? (
                  <span
                    className={cn(
                      "font-mono text-[13px] tabular-nums",
                      positive ? "text-[var(--success)]" : "text-destructive",
                    )}
                  >
                    {positive ? "▲" : "▼"} {pct}
                  </span>
                ) : null}
              </div>
            </div>

            {(data.entryPrice || data.exitPrice || data.outcome) ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {data.entryPrice ? (
                  <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">Entry</p>
                    <p className="mt-0.5 font-mono text-[13px] tabular-nums text-foreground">{Number(data.entryPrice).toFixed(3)}</p>
                  </div>
                ) : null}
                {data.exitPrice ? (
                  <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">Exit</p>
                    <p className="mt-0.5 font-mono text-[13px] tabular-nums text-foreground">
                      {Number(data.exitPrice) <= 0.01 ? "0.000" : Number(data.exitPrice).toFixed(3)}
                    </p>
                  </div>
                ) : null}
                {data.outcome ? (
                  <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">Outcome</p>
                    <p
                      className={cn(
                        "mt-0.5 font-mono text-[11px] font-semibold uppercase tabular-nums",
                        String(data.outcome).toLowerCase() === "up"
                          ? "text-[var(--success)]"
                          : "text-destructive",
                      )}
                    >
                      {String(data.outcome)}
                    </p>
                  </div>
                ) : null}
                {data.slug ? (
                  <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">Market</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-foreground">
                      {String(data.slug).split("-").slice(0, 2).join("/")}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="border-t border-border/60 px-6 py-3">
            <button
              onClick={copyLink}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-[var(--success)]" />
                  Copied
                </>
              ) : (
                <>
                  <Share2 className="size-3.5" />
                  Copy link
                </>
              )}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/50">
          Shared via Zinger · usezinger.xyz
        </p>
      </motion.div>
    </div>
  );
}
