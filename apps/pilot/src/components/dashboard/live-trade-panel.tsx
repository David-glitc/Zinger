"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, ArrowDownRight, Radio, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "@/lib/api";
import { useMarketChart } from "@/hooks/use-market-chart";
import { useClobFeed } from "@/hooks/use-clob-feed";
import { Sparkline } from "@/components/charts/sparkline";
import { CountUp } from "@/components/animations/count-up";
import { PulseDot } from "@/components/animations/pulse-dot";

interface LiveTradePanelProps {
  open: Record<string, unknown> | null;
}

const MAX_SERIES = 150;

export function LiveTradePanel({ open }: LiveTradePanelProps) {
  const slug = String(open?.slug || open?.key || "");
  const { detail, history } = useMarketChart(slug || null, "1d");

  const conditionId =
    detail?.conditionId != null ? String(detail.conditionId) : null;
  const tokenId = detail?.clobTokenIds?.[0]
    ? String(detail.clobTokenIds[0])
    : null;

  const feed = useClobFeed(conditionId, tokenId);

  const shares = Number(open?.shares ?? 0);
  const entry = Number(open?.entryPrice ?? 0);

  const snapshotPrice = useMemo(() => {
    const last = history[history.length - 1];
    return last?.p != null ? Number(last.p) : null;
  }, [history]);

  const livePrice = feed.lastPrice ?? snapshotPrice ?? null;

  const livePnl = useMemo(() => {
    if (livePrice == null || !Number.isFinite(livePrice) || !shares || !entry) {
      return Number(open?.pnl ?? 0) || null;
    }
    return (livePrice - entry) * shares;
  }, [livePrice, entry, shares, open]);

  const lastT = Number(open?.timestamp ?? Date.now());
  const openMs = Number.isFinite(lastT) && lastT > 0 ? lastT : Date.now();

  const seriesRef = useRef<number[]>([]);
  const [series, setSeries] = useState<number[]>([]);
  useEffect(() => {
    if (livePnl == null || !Number.isFinite(livePnl)) return;
    const arr = seriesRef.current;
    const prev = arr[arr.length - 1];
    if (prev !== undefined && Math.abs(prev - livePnl) < 0.001 && arr.length > 1) return;
    arr.push(livePnl);
    if (arr.length > MAX_SERIES) arr.shift();
    setSeries([...arr]);
  }, [livePnl]);

  const pct = entry && livePrice ? ((livePrice - entry) / entry) * 100 : 0;

  if (!open) {
    return (
      <div className="zg-glass flex min-h-44 flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center">
        <span className="relative flex size-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
          <Target className="size-4 text-primary" />
          <span className="zg-live-dot absolute -right-0.5 -top-0.5" />
        </span>
        <div>
          <p className="font-display text-[15px] font-[500] text-foreground">
            No open trade
          </p>
          <p className="mx-auto mt-1 max-w-xs font-sans text-[12px] text-muted-foreground">
            Start a session to hunt entries. Live fills and this chart will
            appear here the moment a position opens.
          </p>
        </div>
      </div>
    );
  }

  const positive = (livePnl ?? 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="zg-glass relative overflow-hidden rounded-2xl p-5"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
              <Radio className="size-3" />
              Live trade
            </span>
            <span
              className={cn(
                "flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em]",
                feed.connected ? "text-[var(--success)]" : "text-warning",
              )}
            >
              <PulseDot active={feed.connected} />
              {feed.connected ? "feed live" : "reconnecting…"}
            </span>
          </div>
          <p className="mt-2 truncate font-display text-[16px] font-[500] tracking-tight text-foreground">
            {String(open?.asset || open?.symbol || "?").toUpperCase()}
            <span className="mx-1.5 text-muted-foreground">·</span>
            <span className="font-mono text-[12px] text-muted-foreground">
              {String(open?.outcome || "").toUpperCase()}
            </span>
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {String(open?.title || open?.slug || "—")}
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            Open P&L
          </p>
          <p
            className={cn(
              "flex items-center justify-end gap-1 font-display text-[22px] font-[600] tabular-nums tracking-tight",
              positive ? "text-[var(--success)]" : "text-destructive",
            )}
          >
            {livePnl != null ? (
              <>
                {positive ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                <CountUp value={livePnl} prefix="$" decimals={2} />
              </>
            ) : (
              "—"
            )}
          </p>
          <p
            className={cn(
              "font-mono text-[10px] tabular-nums",
              pct >= 0 ? "text-[var(--success)]" : "text-destructive",
            )}
          >
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(1)}% vs entry
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field k="Shares" v={`${shares.toFixed(2)}`} />
        <Field k="Entry" v={money(entry, 2)} />
        <Field k="Live price" v={livePrice != null ? livePrice.toFixed(3) : "—"} />
        <Field
          k="Position value"
          v={livePrice != null ? money(shares * livePrice, 2) : money(Number(open?.size ?? 0), 2)}
        />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            Trade value · live
          </span>
          <span className="font-mono text-[9px] text-muted-foreground/60">
            {openMs > 0
              ? `opened ${new Date(openMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/60 bg-background/40">
          <Sparkline
            points={series.length > 1 ? series : [0, (livePnl ?? 0) || 0]}
            height={72}
            tone={positive ? "up" : "down"}
          />
        </div>
      </div>
    </motion.div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2">
      <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">
        {k}
      </p>
      <p className="mt-0.5 truncate font-mono text-[12px] tabular-nums text-foreground">
        {v}
      </p>
    </div>
  );
}
