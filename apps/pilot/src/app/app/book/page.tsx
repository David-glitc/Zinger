"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { useDepositInfo } from "@/hooks/use-pilot";
import { usePortfolio } from "@/hooks/use-portfolio";
import { money } from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Radio,
  Layers,
  ScrollText,
  Trophy,
  Activity,
  Search,
  ArrowDownUp,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import { PageHeading, Stat, SectionLabel } from "@/components/app/app-ui";
import { FundsFlow } from "@/components/app/funds-flow";
import { OpenTable } from "@/components/dashboard/positions-table";
import { AccountPanel } from "@/components/dashboard/account-panel";
import { IntelligencePanel } from "@/components/dashboard/intelligence-panel";
import { GeoblockAlert } from "@/components/dashboard/geoblock-status";
import { SharePnl } from "@/components/dashboard/share-pnl";

function relTime(ts: number | null | undefined) {
  if (!ts) return "—";
  const now = Date.now();
  const t = ts < 2e10 ? ts * 1000 : ts;
  const s = Math.max(1, Math.floor((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function BookPage() {
  const { snap, account, mode, liveAccountQuery, sessionRunning, isLoading } = useAppState();
  const depositInfo = useDepositInfo();
  const liveAcct = liveAccountQuery.data || snap?.liveAccount || null;
  const portfolio = usePortfolio(snap, mode, liveAcct);
  const { opens, events, trades } = portfolio;

  const [tab, setTab] = useState<"open" | "tape" | "settled" | "traces" | "account" | "intel">("open");
  const [tapeQuery, setTapeQuery] = useState("");
  const [tapeKind, setTapeKind] = useState<"all" | "buy" | "sell" | "redeem">("all");
  const [settleDir, setSettleDir] = useState<"all" | "win" | "loss">("all");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const traces = (liveAcct?.traces ?? []) as Array<Record<string, unknown>>;
  const pmEvents = useMemo(
    () => (liveAcct?.recentEvents ?? []) as Array<Record<string, unknown>>,
    [liveAcct],
  );

  const openSize = useMemo(() => opens.reduce((s, p) => s + Number(p.size || 0), 0), [opens]);
  const unrealized = useMemo(() => opens.reduce((s, p) => s + Number(p.pnl || 0), 0), [opens]);

  const flowData = useMemo(
    () => ({
      mode,
      sessionRunning,
      depositedGross: Number(account?.depositedGross ?? 0),
      withdrawn: Number(account?.withdrawn ?? 0),
      platformFees: Number(snap?.accounting?.platformFees ?? account?.platformFeesPaid ?? 0),
      clobFees: Number(snap?.accounting?.clobFees ?? 0),
      cash: Number(account?.cash ?? 0),
      liveCash: portfolio.liveCash,
      depositWalletBalance: Number(depositInfo.data?.depositWalletBalance ?? 0),
      openCount: opens.length,
      openSize,
      unrealized,
      realized: portfolio.realized,
      lifetimeBaseline: Number((liveAcct?.cash as Record<string, unknown>)?.lifetimeBaseline ?? null),
      sessionCashPnl: Number((liveAcct?.cash as Record<string, unknown>)?.sessionCashPnl ?? null),
    }),
    [account, snap, depositInfo, portfolio, mode, sessionRunning, opens, openSize, unrealized, liveAcct],
  );

  const filteredTape = useMemo(() => {
    const src = mode === "live" ? pmEvents : events;
    const q = tapeQuery.trim().toLowerCase();
    return src.filter((e) => {
      const kind = String(e.side || e.type || "").toLowerCase();
      if (tapeKind !== "all" && !kind.includes(tapeKind)) return false;
      if (!q) return true;
      return [e.slug, e.title, e.side, e.type, e.outcome, e.txHash]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [pmEvents, events, mode, tapeQuery, tapeKind]);

  const sortedTrades = useMemo(() => {
    let list = [...trades];
    if (settleDir !== "all") {
      list = list.filter((t) => (settleDir === "win" ? Number(t.pnl) >= 0 : Number(t.pnl) < 0));
    }
    list.sort((a, b) => (sort === "desc" ? Number(b.pnl) - Number(a.pnl) : Number(a.pnl) - Number(b.pnl)));
    return list;
  }, [trades, settleDir, sort]);

  const tradeOutcome = (t: Record<string, unknown>) => String(t.outcome || "").toLowerCase();
  const tradeIsUp = (t: Record<string, unknown>) => tradeOutcome(t) === "up";

  function copyHash(h: string) {
    navigator.clipboard.writeText(h);
    setCopied(h);
    setTimeout(() => setCopied(null), 1500);
  }

  const tabs = [
    ["open", `Open (${opens.length})`, Layers],
    ["tape", `Tape (${(mode === "live" ? pmEvents : events).length})`, ScrollText],
    ["settled", `Settled (${trades.length})`, Trophy],
    ["traces", `Audit (${traces.length})`, Activity],
    ["account", "Account", BookOpen],
    ["intel", "Intel", Radio],
  ] as const;

  if (isLoading && !snap) {
    return (
      <div className="flex min-h-svh items-center justify-center font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
        Opening book…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <GeoblockAlert />
      <PageHeading
        eyebrow="Book"
        title="Trade ledger & funds audit"
        subtitle="Follow the money end-to-end: deposits → pUSD → CLOB → positions → P&L, fees and withdrawals. Tap a stage to drill in."
      />

      {/* Funds flow audit */}
      <section className="space-y-3">
        <SectionLabel>Funds flow</SectionLabel>
        <FundsFlow data={flowData} />
      </section>

      {/* Account statement (deterministic) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Account statement</SectionLabel>
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <BookOpen className="size-3.5" />
            {mode === "live" ? "live CLOB" : "paper"}
          </span>
        </div>
        <div className="zg-glass overflow-hidden rounded-xl">
          <div className="divide-y divide-border/40 px-4">
            {[
              ["Deposited", Number(account?.depositedGross ?? 0), "+"],
              ["Withdrawn", Number(account?.withdrawn ?? 0), "−"],
              [
                "Platform fees",
                Number(snap?.accounting?.platformFees ?? account?.platformFeesPaid ?? 0),
                "−",
              ],
              ["CLOB fees", Number(snap?.accounting?.clobFees ?? 0), "−"],
              ["Realized P&L", portfolio.realized, "±"],
              ["Open marks", unrealized, "±"],
            ].map(([label, v, sign]) => {
              const n = Number(v);
              const signed = sign === "±";
              return (
                <div
                  key={String(label)}
                  className="flex items-center justify-between gap-2 py-2.5"
                >
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {String(label)}
                  </dt>
                  <dd
                    className={cn(
                      "font-mono text-[13px] tabular-nums",
                      signed
                        ? n >= 0
                          ? "text-[var(--success)]"
                          : "text-destructive"
                        : "text-foreground",
                    )}
                  >
                    {sign === "+" ? "+" : sign === "−" ? "−" : n >= 0 ? "+" : ""}
                    {money(Math.abs(n))}
                  </dd>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-2 py-3">
              <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
                Balance
              </dt>
              <dd className="font-display text-[18px] font-[600] tabular-nums text-foreground">
                {money(mode === "live" ? portfolio.liveCash : Number(account?.cash ?? 0))}
              </dd>
            </div>
          </div>
          <div className="border-t border-border/40 bg-background/40 px-4 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
              Balance = deposited − withdrawn − fees + realized P&L, marked live from the execution account.
            </p>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open" value={opens.length} sub={`${mode} · ${money(openSize)}`} index={0} />
        <Stat label="Unrealized" value={unrealized} tone={unrealized >= 0 ? "up" : "dn"} index={1} />
        <Stat
          label="Record"
          value={`${portfolio.wins}W · ${portfolio.losses}L`}
          tone={portfolio.wins >= portfolio.losses ? "up" : "dn"}
          index={2}
        />
        <Stat
          label="Net realized"
          value={portfolio.realized}
          tone={portfolio.realized >= 0 ? "up" : "dn"}
          index={3}
        />
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-border/70">
        <div className="zg-glass flex gap-1 overflow-x-auto rounded-t-xl border-b border-border/60 p-1.5">
          {tabs.map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTab(v)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                tab === v
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "open" ? (
              <div id="open"><OpenTable opens={opens} /></div>
            ) : null}

            {tab === "tape" ? (
              <div className="p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      value={tapeQuery}
                      onChange={(e) => setTapeQuery(e.target.value)}
                      placeholder="Search slug, title, side, tx…"
                      className="zg-num pl-8"
                    />
                  </div>
                  <div className="flex gap-1">
                    {(["all", "buy", "sell", "redeem"] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setTapeKind(k)}
                        className={cn(
                          "rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em]",
                          tapeKind === k
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredTape.length === 0 ? (
                  <p className="py-8 text-center font-mono text-[11px] text-muted-foreground">
                    No tape events{tapeQuery ? ` matching “${tapeQuery}”` : ""}.
                  </p>
                ) : (
                  <div className="max-h-[420px] space-y-1 overflow-y-auto">
                    <AnimatePresence initial={false}>
                      {filteredTape.map((e, i) => {
                        const kind = String(e.side || e.type || "event").toLowerCase();
                        const buy = kind.includes("buy");
                        const sell = kind.includes("sell");
                        const redeem = kind.includes("redeem");
                        return (
                          <motion.div
                            key={String(e.id || `${e.timestamp}-${i}`)}
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2 border-b border-border/10 px-2 py-1.5 font-mono text-[10px] hover:bg-muted/20"
                          >
                            <span
                              className={cn(
                                "w-14 shrink-0 rounded px-1 py-0.5 text-center text-[8px] font-bold uppercase tracking-wider",
                                buy
                                  ? "bg-[var(--success)]/10 text-[var(--success)]"
                                  : sell
                                    ? "bg-destructive/10 text-destructive"
                                    : redeem
                                      ? "bg-primary/10 text-primary"
                                      : "bg-muted text-muted-foreground",
                              )}
                            >
                              {kind.slice(0, 6)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {String(e.title || e.slug || e.message || "—")}
                            </span>
                            <span className="shrink-0 tabular-nums text-foreground">
                              {Number(e.shares || 0)}sh @ {Number(e.price ?? e.usdcSize ?? 0) >= 0.1 ? Number(e.price ?? 0).toFixed(3) : Number(e.price ?? 0).toFixed(3)}
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              ${Number(e.usdcSize ?? 0).toFixed(2)}
                            </span>
                            <span className="shrink-0 text-muted-foreground/60">
                              {relTime(Number(e.timestamp))}
                            </span>
                            {e.txHash ? (
                              <button
                                onClick={() => copyHash(String(e.txHash))}
                                className="shrink-0 text-muted-foreground/60 hover:text-foreground"
                                title={String(e.txHash)}
                              >
                                {copied === String(e.txHash) ? (
                                  <Check className="size-3 text-[var(--success)]" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </button>
                            ) : null}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            ) : null}

            {tab === "settled" ? (
              <div className="p-3" id="settled">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="flex gap-1 rounded-lg border border-border/60 p-0.5">
                    {(["all", "win", "loss"] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setSettleDir(k)}
                        className={cn(
                          "rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]",
                          settleDir === k
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setSort(sort === "desc" ? "asc" : "desc")}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
                  >
                    <ArrowDownUp className="size-3" /> {sort === "desc" ? "biggest win" : "biggest loss"}
                  </button>
                </div>
                {sortedTrades.length === 0 ? (
                  <p className="py-8 text-center font-mono text-[11px] text-muted-foreground">
                    No settled trades.
                  </p>
                ) : (
                  <div className="divide-y divide-border/10">
                    {sortedTrades.map((t, i) => {
                      const key = String(t.slug || t.id || i);
                      const isUp = tradeIsUp(t);
                      const pnl = Number(t.pnl ?? 0);
                      const open = expanded === key;
                      return (
                        <div key={key}>
                          <button
                            onClick={() => setExpanded(open ? null : key)}
                            className="flex w-full items-center gap-2 px-2 py-2 font-mono text-[11px] hover:bg-muted/20"
                          >
                            <span className="w-10 font-semibold text-foreground">
                              {String(t.asset || t.symbol || "?")}
                            </span>
                            <span
                              className={cn(
                                "w-10 font-semibold uppercase",
                                isUp ? "text-[var(--success)]" : "text-destructive",
                              )}
                            >
                              {tradeOutcome(t).slice(0, 4)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {String(t.title || t.slug || "—")}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 font-semibold tabular-nums",
                                pnl >= 0 ? "text-[var(--success)]" : "text-destructive",
                              )}
                            >
                              {money(pnl)}
                            </span>
                            <SharePnl
                              size="sm"
                              pnl={pnl}
                              entryPrice={String(t.entryPrice ?? t.avgPrice ?? "") || undefined}
                              exitPrice={isUp ? 1 : 0}
                              outcome={tradeOutcome(t)}
                              asset={String(t.asset || t.symbol || "")}
                              slug={String(t.slug || "")}
                            />
                            <ChevronDown
                              className={cn(
                                "size-3 shrink-0 text-muted-foreground transition-transform",
                                open && "rotate-180",
                              )}
                            />
                          </button>
                          <AnimatePresence>
                            {open ? (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="grid gap-x-6 gap-y-1 border-t border-border/10 bg-muted/20 px-4 py-3 sm:grid-cols-3">
                                  {[
                                    ["Entry", Number(t.entryPrice ?? t.avgPrice ?? 0).toFixed(3)],
                                    ["Exit", Number(t.exitPrice ?? t.curPrice ?? 0).toFixed(3)],
                                    ["Shares", String(Number(t.shares ?? 0))],
                                    ["Size", money(Number(t.size ?? t.costUsd ?? 0))],
                                    ["Reason", String(t.reason || t.exitReason || "settle")],
                                    ["Time", relTime(Number(t.timestamp))],
                                    ["Outcome", String(t.outcome || "—")],
                                    ["PnL %", Number(t.realizedPct ?? 0) ? `${Number(t.realizedPct).toFixed(1)}%` : "—"],
                                    ["Slug", <span key="slug" className="break-all">{String(t.slug || "—")}</span>],
                                  ].map(([k, v]) => (
                                    <div key={String(k)} className="flex items-baseline justify-between gap-2">
                                      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                                        {String(k)}
                                      </dt>
                                      <dd className="font-mono text-[11px] tabular-nums text-foreground">{v}</dd>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "traces" ? (
              <div className="max-h-[460px] overflow-y-auto p-3">
                {traces.length === 0 ? (
                  <p className="py-8 text-center font-mono text-[11px] text-muted-foreground">
                    No audit traces yet — Sync PM to build the ledger.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {traces.map((t) => {
                      const type = String(t.type || "event");
                      const key = String(t.id || `${t.timestamp}-${type}`);
                      const open = expanded === `trace-${key}`;
                      return (
                        <div key={key}>
                          <button
                            onClick={() => setExpanded(open ? null : `trace-${key}`)}
                            className="flex w-full items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-left font-mono text-[10px] hover:bg-muted/20"
                          >
                            <span
                              className={cn(
                                "shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider",
                                type.includes("closed") || type.includes("sell")
                                  ? "bg-destructive/10 text-destructive"
                                  : type.includes("buy") || type.includes("start")
                                    ? "bg-[var(--success)]/10 text-[var(--success)]"
                                    : "bg-primary/10 text-primary",
                              )}
                            >
                              {type.replace(/^pm_/, "").replace(/_/g, " ").slice(0, 12)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {String(t.message || "—")}
                            </span>
                            <span className="shrink-0 text-muted-foreground/60">
                              {relTime(Number(t.timestamp))}
                            </span>
                            <ChevronDown
                              className={cn(
                                "size-3 shrink-0 text-muted-foreground transition-transform",
                                open && "rotate-180",
                              )}
                            />
                          </button>
                          <AnimatePresence>
                            {open ? (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="flex flex-wrap gap-2 px-4 py-2">
                                  {Object.entries(t)
                                    .filter(([k]) => !["message", "id", "timestamp", "type"].includes(k))
                                    .map(([k, v]) => (
                                      <span key={k} className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                                        {k}: <span className="text-foreground">{String(v ?? "—")}</span>
                                      </span>
                                    ))}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "account" ? (
              <div className="max-h-[560px] overflow-y-auto">
                <AccountPanel
                  mode={mode}
                  narrative={snap?.narrative}
                  liveScoreCards={snap?.liveScoreCards || []}
                  account={snap?.accountBook}
                  cashAudit={snap?.cashAudit}
                />
              </div>
            ) : null}

            {tab === "intel" ? (
              <div className="max-h-[460px] overflow-y-auto">
                <IntelligencePanel />
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
