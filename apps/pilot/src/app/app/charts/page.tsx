"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useMarketChart, usePriceHistory } from "@/hooks/use-market-chart";
import { money } from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { CandlestickChart, Clock, Target, TrendingUp, TrendingDown, History } from "lucide-react";
import { PageHeading, GlassPanel, SectionLabel } from "@/components/app/app-ui";
import { MarketChartLazy } from "@/components/charts/market-chart-lazy";
import { GeoblockAlert } from "@/components/dashboard/geoblock-status";
import { useClobFeed } from "@/hooks/use-clob-feed";
import { PulseDot } from "@/components/animations/pulse-dot";

function PastMarketCard({ slug, outcome, pnl }: { slug: string; outcome: string; pnl: number }) {
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
              {String(outcome || "?").slice(0, 4)}
            </span>
            <span className={cn(pnl >= 0 ? "text-[var(--success)]" : "text-destructive")}>
              {money(pnl)}
            </span>
          </p>
        </div>
        {detail ? (
          <span className="font-mono text-[9px] text-muted-foreground">
            {detail.volume > 0 ? `vol ${detail.volume >= 1000 ? `${(detail.volume / 1000).toFixed(1)}k` : detail.volume.toFixed(0)}` : "—"}
          </span>
        ) : null}
      </div>
      <div className="h-16 px-1 pb-1">
        {historyLoading ? (
          <div className="flex h-full items-center justify-center font-mono text-[9px] text-muted-foreground/60">
            loading…
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

export default function ChartsPage() {
  const { snap, mode, liveAccountQuery, isLoading } = useAppState();
  const liveAcct = liveAccountQuery.data || snap?.liveAccount || null;
  const portfolio = usePortfolio(snap, mode, liveAcct);

  const markets = useMemo(
    () => (snap?.markets || []) as Array<Record<string, unknown>>,
    [snap],
  );
  const [slug, setSlug] = useState<string | null>(null);
  const selected = useMemo(
    () => markets.find((m) => m.slug === slug) ?? markets[0] ?? null,
    [markets, slug],
  );

  const asset = String(selected?.symbol || "").toLowerCase();
  const signal = asset === "eth" ? snap?.signals?.eth : snap?.signals?.btc;

  const open = useMemo(
    () => portfolio.opens.find((p) => p.slug === selected?.slug),
    [portfolio.opens, selected],
  );
  const dir = String(open?.outcome || "").toLowerCase();
  const target = open ? (dir === "up" ? 1 : 0) : null;

  const [token, setToken] = useState<"up" | "down">("up");
  const detailToken = token === "down" ? 1 : 0;

  const pastTrades = useMemo(
    () => portfolio.trades.filter((t) => t.slug).slice(-5).reverse(),
    [portfolio.trades],
  );

  if (isLoading && !snap) {
    return (
      <div className="flex min-h-svh items-center justify-center font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
        Loading charts…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <GeoblockAlert />
      <PageHeading
        eyebrow="Charts"
        title="Market charts"
        subtitle="Live token price for every market in your bands, with Zinger signals, your entries and win targets overlaid."
      />

      {/* Market selector */}
      <div className="flex flex-wrap gap-2">
        {markets.map((m) => {
          const active = m.slug === selected?.slug;
          const prices = (m.prices ?? {}) as Record<string, unknown>;
          return (
            <button
              key={String(m.slug)}
              onClick={() => setSlug(String(m.slug))}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
                active
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/60 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <CandlestickChart className="size-3.5" />
              <span>{String(m.symbol)}</span>
              <span className="text-muted-foreground/70">{String(m.duration || "")}</span>
              <span
                className={cn(
                  "tabular-nums",
                  Number(prices.up) >= 0.5 ? "text-[var(--success)]" : "text-muted-foreground",
                )}
              >
                {Number(prices.up).toFixed(3)}
              </span>
            </button>
          );
        })}
      </div>

      {!selected ? (
        <GlassPanel>
          <p className="p-6 text-center font-mono text-[12px] text-muted-foreground">
            No markets in your bands yet — the session discovers BTC/ETH windows when running.
          </p>
        </GlassPanel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          {/* Main chart */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>
                {String(selected.symbol)} · {String(selected.duration)} ·{" "}
                <span className="uppercase">{token}</span>
              </SectionLabel>
              <div className="flex gap-1 rounded-lg border border-border/60 p-0.5">
                {(["up", "down"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setToken(t)}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
                      token === t
                        ? t === "up"
                          ? "bg-[var(--success)]/15 text-[var(--success)]"
                          : "bg-destructive/15 text-destructive"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <GlassPanel className="p-3">
              <ChartForToken
                slug={String(selected.slug)}
                duration={String(selected.duration)}
                token={token}
                signal={signal}
                open={open}
                detailToken={detailToken}
              />
            </GlassPanel>
          </section>

          {/* Market meta */}
          <aside className="space-y-6">
            <section className="space-y-3">
              <SectionLabel>Market</SectionLabel>
              <GlassPanel>
                <dl className="space-y-2.5 p-4">
                  {[
                    ["Symbol", String(selected.symbol)],
                    ["Duration", String(selected.duration || "—")],
                    ["Slug", String(selected.slug || "—")],
                    [
                      "UP price",
                      <span key="up" className="text-[var(--success)]">
                        {(Number(((selected.prices as Record<string, unknown>)?.up ?? 0))).toFixed(3)}
                      </span>,
                    ],
                    [
                      "DOWN price",
                      <span key="down" className="text-destructive">
                        {(Number(((selected.prices as Record<string, unknown>)?.down ?? 0))).toFixed(3)}
                      </span>,
                    ],
                    ["Price to beat", Number(selected.priceToBeat) ? `$${Number(selected.priceToBeat).toLocaleString()}` : "—"],
                    ["Remaining", Number(selected.remaining) ? `${Math.floor(Number(selected.remaining) / 60)}m` : "—"],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex items-center justify-between gap-2">
                      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {String(k)}
                      </dt>
                      <dd className="max-w-[60%] truncate font-mono text-[12px] tabular-nums text-foreground">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </GlassPanel>
            </section>

            <section className="space-y-3">
              <SectionLabel>Position</SectionLabel>
              <GlassPanel>
                {open ? (
                  <dl className="space-y-2.5 p-4">
                    {[
                      ["Outcome", <span key="o" className={cn("uppercase", dir === "up" ? "text-[var(--success)]" : "text-destructive")}>{String(open.outcome)}</span>],
                      ["Entry", Number(open.entryPrice).toFixed(3)],
                      ["Mark", Number(open.mark).toFixed(3)],
                      ["Shares", String(Number(open.shares || 0))],
                      ["Size", money(Number(open.size || 0))],
                      [
                        "P&L",
                        <span key="pnl" className={cn(Number(open.pnl) >= 0 ? "text-[var(--success)]" : "text-destructive")}>
                          {money(Number(open.pnl))}
                        </span>,
                      ],
                      ["Target", <span key="t" className="text-primary">{target === 1 ? "1.000 (win)" : target === 0 ? "0.000 (win)" : "—"}</span>],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="flex items-center justify-between gap-2">
                        <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          {String(k)}
                        </dt>
                        <dd className="font-mono text-[12px] tabular-nums text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <div className="flex flex-col items-center gap-1 p-5 text-center">
                    <Target className="size-4 text-muted-foreground/40" />
                    <p className="font-mono text-[10px] text-muted-foreground">
                      No open position in this window.
                    </p>
                  </div>
                )}
              </GlassPanel>
            </section>
          </aside>
        </div>
      )}

      {/* Past markets */}
      {pastTrades.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <SectionLabel>Past markets</SectionLabel>
            <History className="size-3.5 text-muted-foreground" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pastTrades.map((t, i) => (
              <PastMarketCard
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
          <span className="size-2 rounded-full bg-primary" /> signal buy
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-destructive" /> signal sell
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[var(--success)]" /> your entry
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-3" /> {String(selected?.duration || "")} windows
        </span>
        <span className="flex items-center gap-1.5">
          <TrendingUp className="size-3" /> target = win level (1.0 up / 0.0 down)
        </span>
      </div>
    </div>
  );
}

function ChartForToken({
  slug,
  duration,
  token,
  signal,
  open,
  detailToken,
}: {
  slug: string;
  duration: string;
  token: "up" | "down";
  signal: { direction?: string; confidence?: number } | null | undefined;
  open: Record<string, unknown> | undefined;
  detailToken: number;
}) {
  const { detail, historyLoading, detailError } = useMarketChart(slug, duration);
  const tokenId = detail?.clobTokenIds?.[detailToken] ?? null;
  const tokenHistory = usePriceHistory(tokenId, duration).data ?? [];
  const feed = useClobFeed(
    detail?.conditionId != null ? String(detail.conditionId) : null,
    tokenId,
  );

  const dir = String(open?.outcome || "").toLowerCase();
  const entryPrice = open && token === dir ? Number(open.entryPrice ?? null) : null;
  const target = open && token === dir ? (dir === "up" ? 1 : 0) : null;

  if (detailError && !detail) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-2 font-mono text-[11px] text-muted-foreground">
        <TrendingDown className="size-5 opacity-40" />
        <span>Could not resolve market (proxy)</span>
      </div>
    );
  }

  if (historyLoading && !tokenHistory.length) {
    return (
      <div className="flex h-72 items-center justify-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Fetching {slug}…
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-end gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em]">
        <span
          className={cn(
            "flex items-center gap-1.5",
            feed.connected ? "text-[var(--success)]" : "text-warning",
          )}
        >
          <PulseDot active={feed.connected} />
          {feed.connected ? "live feed" : "reconnecting…"}
        </span>
      </div>
      <MarketChartLazy
        history={tokenHistory}
        livePrice={feed.lastPrice}
        height={360}
        entryPrice={entryPrice}
        target={target}
        signal={signal}
        title={`${String(detail?.question || slug)} · ${String(detail?.marketId || "")}`}
      />
    </div>
  );
}
