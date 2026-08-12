"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useMarketChart } from "@/hooks/use-market-chart";
import { useClobTickFeed } from "@/hooks/use-clob-tick-feed";
import { useClobDepth } from "@/hooks/use-clob-depth";
import { MarketChartLazy } from "@/components/charts/market-chart-lazy";
import { PulseDot } from "@/components/animations/pulse-dot";

interface LiveMarketCardProps {
  market: Record<string, unknown>;
  signal?: { direction?: string; confidence?: number } | null;
  compact?: boolean;
  onClick?: () => void;
}

export function LiveMarketCard({ market, signal, compact, onClick }: LiveMarketCardProps) {
  const slug = String(market.slug || "");
  const duration = String(market.duration || "");
  const { detail, history, historyLoading, tokenId } = useMarketChart(slug, duration);

  const tickFeed = useClobTickFeed(
    detail?.conditionId ? String(detail.conditionId) : null,
    tokenId,
  );
  const depthQuery = useClobDepth(tokenId);

  const prices = (market.prices ?? {}) as Record<string, unknown>;
  const up = tickFeed.lastPrice ?? Number(prices.up ?? 0);
  const down = tickFeed.lastPrice != null ? 1 - tickFeed.lastPrice : Number(prices.down ?? 0);

  const spread = useMemo(() => {
    if (tickFeed.bestAsk != null && tickFeed.bestBid != null) {
      return tickFeed.bestAsk - tickFeed.bestBid;
    }
    return null;
  }, [tickFeed.bestAsk, tickFeed.bestBid]);

  const isLive = tickFeed.connected && tickFeed.ticks.length > 0;

  const card = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={!compact ? { y: -2 } : undefined}
      transition={{ duration: 0.2 }}
      className={cn(
        "zg-card-premium group relative overflow-hidden",
        !compact && "cursor-pointer",
      )}
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
        <div className="flex items-center gap-2">
          {isLive ? (
            <PulseDot active className="text-[var(--success)]" />
          ) : tickFeed.lastPrice != null ? (
            <span className="size-1.5 rounded-full bg-[var(--warning)]" />
          ) : null}
          <span className="font-mono text-[12px] font-semibold tabular-nums text-[var(--success)]">
            {up.toFixed(3)}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">/</span>
          <span className="font-mono text-[12px] font-semibold tabular-nums text-[var(--down)]">
            {down.toFixed(3)}
          </span>
        </div>
      </div>

      <div className="mx-3 h-0.5 rounded-full bg-muted overflow-hidden flex">
        <motion.div
          className="h-full rounded-full bg-[var(--success)] shadow-[0_0_8px_var(--success)]"
          style={{ width: `${up * 100}%` }}
        />
        <motion.div
          className="h-full rounded-full bg-[var(--down)]"
          style={{ width: `${down * 100}%` }}
        />
      </div>

      <div className={cn(!compact && "h-[120px]", compact && "h-[80px]", "px-1 pb-1")}>
        {historyLoading ? (
          <div className="zg-shimmer h-full w-full rounded" />
        ) : (
          <MarketChartLazy
            history={history}
            liveTicks={tickFeed.ticks}
            height={compact ? 76 : 116}
            compact
            signal={signal}
            currentPrice={isLive ? tickFeed.lastPrice : null}
          />
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border/40 px-3 py-2 font-mono text-[9px] tabular-nums">
        <span className="text-muted-foreground">
          <span className="text-[var(--success)]">B</span>{" "}
          {tickFeed.bestBid != null ? tickFeed.bestBid.toFixed(3) : "—"}
        </span>
        <span className="text-border">·</span>
        <span className="text-muted-foreground">
          <span className="text-[var(--down)]">A</span>{" "}
          {tickFeed.bestAsk != null ? tickFeed.bestAsk.toFixed(3) : "—"}
        </span>
        {spread != null ? (
          <>
            <span className="text-border">·</span>
            <span className={cn(spread < 0.005 ? "text-primary" : "text-muted-foreground/60")}>
              {(spread * 100).toFixed(1)}¢
            </span>
          </>
        ) : null}
        {detail?.volume ? (
          <>
            <span className="text-border">·</span>
            <span className="text-muted-foreground/60">
              {detail.volume >= 1000
                ? `${(detail.volume / 1000).toFixed(1)}k`
                : detail.volume.toFixed(0)}
            </span>
          </>
        ) : null}
        {depthQuery.data ? (
          <span className="ml-auto text-muted-foreground/60">
            imb {(depthQuery.data.imbalance * 100).toFixed(0)}%
          </span>
        ) : null}
      </div>
    </motion.div>
  );

  if (onClick) {
    return <button onClick={onClick} className="w-full text-left">{card}</button>;
  }

  return (
    <Link href="/app/markets" className="block w-full">
      {card}
    </Link>
  );
}
