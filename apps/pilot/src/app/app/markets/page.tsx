"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useMarketChart, usePriceHistory } from "@/hooks/use-market-chart";
import { useClobTickFeed } from "@/hooks/use-clob-tick-feed";
import { useClobDepth } from "@/hooks/use-clob-depth";
import { money } from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { TrendingDown, Target, History } from "lucide-react";
import { PageHeading, SectionLabel } from "@/components/app/app-ui";
import { MarketChartLazy } from "@/components/charts/market-chart-lazy";
import { LiveMarketCard } from "@/components/charts/live-market-card";
import { OrderBookLadder } from "@/components/dashboard/order-book-ladder";
import { GeoblockAlert } from "@/components/dashboard/geoblock-status";
import { PulseDot } from "@/components/animations/pulse-dot";

export default function MarketsPage() {
  const { snap, mode, liveAccountQuery, isLoading } = useAppState();
  const liveAcct = liveAccountQuery.data || snap?.liveAccount || null;
  const portfolio = usePortfolio(snap, mode, liveAcct);

  const markets = useMemo(
    () => (snap?.markets || []) as Array<Record<string, unknown>>,
    [snap],
  );
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const selected = useMemo(
    () => markets.find((m) => m.slug === selectedSlug) ?? markets[0] ?? null,
    [markets, selectedSlug],
  );

  if (isLoading && !snap) {
    return (
      <div className="flex min-h-svh items-center justify-center font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
        Loading markets…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
      <GeoblockAlert />

      <PageHeading
        eyebrow="Markets"
        title="Live markets"
        subtitle="Live Polymarket CLOB order books with streaming tick charts, bid/ask spreads, and trade volume."
      />

      {/* Market cards grid */}
      {markets.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/40">
          <Target className="size-5 text-muted-foreground/40" />
          <p className="font-mono text-[11px] text-muted-foreground">
            No markets in your bands yet — the engine discovers BTC/ETH windows when running.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {markets.map((m) => (
              <LiveMarketCard
                key={String(m.slug)}
                market={m}
                signal={
                  String(m.symbol || "").toLowerCase() === "eth"
                    ? snap?.signals?.eth
                    : snap?.signals?.btc
                }
                onClick={() => setSelectedSlug(String(m.slug))}
              />
            ))}
          </div>

          {/* Expanded detail for selected market */}
          {selected ? (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <SectionLabel>
                {String(selected.symbol)} · {String(selected.duration)} · detail
              </SectionLabel>
              <ExpandedDetail market={selected} portfolio={portfolio} signal={snap?.signals} />
            </motion.section>
          ) : null}
        </>
      )}

      {/* Past markets */}
      {portfolio.trades.filter((t) => t.slug).length > 0 ? (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <SectionLabel>Past markets</SectionLabel>
            <History className="size-3.5 text-muted-foreground" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {portfolio.trades
              .filter((t) => t.slug)
              .slice(-4)
              .reverse()
              .map((t, i) => (
                <PastMarketCardMini
                  key={String(t.slug || i)}
                  slug={String(t.slug)}
                  outcome={String(t.outcome || "up")}
                  pnl={Number(t.pnl ?? 0)}
                />
              ))}
          </div>
        </section>
      ) : null}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border/60 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" /> signal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[var(--success)]" /> entry
        </span>
        <span className="flex items-center gap-1.5">
          B bid · A ask · imb imbalance
        </span>
        <span className="flex items-center gap-1.5">
          <PulseDot active className="text-[var(--success)]" /> live feed
        </span>
      </div>
    </div>
  );
}

function PastMarketCardMini({
  slug,
  outcome,
  pnl,
}: {
  slug: string;
  outcome: string;
  pnl: number;
}) {
  const { detail, history, historyLoading } = useMarketChart(slug, "1d");
  const dir = String(outcome).toLowerCase();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-xl border border-border/60 bg-card/40"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {slug}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px]">
            <span
              className={cn(
                "font-semibold uppercase",
                dir === "up" ? "text-[var(--success)]" : "text-destructive",
              )}
            >
              {outcome.slice(0, 4)}
            </span>
            <span className={pnl >= 0 ? "text-[var(--success)]" : "text-destructive"}>
              {money(pnl)}
            </span>
          </p>
        </div>
        {detail?.volume ? (
          <span className="font-mono text-[9px] text-muted-foreground">
            {detail.volume >= 1000
              ? `${(detail.volume / 1000).toFixed(1)}k`
              : detail.volume.toFixed(0)}
          </span>
        ) : null}
      </div>
      <div className="h-16 px-1 pb-1">
        {historyLoading ? (
          <div className="flex h-full items-center justify-center font-mono text-[9px] text-muted-foreground/60">
            …
          </div>
        ) : (
          <MarketChartLazy
            history={history}
            height={64}
            compact
            target={dir === "up" ? 1 : 0}
          />
        )}
      </div>
    </motion.div>
  );
}

