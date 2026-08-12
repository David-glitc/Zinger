"use client";

import { useMemo } from "react";
import { Loader2, ShieldCheck, Wallet, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  useClobBalanceCheck,
  useClobProvisionMutation,
  useClobStatus,
} from "@/hooks/use-pilot";
import { useClobProvision } from "@/hooks/use-clob-provision";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassPanel, SectionLabel } from "@/components/app/app-ui";

export function ClobProvisionPanel({ address }: { address: string }) {
  const status = useClobStatus(address);
  const balance = useClobBalanceCheck(address);
  const { provision, isPending: signing } = useClobProvision();
  const provisionMut = useClobProvisionMutation(address);

  const provisioned = !!status.data?.provisioned;

  const ready = useMemo(
    () => !!balance.data && !balance.data.needsPoly && !balance.data.needsUsdc,
    [balance.data],
  );

  const pending = signing || provisionMut.isPending;

  async function handleProvision() {
    try {
      const signed = await provision();
      const res = await provisionMut.mutateAsync(signed);
      toast.success(res.ok ? "CLOB account provisioned" : "Provision failed");
      void status.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="space-y-2.5">
      <SectionLabel>Polymarket CLOB</SectionLabel>
      <GlassPanel label={provisioned ? "PROVISIONED" : "PROVISIONING"}>
        <div className="space-y-4 p-4">
          {provisioned ? (
            <div className="flex items-start gap-3 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/5 px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
              <div className="min-w-0 font-mono text-[11px] leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground">Execution account ready</p>
                <p className="mt-0.5">
                  Trading keys are stored encrypted. Use the dashboard to fund and trade.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2",
                    balance.data?.needsPoly
                      ? "border-warning/30 bg-warning/5"
                      : "border-border/60 bg-background/40",
                  )}
                >
                  <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    <Wallet className="size-3" /> POL balance
                  </p>
                  <p className="mt-1 font-mono text-lg tabular-nums text-foreground">
                    {balance.data ? balance.data.polyBalance.toFixed(4) : "—"}
                    <span className="ml-1 text-[10px] text-muted-foreground">POL</span>
                  </p>
                  {balance.data?.needsPoly ? (
                    <p className="mt-0.5 font-mono text-[10px] text-warning">
                      ≥ {balance.data.thresholds.poly} POL for gas
                    </p>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2",
                    balance.data?.needsUsdc
                      ? "border-warning/30 bg-warning/5"
                      : "border-border/60 bg-background/40",
                  )}
                >
                  <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                    <Wallet className="size-3" /> USDC balance
                  </p>
                  <p className="mt-1 font-mono text-lg tabular-nums text-foreground">
                    {balance.data ? balance.data.usdcBalance.toFixed(2) : "—"}
                    <span className="ml-1 text-[10px] text-muted-foreground">USDC</span>
                  </p>
                  {balance.data?.needsUsdc ? (
                    <p className="mt-0.5 font-mono text-[10px] text-warning">
                      ≥ ${balance.data.thresholds.usdc} to trade
                    </p>
                  ) : null}
                </div>
              </div>

              {balance.isError ? (
                <p className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 font-mono text-[10px] text-warning">
                  <AlertTriangle className="size-3" /> Could not read on-chain balances. Network
                  may be unreachable.
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  <ShieldCheck className="size-3.5 shrink-0 text-primary" />
                  {ready
                    ? "Funds look good. Sign to create your execution keys."
                    : "Fund your wallet with POL + USDC on Polygon before provisioning."}
                </p>
                <Button
                  size="sm"
                  disabled={pending || !balance.data || !ready}
                  onClick={handleProvision}
                  className="shrink-0 rounded-lg"
                >
                  {pending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                  {signing ? "Sign request…" : provisionMut.isPending ? "Provisioning…" : "Provision CLOB"}
                </Button>
              </div>
            </>
          )}
        </div>
      </GlassPanel>
    </section>
  );
}
