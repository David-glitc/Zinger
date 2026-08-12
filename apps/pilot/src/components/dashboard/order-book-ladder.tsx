"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { OrderBookDepth } from "@/lib/api";
import { PulseDot } from "@/components/animations/pulse-dot";

function LadderRow({
  price,
  size,
  cum,
  maxCum,
  side,
}: {
  price: number;
  size: number;
  cum: number;
  maxCum: number;
  side: "bid" | "ask";
}) {
  const pct = maxCum > 0 ? Math.min(100, (cum / maxCum) * 100) : 0;
  return (
    <div className="relative grid grid-cols-[4.5rem_3.5rem_3.5rem] items-center gap-1 px-3 py-[3px] font-mono text-[10px] tabular-nums">
      <div
        className={cn(
          "absolute top-0 bottom-0 right-0 transition-[width] duration-300",
          side === "bid" ? "bg-[var(--up)]/10" : "bg-[var(--down)]/10",
        )}
        style={{ width: `${pct}%` }}
      />
      <span
        className={cn(
          "relative z-10",
          side === "bid" ? "text-[var(--up)]" : "text-[var(--down)]",
        )}
      >
        {price.toFixed(3)}
      </span>
      <span className="relative z-10 text-right text-muted-foreground">{size.toFixed(1)}</span>
      <span className="relative z-10 text-right text-muted-foreground/70">{cum.toFixed(0)}</span>
    </div>
  );
}

export function OrderBookLadder({
  depth,
  connected,
  label,
}: {
  depth?: OrderBookDepth | null;
  connected: boolean;
  label?: string;
}) {
  const maxCum = useMemo(() => {
    if (!depth) return 0;
    const lastBid = depth.bids[depth.bids.length - 1]?.cum ?? 0;
    const lastAsk = depth.asks[depth.asks.length - 1]?.cum ?? 0;
    return Math.max(lastBid, lastAsk, 1);
  }, [depth]);

  const rows = useMemo(() => {
    if (!depth) return { asks: [], bids: [] };
    return {
      asks: [...depth.asks].reverse(),
      bids: depth.bids,
    };
  }, [depth]);

  if (!depth) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/40 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
      >
        <PulseDot active={connected} />
        <span>{connected ? "loading book…" : "connecting…"}</span>
      </motion.div>
    );
  }

  const spreadCents = depth.spread > 0 ? depth.spread * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-xl border border-border/60 bg-background/40"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          Order book{label ? ` · ${label}` : ""}
        </p>
        <div className="flex items-center gap-2 font-mono text-[9px] text-muted-foreground">
          <span
            className={cn(
              "rounded px-1.5 py-0.5",
              depth.spreadPct > 0 && depth.spreadPct < 1
                ? "border border-primary/30 text-primary"
                : "border border-border/60 text-muted-foreground",
            )}
          >
            sp {depth.spreadPct.toFixed(2)}%
          </span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5",
              depth.imbalance > 0.2
                ? "border border-[var(--up)]/30 text-[var(--up)]"
                : depth.imbalance < -0.2
                  ? "border border-[var(--down)]/30 text-[var(--down)]"
                  : "border border-border/60 text-muted-foreground",
            )}
          >
            {depth.imbalance > 0 ? "BID+" : depth.imbalance < 0 ? "ASK+" : "FLAT"}
          </span>
          <span className="flex items-center gap-1">
            <PulseDot active={connected} />
            {connected ? "live" : "…"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[4.5rem_3.5rem_3.5rem] gap-1 border-b border-border/40 bg-muted/20 px-3 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      <div className="space-y-px py-1">
        {rows.asks.length === 0 && rows.bids.length === 0 ? (
          <p className="py-8 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            No book yet
          </p>
        ) : (
          <>
            {rows.asks.map((a, i) => (
              <LadderRow key={`a${i}`} price={a.price} size={a.size} cum={a.cum} maxCum={maxCum} side="ask" />
            ))}

            {depth.bestBid > 0 || depth.bestAsk > 0 ? (
              <div className="my-1 grid grid-cols-[4.5rem_3.5rem_3.5rem] gap-1 border-y border-border/40 bg-muted/20 px-3 py-1.5 font-mono text-[9px] text-muted-foreground">
                <span className="text-foreground">{depth.mid > 0 ? depth.mid.toFixed(3) : "—"}</span>
                <span className="text-right">mid</span>
                <span className="text-right">{spreadCents > 0 ? `${spreadCents.toFixed(1)}¢` : "—"}</span>
              </div>
            ) : null}

            {rows.bids.map((b, i) => (
              <LadderRow key={`b${i}`} price={b.price} size={b.size} cum={b.cum} maxCum={maxCum} side="bid" />
            ))}
          </>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-border/40 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>
          bid ${depth.totalBidVol.toFixed(0)}
        </span>
        <span>|</span>
        <span>
          ask ${depth.totalAskVol.toFixed(0)}
        </span>
        <span>|</span>
        <span className={cn(depth.imbalance > 0 ? "text-[var(--up)]" : depth.imbalance < 0 ? "text-[var(--down)]" : "")}>
          imb {(depth.imbalance * 100).toFixed(0)}%
        </span>
        <span className="ml-auto">
          {depth.bidCount}/{depth.askCount} lvls
        </span>
      </div>
    </motion.div>
  );
}
