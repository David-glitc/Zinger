"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Info, TrendingUp, Shield, DollarSign } from "lucide-react";

function mini(v: number | null | undefined, d = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}

function pct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function Bar({ value, max = 1, label }: { value: number; max?: number; label: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 font-mono text-[10px] text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-14 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
        {mini(value * 100, 1)}%
      </span>
    </div>
  );
}

interface CapitalInsightsProps {
  edgeGate?: {
    n?: number;
    wins?: number;
    losses?: number;
    wr?: number;
    avgWin?: number;
    avgLoss?: number;
    expectancy?: number;
    breakEvenWr?: number;
    kelly?: number;
    totalPnl?: number;
    lookback?: number;
    edgeOk?: boolean;
    liveAllowed?: boolean;
    reason?: string;
  } | null;
  config?: {
    kellyFraction?: number;
    maxPositionPct?: number;
    minConfidence?: number;
  } | null;
  cash?: number;
}

export function CapitalInsights({ edgeGate, config, cash }: CapitalInsightsProps) {
  if (!edgeGate) return null;

  const bankroll = cash || 0;
  const kellyRec = edgeGate.kelly || 0;
  const configKelly = config?.kellyFraction || 0;
  const maxPosPct = config?.maxPositionPct || 0;
  const maxPosDollars = bankroll * maxPosPct;
  const safetyMargin = configKelly > 0 ? (configKelly / Math.max(kellyRec, 0.001)).toFixed(1) : "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="zg-card-premium p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-primary" />
          <h3 className="font-display text-base font-medium tracking-tight text-foreground">
            Capital insights
          </h3>
        </div>
        <span
          className={cn(
            "rounded-2xl px-2.5 py-0.5 font-mono text-[10px] font-medium",
            edgeGate.liveAllowed
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {edgeGate.liveAllowed ? "Live ready" : "Paper lock"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted p-3">
          <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            <DollarSign className="size-3" />
            Kelly rec
          </p>
          <p className="mt-1 font-mono text-[20px] font-semibold tabular-nums tracking-tight text-foreground">
            {pct(kellyRec)}
          </p>
          <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">
            {kellyRec > 0
              ? `Bet ${pct(kellyRec)} of bankroll`
              : "No positive edge yet"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted p-3">
          <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            <Shield className="size-3" />
            Max position
          </p>
          <p className="mt-1 font-mono text-[20px] font-semibold tabular-nums tracking-tight text-foreground">
            ${maxPosDollars.toFixed(2)}
          </p>
          <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">
            {pct(maxPosPct)} of ${bankroll.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted p-3">
          <p className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            <Info className="size-3" />
            Expectancy
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-[20px] font-semibold tabular-nums tracking-tight",
              (edgeGate.expectancy || 0) > 0 ? "text-success" : "text-destructive",
            )}
          >
            ${mini(edgeGate.expectancy)}
          </p>
          <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">
            {edgeGate.wins != null && edgeGate.losses != null
              ? `${edgeGate.wins}W ${edgeGate.losses}L · ${pct(edgeGate.wr)} WR`
              : "No trade history"}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted p-3">
        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          Sizing breakdown
        </p>
        <Bar value={kellyRec} max={0.5} label="Kelly suggestion" />
        <Bar value={configKelly} max={0.5} label="Your cap" />
        <Bar value={maxPosPct} max={0.5} label="Max position %" />
        {config?.minConfidence ? (
          <Bar value={config.minConfidence} max={1} label="Conf threshold" />
        ) : null}
      </div>

      <p className="mt-2 font-sans text-[11px] leading-relaxed text-muted-foreground">
        {edgeGate.reason || "Edge gate evaluating paper trades…"}
        {kellyRec > 0
          ? ` Kelly recommends ${pct(kellyRec)} per trade (${safetyMargin}x safety margin on your cap).`
          : ""}
      </p>
    </motion.div>
  );
}
