"use client";

import Link from "next/link";
import { useAppState } from "@/hooks/use-app-state";
import { usePortfolio } from "@/hooks/use-portfolio";
import { money } from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Play, Square, Radio, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { PageHeading, Stat, GlassPanel, SectionLabel } from "@/components/app/app-ui";
import { SignalPanel } from "@/components/dashboard/signal-panel";
import { CapitalInsights } from "@/components/dashboard/capital-insights";
import { LiveTradePanel } from "@/components/dashboard/live-trade-panel";
import { GeoblockAlert } from "@/components/dashboard/geoblock-status";
import { PulseDot } from "@/components/animations/pulse-dot";
import { MarketStrip } from "@/components/charts/market-strip";
import { SharePnl } from "@/components/dashboard/share-pnl";
import { FirstRunBanner } from "@/components/onboarding/first-run-banner";
import { Button } from "@/components/ui/button";

export default function CommandPage() {
  const {
    snap,
    account,
    mode,
    sessionRunning,
    busy,
    toggleSession,
    liveAccountQuery,
    syncLive,
    isLoading,
  } = useAppState();

  const liveAcct = liveAccountQuery.data || snap?.liveAccount || null;
  const portfolio = usePortfolio(snap, mode, liveAcct);
  const { equity, cash, realized, unrealized, winRate, wins, losses, opens } = portfolio;

  const narrative = snap?.narrative?.headline;
  const liveTrading = snap?.liveTrading;
  const canStart = mode === "paper" ? cash >= 50 : portfolio.liveCash > 0 || !!liveTrading?.liveReady;

  if (isLoading && !snap) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
        <div className="space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
      <GeoblockAlert />

      <FirstRunBanner visible cash={cash} mode={mode} />

      <PageHeading
        eyebrow="Command"
        title={sessionRunning ? "Session live" : "Mission control"}
        subtitle={
          narrative ||
          (sessionRunning
            ? "Entries are firing inside your bands. Watch the book."
            : "Fund the vault, set your bands, then start a session.")
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:flex">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  Number(snap?.feed?.ageMs ?? 0) < 8000
                    ? "bg-[var(--success)]"
                    : "bg-warning",
                )}
              />
              {snap?.feed?.ageMs != null ? `${Math.max(0, Math.round(Number(snap.feed.ageMs) / 1000))}s` : "—"} · {mode}
            </span>
            <Button
              size="lg"
              disabled={busy || (!sessionRunning && !canStart)}
              onClick={toggleSession}
              className={cn(
                "min-w-[150px] rounded-xl font-mono text-[12px] uppercase tracking-[0.14em]",
                sessionRunning
                  ? "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "zg-volt-btn text-white",
              )}
            >
              {sessionRunning ? (
                <>
                  <Square className="mr-1.5 size-3.5" /> Stop session
                </>
              ) : (
                <>
                  <Play className="mr-1.5 size-3.5" /> Start session
                </>
              )}
            </Button>
          </div>
        }
      />
      {!sessionRunning && !canStart ? (
        <p className="mt-2 font-mono text-[11px] text-destructive">
          {mode === "paper" ? (
            <>Deposit at least $50 paper credit before starting.{" "}
              <Link href="/app/fund" className="underline hover:text-destructive/80">Fund now →</Link>
            </>
          ) : (
            <>Fund pUSD or sync the live CLOB before starting.{" "}
              <Link href="/app/fund" className="underline hover:text-destructive/80">Fund now →</Link>
            </>
          )}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label={mode === "live" ? "CLOB cash" : "Equity"}
          value={equity}
          accent={mode === "live"}
          sub={mode.toUpperCase()}
          index={0}
        />
        <Stat label="Cash" value={cash} sub="spendable" index={1} />
        <Stat
          label="Realized"
          value={realized}
          tone={realized >= 0 ? "up" : "dn"}
          index={2}
        />
        <Stat
          label="Unrealized"
          value={unrealized}
          tone={unrealized >= 0 ? "up" : "dn"}
          sub={mode === "live" ? "open marks" : undefined}
          index={3}
        />
        <Stat
          label="Win rate"
          value={
            winRate != null
              ? `${(Number(winRate) * (Number(winRate) <= 1 ? 100 : 1)).toFixed(1)}%`
              : "—"
          }
          sub={`${wins}W · ${losses}L`}
          index={4}
        />
      </div>

      <div className="flex items-center justify-end">
        <SharePnl
          pnl={realized}
          asset={mode === "live" ? "LIVE" : "PAPER"}
          slug="portfolio-snapshot"
        />
      </div>

      {mode === "live" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border/60 bg-background/60 px-4 py-2.5">
          <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
            <Radio className="size-3.5 text-primary" /> Live book
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            CLOB <strong className="text-foreground">{money(portfolio.liveCash)}</strong>
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5 font-mono text-[11px]",
              liveTrading?.liveReady
                ? "text-[var(--success)]"
                : liveTrading?.liveAllowed === false
                  ? "text-warning"
                  : "text-muted-foreground",
            )}
          >
            <PulseDot active={!!liveTrading?.liveReady} />
            {liveTrading?.liveAllowed === false
              ? "edge-locked"
              : liveTrading?.liveReady
                ? "ready"
                : "not ready"}
          </span>
          <Button
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={() => syncLive.mutateAsync()}
            className="ml-auto rounded-lg border-border font-mono text-[10px] uppercase tracking-[0.14em]"
          >
            Sync PM
          </Button>
        </div>
      ) : null}

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <SectionLabel>Position radar</SectionLabel>
          <Link
            href="/app/book"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
          >
            Full book <ArrowUpRight className="size-3" />
          </Link>
        </div>
        <LiveTradePanel open={opens[0] || null} />
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <SectionLabel>Markets</SectionLabel>
          <Link
            href="/app/charts"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
          >
            Full charts <ArrowUpRight className="size-3" />
          </Link>
        </div>
        <MarketStrip
          markets={(snap?.markets || []) as Array<Record<string, unknown>>}
          signals={snap?.signals}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <section className="space-y-2.5">
            <SectionLabel>Live signals</SectionLabel>
            <SignalPanel btc={snap?.signals?.btc} eth={snap?.signals?.eth} ageMs={snap?.feed?.ageMs ?? null} />
          </section>

          <section className="space-y-2.5">
            <SectionLabel>Edge gate</SectionLabel>
            <CapitalInsights
              edgeGate={snap?.edgeGate}
              config={{
                kellyFraction: 0,
                maxPositionPct: Number(account?.rules?.maxPositionPct ?? 10) / 100,
                minConfidence: Number(account?.rules?.minConfidence ?? 0.38),
              }}
              cash={cash}
            />
          </section>

          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Open book ({opens.length})</SectionLabel>
              <Link
                href="/app/book"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
              >
                Full book <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <GlassPanel className="overflow-hidden">
              {opens.length === 0 ? (
                <div className="flex h-28 flex-col items-center justify-center gap-1">
                  <Radio className="size-5 text-muted-foreground/40" />
                  <p className="font-mono text-[11px] text-muted-foreground">
                    No open positions — start a session to hunt entries.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {opens.slice(0, 6).map((p, i) => (
                    <motion.div
                      key={`${String(p.id)}-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <span className="w-10 font-mono text-[11px] text-muted-foreground">
                        {String(p.asset || p.symbol || "?").toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans text-[12px] text-foreground">
                          {String(p.title || p.outcome || "—")}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {Number(p.shares || 0)} sh @ {money(Number(p.entryPrice || 0), 2)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex items-center gap-1 font-mono text-[12px] tabular-nums",
                          Number(p.pnl || 0) >= 0 ? "text-[var(--success)]" : "text-destructive",
                        )}
                      >
                        {Number(p.pnl || 0) >= 0 ? (
                          <ArrowUpRight className="size-3" />
                        ) : (
                          <ArrowDownRight className="size-3" />
                        )}
                        {money(Number(p.pnl || 0), 2)}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </GlassPanel>
          </section>
        </div>

        <div className="space-y-5">
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Vault</SectionLabel>
              <Link href="/app/vault" className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline">
                Inspect <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <GlassPanel>
              <dl className="space-y-2.5 px-4 py-3">
                {(
                  [
                    ["Session", account?.session?.running ? `Running #${account.session.id}` : "Idle"],
                    ["Account", String(account?.accountId ?? "—")],
                    ["Deposited", money(Number(account?.depositedGross ?? 0))],
                    ["Withdrawn", money(Number(account?.withdrawn ?? 0))],
                    ["Fees paid", money(Number(account?.platformFeesPaid ?? 0))],
                    ["Chain", account?.chainId ? `Polygon · ${account.chainId}` : "—"],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {k}
                    </dt>
                    <dd className="truncate font-mono text-[12px] tabular-nums text-foreground">
                      {String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </GlassPanel>
          </section>

          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Bands</SectionLabel>
              <Link href="/app/settings" className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline">
                Tune <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <GlassPanel>
              <dl className="space-y-2.5 px-4 py-3">
                {(
                  [
                    ["Max position", `${Number(account?.rules?.maxPositionPct ?? 10)}%`],
                    ["Min confidence", `${(Number(account?.rules?.minConfidence ?? 0.38) * 100).toFixed(0)}%`],
                    ["Price band", `${Number(account?.rules?.minPrice ?? 0.42).toFixed(2)} – ${Number(account?.rules?.maxPrice ?? 0.68).toFixed(2)}`],
                    ["Assets", String(account?.rules?.assets ?? "BTC,ETH")],
                    ["Durations", String(account?.rules?.durations ?? "5m,15m")],
                    ["Min take-profit", money(Number(account?.rules?.minTpUsd ?? 5))],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {k}
                    </dt>
                    <dd className="font-mono text-[12px] tabular-nums text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
            </GlassPanel>
          </section>
        </div>
      </div>
    </div>
  );
}
