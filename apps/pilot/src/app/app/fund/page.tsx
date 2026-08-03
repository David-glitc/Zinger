"use client";

import { useAppState } from "@/hooks/use-app-state";
import { useConfirmUsdcDeposit, useDeposit, useDepositInfo, useWithdraw } from "@/hooks/use-pilot";
import { money, shortAddr } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBalance } from "wagmi";
import { ArrowDownToLine, Repeat, Coins, Fuel, Wallet } from "lucide-react";
import { PageHeading, Stat, GlassPanel, SectionLabel } from "@/components/app/app-ui";
import { GeoblockAlert } from "@/components/dashboard/geoblock-status";
import { DepositFlow } from "@/components/dashboard/deposit-flow";
import { DepositPanel } from "@/components/dashboard/deposit-panel";

export default function FundPage() {
  const { address, account, mode, busy, snap, liveAccountQuery } = useAppState();
  const depositInfo = useDepositInfo();
  const deposit = useDeposit(address);
  const withdraw = useWithdraw(address);
  const confirm = useConfirmUsdcDeposit(address);

  const usdcAddress = depositInfo.data?.usdcAddress || undefined;
  const usdcBalance = useBalance({
    address: address as `0x${string}` | undefined,
    token: usdcAddress as `0x${string}` | undefined,
  });
  const nativeBalance = useBalance({ address: address as `0x${string}` | undefined });

  const liveAcct = liveAccountQuery.data || snap?.liveAccount || null;
  const liveCash = Number(liveAcct?.cash?.clob ?? 0);

  async function onDeposit(amount: number) {
    try {
      const res = await deposit.mutateAsync(amount);
      toast.success(`Deposited ${money(amount)} · fee ${money(res.fee)} · net ${money(res.net)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function onWithdraw(amount: number) {
    try {
      await withdraw.mutateAsync(amount);
      toast.success(`Withdrew ${money(amount)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function onConfirmTx(txHash: string) {
    try {
      const res = await confirm.mutateAsync(txHash);
      if (res.ok) {
        toast.success(
          `${res.usdcAmount.toFixed(2)} USDC → ${(res.pUsdAmount ?? 0).toFixed(2)} pUSD credited`,
        );
      } else {
        toast.error("Deposit not found or failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm deposit");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <GeoblockAlert />
      <PageHeading
        eyebrow="Capital"
        title={mode === "live" ? "Fund the vault" : "Paper credit"}
        subtitle={
          mode === "live"
            ? "Send Polygon-native USDC from your connected wallet. After it confirms, the bot swaps USDC → pUSD mid-flight and credits your execution account."
            : "Add or withdraw simulated credit. The session spends this instantly on entries."
        }
        actions={
          <span className="zg-chip border-primary/30 text-primary">
            <Coins className="size-3" /> {mode === "live" ? "pUSD vault" : "paper"}
          </span>
        }
      />

      {/* Connected wallet balances */}
      <section className="space-y-3">
        <SectionLabel>Connected wallet</SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat
            label="USDC (your wallet)"
            value={usdcBalance.data ? Number(usdcBalance.data.formatted) : null}
            sub={shortAddr(usdcAddress || "")}
            index={0}
          />
          <Stat
            label="POL (gas)"
            value={nativeBalance.data ? Number(nativeBalance.data.formatted) : null}
            index={1}
          />
          <Stat
            label="Wallet"
            value={shortAddr(address || "")}
            sub="connected"
            index={2}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-6">
          <section className="space-y-3">
            <SectionLabel>Move money</SectionLabel>
            <DepositFlow
              info={depositInfo.data}
              mode={mode}
              onDeposit={onDeposit}
              onWithdraw={onWithdraw}
              onConfirmTx={onConfirmTx}
              busy={busy}
              cash={mode === "live" ? liveCash : Number(account?.cash ?? 0)}
            />
          </section>

          <section className="space-y-3">
            <SectionLabel>USDC deposit detail</SectionLabel>
            <DepositPanel info={depositInfo.data} address={address} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <SectionLabel>How it lands</SectionLabel>
            <GlassPanel>
              <ol className="space-y-4 p-4">
                {[
                  [
                    <ArrowDownToLine key="1" className="size-4 text-primary" />,
                    "Send",
                    "Transfer Polygon-native USDC to the vault address. USDC on Ethereum will not work.",
                  ],
                  [
                    <Repeat key="2" className="size-4 text-primary" />,
                    "Confirm",
                    "Paste your transaction hash — the scanner matches it to your deposit wallet.",
                  ],
                  [
                    <Wallet key="3" className="size-4 text-primary" />,
                    "Swap mid-flight",
                    "The bot swaps USDC → pUSD on Polygon and credits your execution account automatically.",
                  ],
                ].map(([icon, title, body], i) => (
                  <li key={i} className="flex gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
                      {icon as React.ReactNode}
                    </div>
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
                        {title as string}
                      </p>
                      <p className="mt-0.5 font-sans text-[12px] leading-relaxed text-muted-foreground">
                        {body as string}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </GlassPanel>
          </section>

          {mode === "live" && (
            <section className="space-y-3">
              <SectionLabel>Vault position</SectionLabel>
              <GlassPanel label="pUSD → CLOB">
                <dl className="space-y-2.5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Deposit wallet pUSD
                    </dt>
                    <dd className="font-mono text-[12px] tabular-nums text-primary">
                      {money(depositInfo.data?.depositWalletBalance ?? 0)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      CLOB cash
                    </dt>
                    <dd className="font-mono text-[12px] tabular-nums text-foreground">
                      {money(liveCash)}
                    </dd>
                  </div>
                  <p className="border-t border-border/60 pt-2 font-sans text-[11px] leading-relaxed text-muted-foreground">
                    Deposits land on the deposit wallet first, then flow into the CLOB when a
                    session spends them on entries. Keep gas on your wallet for confirmations.
                  </p>
                </dl>
              </GlassPanel>
            </section>
          )}

          <section className="space-y-3">
            <SectionLabel>Gas check</SectionLabel>
            <GlassPanel label="GAS WALLET">
              <div className="flex items-center justify-between gap-2 p-4">
                <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <Fuel className="size-3.5" /> Native POL balance
                </span>
                <span
                  className={cn(
                    "font-mono text-[13px] tabular-nums",
                    Number(nativeBalance.data?.formatted ?? 0) < 0.05
                      ? "text-warning"
                      : "text-[var(--success)]",
                  )}
                >
                  {nativeBalance.data ? Number(nativeBalance.data.formatted).toFixed(4) : "—"} POL
                </span>
              </div>
              {Number(nativeBalance.data?.formatted ?? 0) < 0.05 ? (
                <p className="border-t border-border/60 px-4 py-3 font-sans text-[11px] text-warning">
                  Low gas — confirmations and the USDC → pUSD swap need POL. Fund your wallet
                  before sending.
                </p>
              ) : null}
            </GlassPanel>
          </section>
        </div>
      </div>
    </div>
  );
}