function ExpandedDetail({
  market,
  portfolio,
  signal,
}: {
  market: Record<string, unknown>;
  portfolio: ReturnType<typeof usePortfolio>;
  signal: {
    btc?: { direction?: string; confidence?: number } | null;
    eth?: { direction?: string; confidence?: number } | null;
  } | null | undefined;
}) {
  const slug = String(market.slug);
  const duration = String(market.duration || "");
  const { detail, detailError } = useMarketChart(slug, duration);

  const conditionId = detail?.conditionId ? String(detail.conditionId) : null;
  const upTokenId = detail?.clobTokenIds?.[0] ? String(detail.clobTokenIds[0]) : null;
  const downTokenId = detail?.clobTokenIds?.[1] ? String(detail.clobTokenIds[1]) : null;

  const upFeed = useClobTickFeed(conditionId, upTokenId);
  const downFeed = useClobTickFeed(conditionId, downTokenId);
  const upDepth = useClobDepth(upTokenId);
  const downDepth = useClobDepth(downTokenId);
  const upHistory = usePriceHistory(upTokenId, duration).data ?? [];
  const downHistory = usePriceHistory(downTokenId, duration).data ?? [];

  const upPrice = upFeed.lastPrice;
  const downPrice = downFeed.lastPrice ?? (upPrice != null ? 1 - upPrice : null);

  const open = Array.isArray(portfolio.opens)
    ? portfolio.opens.find((p: Record<string, unknown>) => p.slug === slug)
    : undefined;
  const dir = String(open?.outcome || "").toLowerCase();
  const ptb = Number(market.priceToBeat);
  const remaining = Number(market.remaining);

  if (detailError && !detail) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-border/60 font-mono text-[11px] text-muted-foreground">
        <TrendingDown className="size-5 opacity-40" />
        <span>Could not resolve market</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: symbol, duration, question, target */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>
            {String(market.symbol)} · {duration}
          </SectionLabel>
          {ptb > 0 ? (
            <p className="mt-1 font-mono text-[12px] text-muted-foreground">
              {detail?.question || slug}
              <span className="ml-2 text-primary font-semibold">
                Target: ${ptb.toLocaleString()}
              </span>
            </p>
          ) : (
            <p className="mt-1 truncate font-mono text-[12px] text-muted-foreground">
              {detail?.question || slug}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "flex items-center gap-1.5 font-mono text-[10px]",
              upFeed.connected ? "text-[var(--success)]" : "text-[var(--warning)]",
            )}
          >
            <PulseDot active={upFeed.connected} />
            {upFeed.connected ? "live" : "…"}
          </span>
          {remaining > 0 ? (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {Math.floor(remaining / 60)}m left
            </span>
          ) : null}
          {detail?.volume ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              vol {detail.volume >= 1000 ? `${(detail.volume / 1000).toFixed(1)}k` : detail.volume}
            </span>
          ) : null}
        </div>
      </div>

      {/* Large center chart: UP across full width */}
      <div className="zg-card-premium p-3">
        <MarketChartLazy
          history={upHistory}
          liveTicks={upFeed.ticks}
          height={320}
          currentPrice={upPrice}
          title="UP"
        />
      </div>

      {/* UP/DOWN live price bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/5 px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--success)] font-semibold">
            UP
          </span>
          <div className="flex items-center gap-2">
            <motion.span
              key={String(upPrice)}
              className="font-mono text-[22px] font-bold tabular-nums text-[var(--success)]"
            >
              {upPrice != null ? upPrice.toFixed(3) : "—"}
            </motion.span>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-[var(--down)]/30 bg-[var(--down)]/5 px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--down)] font-semibold">
            DOWN
          </span>
          <motion.span
            key={String(downPrice)}
            className="font-mono text-[22px] font-bold tabular-nums text-[var(--down)]"
          >
            {downPrice != null ? downPrice.toFixed(3) : "—"}
          </motion.span>
        </div>
      </div>

      {/* Compact bid/ask + spread row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>UP bid {upFeed.bestBid?.toFixed(3) ?? "—"} ask {upFeed.bestAsk?.toFixed(3) ?? "—"}</span>
        <span className="text-border">|</span>
        <span>DOWN bid {downFeed.bestBid?.toFixed(3) ?? "—"} ask {downFeed.bestAsk?.toFixed(3) ?? "—"}</span>
        {upFeed.bestAsk != null && upFeed.bestBid != null ? (
          <>
            <span className="text-border">|</span>
            <span className="text-primary">sp {(upFeed.bestAsk - upFeed.bestBid).toFixed(3)}</span>
          </>
        ) : null}
      </div>

      {/* Mini order books */}
      <div className="grid grid-cols-2 gap-3">
        <OrderBookLadder
          depth={upDepth.data}
          connected={upFeed.connected}
          label="UP"
        />
        <OrderBookLadder
          depth={downDepth.data}
          connected={downFeed.connected}
          label="DOWN"
        />
      </div>

      {/* Position if open */}
      {open ? (
        <div className="rounded-xl border border-border/60 bg-background/40 p-3">
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {[
              ["Position", <span key="o" className={cn("uppercase font-semibold", dir === "up" ? "text-[var(--success)]" : "text-destructive")}>{String(open.outcome)}</span>],
              ["Entry", Number(open.entryPrice).toFixed(3)],
              ["P&L", <span key="pnl" className={cn("font-semibold", Number(open.pnl) >= 0 ? "text-[var(--success)]" : "text-destructive")}>{money(Number(open.pnl))}</span>],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex items-center gap-1.5 font-mono text-[10px]">
                <dt className="uppercase text-muted-foreground">{String(k)}</dt>
                <dd className="tabular-nums text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
