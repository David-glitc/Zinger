"use client";

import { useAppState } from "@/hooks/use-app-state";
import { useDepositInfo, useDeposits } from "@/hooks/use-pilot";
import { money, shortAddr } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion } from "motion/react";
import { RefreshCw, Copy, Check, Wallet, Activity, AlertTriangle } from "lucide-react";import { useState } from "react";
import { PageHeading, Stat, GlassPanel, SectionLabel } from "@/components/app/app-ui";
import { GeoblockAlert } from "@/components/dashboard/geoblock-status";
import { ClobProvisionPanel } from "@/components/dashboard/clob-provision-panel";
import { Button } from "@/components/ui/button";

function kv(key: string, value: React.ReactNode) {
  return (
    <div key={key} className="flex items-center justify-between gap-2">
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {key}
      </dt>
      <dd className="truncate font-mono text-[12px] tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export default function VaultPage() {
  const { account, mode, busy, liveAccountQuery, syncLive, snap } = useAppState();
  const depositInfo = useDepositInfo(account?.wallet);
  const deposits = useDeposits(account?.wallet ?? null);
  const liveAcct = liveAccountQuery.data || snap?.liveAccount || null;
  const [copied, setCopied] = useState(false);

  const cash = (liveAcct?.cash ?? {}) as Record<string, unknown>;
  const reconcile = (liveAcct?.reconcile ?? {}) as Record<string, unknown>;
  const mismatches = (liveAcct?.mismatches ?? []) as Array<Record<string, unknown>>;

  function copyAddress() {
    if (!depositInfo.data?.receiveAddress) return;
    navigator.clipboard.writeText(depositInfo.data.receiveAddress);
    setCopied(true);
    toast.success("Deposit address copied");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
      <GeoblockAlert />
      <PageHeading
        eyebrow="Vault"
        title="Execution account"
        subtitle="Your segregated CLOB account on Polygon. pUSD sits on the deposit wallet; the bot spends it into the Polymarket CLOB and streams results back."
        actions={
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              syncLive
                .mutateAsync()
                .then(() => toast.success("Live account synced"))
                .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
            }
            className="rounded-lg border border-border bg-muted/40 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground hover:bg-muted/70"
          >
            <RefreshCw className={cn("mr-1.5 size-3.5", busy && "animate-spin")} /> Sync PM
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Deposit wallet pUSD"
          value={depositInfo.data?.depositWalletBalance ?? null}
          accent
          index={0}
        />
        <Stat label="CLOB cash" value={Number(cash.clob ?? 0)} index={1} />
        <Stat
          label="Session PnL"
          value={Number(cash.sessionCashPnl ?? null)}
          tone={(Number(cash.sessionCashPnl ?? 0) >= 0 ? "up" : "dn") as "up" | "dn"}
          sub="this session"
          index={2}
        />
        <Stat
          label="Since baseline"
          value={Number(cash.lifetimeBaseline ?? null)}
          tone={(Number(cash.lifetimeBaseline ?? 0) >= 0 ? "up" : "dn") as "up" | "dn"}
          sub="lifetime"
          index={3}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account details */}
        <div className="space-y-5">
          <section className="space-y-2.5">
            <SectionLabel>Identity</SectionLabel>
            <GlassPanel label="EXECUTION ACCOUNT">
              <dl className="space-y-2.5 p-4">
                {kv("Wallet", shortAddr(account?.wallet || ""))}
                {kv("Account ID", String(account?.accountId ?? "—"))}
                {kv("Mode", (mode ?? "paper").toUpperCase())}
                {kv("Chain", account?.chainId ? `Polygon · ${account.chainId}` : "—")}
                {kv("Session", account?.session?.running ? `RUNNING · #${account.session.id ?? "?"}` : "idle")}
                {kv("Started", account?.session?.startedAt ? new Date(account.session.startedAt * 1000).toISOString() : "—")}
              </dl>
            </GlassPanel>
          </section>

          {account?.wallet ? <ClobProvisionPanel address={account.wallet} /> : null}

          <section className="space-y-2.5">
            <SectionLabel>Funding ledger</SectionLabel>
            <GlassPanel label="LIFETIME">
              <dl className="space-y-2.5 p-4">
                {kv("Deposited gross", money(Number(account?.depositedGross ?? 0)))}
                {kv("Withdrawn", money(Number(account?.withdrawn ?? 0)))}
                {kv("Platform fees paid", money(Number(account?.platformFeesPaid ?? 0)))}
                {kv("Fee rate", `${((snap?.platformFeeRate ?? account?.platformFeeRate ?? 0.01) * 100).toFixed(0)}%`)}
                {kv("Book cash", money(Number(account?.cash ?? 0)))}
              </dl>
            </GlassPanel>
          </section>

          <section className="space-y-2.5">
            <SectionLabel>Deposit wallet</SectionLabel>
            <GlassPanel label="USDC → pUSD">
              <div className="space-y-3 p-4">
                <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <Wallet className="size-3.5 text-primary" />
                  {depositInfo.data?.network ?? "Polygon"} ·{" "}
                  {shortAddr(depositInfo.data?.usdcAddress || "")} →{" "}
                  {shortAddr(depositInfo.data?.pusdAddress || "")}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] text-foreground">
                    {depositInfo.data?.receiveAddress || "Loading…"}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyAddress}
                    className="shrink-0 rounded-lg border-border"
                  >
                    {copied ? <Check className="size-3.5 text-[var(--success)]" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
                <span
                  className={cn(
                    "zg-chip",
                    depositInfo.data?.scanActive
                      ? "border-[var(--success)]/40 text-[var(--success)]"
                      : "",
                  )}
                >
                  {depositInfo.data?.scanActive ? "Scanner active" : "Scanner off"}
                </span>
              </div>
            </GlassPanel>
          </section>
        </div>

        {/* Reconciliation */}
        <div className="space-y-5">
          <section className="space-y-2.5">
            <SectionLabel>Reconciliation</SectionLabel>
            <GlassPanel label="LAST SYNC">
              <dl className="space-y-2.5 p-4">
                {kv("Updated", liveAcct?.updatedAt ? new Date(liveAcct.updatedAt * 1000).toISOString() : "—")}
                {kv("Last CLOB sync", cash.lastSyncAt ? new Date(Number(cash.lastSyncAt) * 1000).toISOString() : "never")}
                {kv("Session start cash", money(Number(cash.sessionStartCash ?? null)))}
                {kv("Realized (PM sum)", money(Number(liveAcct?.totals?.pmRealizedSum ?? 0)))}
                {kv("Record", `${Number(liveAcct?.totals?.closedWins ?? 0)}W · ${Number(liveAcct?.totals?.closedLosses ?? 0)}L`)}
              </dl>
              {reconcile && Object.keys(reconcile).length > 0 ? (
                <div className="space-y-2 border-t border-border/60 p-4">
                  <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <Activity className="size-3" /> Reconcile fields
                  </p>
                  {Object.entries(reconcile).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{k}</span>
                      <span className="max-w-[60%] truncate font-mono text-[11px] text-foreground">
                        {String(v ?? "—")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </GlassPanel>
          </section>

          {mismatches.length > 0 ? (
            <section className="space-y-2.5">
              <SectionLabel>Mismatches</SectionLabel>
              <GlassPanel label={`${mismatches.length} OPEN`}>
                <div className="max-h-56 space-y-2 overflow-y-auto p-4">
                  {mismatches.map((m, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2"
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                      <div className="min-w-0 font-mono text-[10px] leading-relaxed text-muted-foreground">
                        <p className="text-foreground">{String(m.message || m.slug || m.title || "—")}</p>
                        {Object.entries(m)
                          .filter(([k]) => !["message", "slug", "title"].includes(k))
                          .slice(0, 4)
                          .map(([k, v]) => (
                            <p key={k}>
                              {k}: {String(v ?? "—")}
                            </p>
                          ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </GlassPanel>
            </section>
          ) : null}

          <section className="space-y-2.5">
            <SectionLabel>Deposit history</SectionLabel>
            <GlassPanel label="LATEST">
              <div className="max-h-64 overflow-y-auto">
                {!deposits.data?.deposits?.length ? (
                  <p className="p-4 font-mono text-[11px] text-muted-foreground">No deposits yet.</p>
                ) : (
                  <div className="divide-y divide-border/60">
                    {deposits.data.deposits.map((d, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 px-4 py-2.5">
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {String(d.txHash || d.id || "tx").slice(0, 14)}…
                        </span>
                        <span className="font-mono text-[12px] tabular-nums text-foreground">
                          {money(Number(d.amount ?? d.usdcAmount ?? 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </GlassPanel>
          </section>
        </div>
      </div>
    </div>
  );
}
