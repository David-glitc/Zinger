"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useMarketChart } from "@/hooks/use-market-chart";
import { useClobFeed } from "@/hooks/use-clob-feed";
import { MarketChartLazy } from "@/components/charts/market-chart-lazy";

interface MarketStripProps {
  markets: Array<Record<string, unknown>>;
  signals?: {
    btc?: { direction?: string; confidence?: number } | null;
    eth?: { direction?: string; confidence?: number } | null;
  } | null;
}

export function MarketStrip({ markets, signals }: MarketStripProps) {
  if (!markets.length) return null;
  return (
    <div className="zg-xfade flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {markets.map((m) => (
        <MarketStripCard
          key={String(m.slug)}
          market={m}
          signal={signals?.[String(m.symbol || "").toLowerCase() === "eth" ? "eth" : "btc"]}
        />
      ))}
    </div>
  );
}

function MarketStripCard({
  market,
  signal,
}: {
  market: Record<string, unknown>;
  signal?: { direction?: string; confidence?: number } | null;
}) {
  const slug = String(market.slug || "");
  const duration = String(market.duration || "");
  const { detail, history, historyLoading } = useMarketChart(slug, duration);

  const conditionId = detail?.conditionId ? String(detail.conditionId) : null;
  const tokenId = detail?.clobTokenIds?.[0] ? String(detail.clobTokenIds[0]) : null;
  const feed = useClobFeed(conditionId, tokenId);

  const prices = (market.prices ?? {}) as Record<string, unknown>;
  const up = feed.lastPrice ?? Number(prices.up ?? 0);

  return (
    <Link href="/app/charts" className="block w-[240px] shrink-0">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        transition={{ duration: 0.2 }}
        className="zg-card group overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
              {String(market.symbol)}
            </span>
            <span className="rounded border border-border/60 px-1 py-px font-mono text-[8px] uppercase text-muted-foreground">
              {duration}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {feed.connected ? (
              <span className="size-1.5 rounded-full bg-[var(--up)] shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            ) : feed.lastPrice != null ? (
              <span className="size-1.5 rounded-full bg-[var(--warning)]" />
            ) : null}
            <motion.span
              key={up.toFixed(3)}
              className={cn("font-mono text-[12px] font-semibold tabular-nums", up >= 0.5 ? "text-[var(--up)]" : "text-[var(--down)]")}
            >
              {up.toFixed(3)}
            </motion.span>
          </div>
        </div>

        <div className="mx-3 h-0.5 rounded-full bg-muted">
          <motion.div
            className={cn("h-full rounded-full", up >= 0.5 ? "bg-[var(--up)]" : "bg-[var(--down)]")}
            style={{ width: `${up * 100}%` }}
          />
        </div>

        <div className="h-[100px] px-1 pb-1">
          {historyLoading ? (
            <div className="flex h-full items-center justify-center font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/40">
              loading
            </div>
          ) : (
            <MarketChartLazy history={history} height={96} compact livePrice={up} signal={signal} />
          )}
        </div>

        <div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            {String(detail?.question || slug).slice(0, 24)}
          </span>
          <ArrowRight className="size-3 shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </div>
      </motion.div>
    </Link>
  );
}
