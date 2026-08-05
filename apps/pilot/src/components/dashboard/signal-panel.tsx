"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Signal = {
  direction?: string;
  confidence?: number;
  score?: number;
  action?: string;
};

function SignalRow({
  label,
  s,
  delay,
}: {
  label: string;
  s?: Signal | null;
  delay?: number;
}) {
  const dir = s?.direction ?? "neutral";
  const isUp = dir === "up";
  const isDown = dir === "down";
  const conf = Number(s?.confidence ?? 0);
  const confPct = Math.min(100, Math.max(0, conf * 100));
  const fillColor =
    conf >= 0.6 ? "bg-[var(--up)]" : conf >= 0.35 ? "bg-[var(--warning)]" : "bg-[var(--down)]/70";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: delay ?? 0, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex items-center gap-3 rounded-lg"
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          isUp && "bg-[var(--up)]/10 text-[var(--up)]",
          isDown && "bg-[var(--down)]/10 text-[var(--down)]",
          !isUp && !isDown && "bg-muted text-muted-foreground",
        )}
      >
        {isUp ? <TrendingUp className="size-4" /> : isDown ? <TrendingDown className="size-4" /> : <Minus className="size-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
            {label}
          </span>
          <span
            className={cn(
              "font-mono text-[11px] font-semibold tabular-nums",
              isUp && "text-[var(--up)]",
              isDown && "text-[var(--down)]",
              !isUp && !isDown && "text-muted-foreground",
            )}
          >
            {(conf * 100).toFixed(0)}%
          </span>
        </div>
        <div className="zg-probability-bar">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${confPct}%` }}
            transition={{ duration: 0.5, delay: (delay ?? 0) + 0.15, ease: "easeOut" }}
            className={cn("zg-probability-bar-fill", fillColor)}
          />
        </div>
        <div className="mt-1 flex justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
            {String(s?.action ?? "hold").slice(0, 6)}
          </span>
          <span className="font-mono text-[9px] tabular-nums text-muted-foreground/50">
            score {(s?.score ?? 0).toFixed(2)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export function SignalPanel({
  btc,
  eth,
  ageMs,
}: {
  btc?: Signal | null;
  eth?: Signal | null;
  ageMs?: number | null;
}) {
  const hasSignal = !!btc || !!eth;
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-surface p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className={cn("zg-live-dot", hasSignal ? "" : "!bg-muted-foreground/40")} style={!hasSignal ? { animation: "none" } : undefined} />
          Signals
        </span>
        {ageMs != null ? (
          <span className="ml-auto font-mono text-[9px] text-muted-foreground/50">
            {Math.round(ageMs / 1000)}s
          </span>
        ) : null}
      </div>
      <SignalRow label="BTC" s={btc} delay={0} />
      <SignalRow label="ETH" s={eth} delay={0.06} />
    </div>
  );
}
