"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { useMarketChart } from "@/hooks/use-market-chart";
import { useClobFeed } from "@/hooks/use-clob-feed";
import { MarketChartLazy } from "@/components/charts/market-chart-lazy";

interface MarketStripProps {
  markets: Array<Record<string, unknown>>;
  opens: Array<Record<string, unknown>>;
  signals?: {
    btc?: { direction?: string; confidence?: number } | null;
    eth?: { direction?: string; confidence?: number } | null;
  } | null;
}

export function MarketStrip({ markets, opens, signals }: MarketStripProps) {
  if (!markets.length) return null;

  return (
    <div className="zg-xfade flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {markets.map((m) => (
        <MarketStripCard
          key={String(m.slug)}
          market={m}
          open={opens.find((p) => p.slug === m.slug)}
          signal={signals?.[String(m.symbol || "").toLowerCase() === "eth" ? "eth" : "btc"]}
        />
      ))}
    </div>
  );
}

function MarketStripCard({
  market,
  open,
  signal,
}: {
  market: Record<string, unknown>;
  open: Record<string, unknown> | undefined;
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
  const dir = String(open?.outcome || "").toLowerCase();
  const entry = open ? Number(open.entryPrice ?? null) : null;
  const target = open && dir ? (dir === "up" ? 1 : 0) : null;

  return (
    <Link
      href="/app/charts"
      className="block w-[260px] shrink-0"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -3 }}
        transition={{ duration: 0.25 }}
        className="zg-frame zg-glass overflow-hidden rounded-xl"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
              {String(market.symbol)}
            </span>
            <span className="rounded border border-border/60 px-1 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
              {duration}
            </span>
            {feed.connected ? (
              <span className="size-1.5 rounded-full bg-[var(--success)]" title="live feed" />
            ) : feed.lastPrice != null ? (
              <span className="size-1.5 rounded-full bg-warning" title="feed reconnecting" />
            ) : null}
          </div>
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              up >= 0.5 ? "text-[var(--success)]" : "text-destructive",
            )}
          >
            {up.toFixed(3)}
          </span>
        </div>
        <div className="h-[120px] px-1 pb-1">
          {historyLoading ? (
            <div className="flex h-full items-center justify-center font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">
              loading…
            </div>
          ) : (
            <MarketChartLazy
              history={history}
              height={112}
              compact
              livePrice={up}
              entryPrice={entry}
              target={target}
              signal={signal}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-1.5">
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            {String(detail?.question || slug).slice(0, 28)}
          </span>
          <ArrowUpRight className="size-3 shrink-0 text-primary" />
        </div>
      </motion.div>
    </Link>
  );
}
