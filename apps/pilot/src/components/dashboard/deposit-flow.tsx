"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { DepositInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, ArrowRight, Wallet } from "lucide-react";

interface DepositFlowProps {
  info: DepositInfo | null | undefined;
  mode: string;
  onDeposit: (amount: number) => Promise<void>;
  onWithdraw: (amount: number) => Promise<void>;
  onConfirmTx: (txHash: string) => Promise<void>;
  busy: boolean;
  cash: number;
}

export function DepositFlow({
  info,
  mode,
  onDeposit,
  onWithdraw,
  onConfirmTx,
  busy,
  cash,
}: DepositFlowProps) {
  const [depositAmt, setDepositAmt] = useState(50);
  const [withdrawAmt, setWithdrawAmt] = useState(0);
  const [txHash, setTxHash] = useState("");
  const [copied, setCopied] = useState(false);

  const QUICK_FUND = [50, 100, 250, 500];

  async function handleCopy(addr: string) {
    await navigator.clipboard.writeText(addr);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleConfirmTx() {
    const hash = txHash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      toast.error("Enter a valid transaction hash (0x...)");
      return;
    }
    try {
      await onConfirmTx(hash);
      setTxHash("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm deposit");
    }
  }

  if (mode === "live") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-background p-4 sm:rounded-xl sm:p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-medium tracking-tight text-foreground">
            <Wallet className="size-4 text-primary" />
            Fund live account
          </h3>
          <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted-foreground">
            Send Polygon native USDC to the address below. After the transaction confirms,
            paste the hash to convert USDC → pUSD and credit your account.
          </p>

          <div className="mt-4 space-y-1">
            <Label className="font-sans text-[11px] font-medium text-muted-foreground">
              Deposit address (Polygon)
            </Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-2xl border border-border bg-muted px-3 py-2 font-mono text-[12px] text-foreground">
                {info?.receiveAddress || "Loading…"}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(info?.receiveAddress || "")}
                className="shrink-0 rounded-2xl border-border"
              >
                {copied ? (
                  <Check className="size-3.5 text-success" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-4 text-[12px] text-muted-foreground">
            <span>
              pUSD balance: <strong className="text-foreground">${(info?.depositWalletBalance ?? 0).toFixed(2)}</strong>
            </span>
            <span className="text-border">|</span>
            <span>
              CLOB cash: <strong className="text-foreground">${cash.toFixed(2)}</strong>
            </span>
          </div>

          <div className="mt-4 space-y-1">
            <Label className="font-sans text-[11px] font-medium text-muted-foreground">
              Confirm deposit (after sending USDC)
            </Label>
            <div className="flex gap-2">
              <Input
                className="h-9 flex-1 rounded-2xl border-border font-mono text-[12px]"
                placeholder="0x..."
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
              />
              <Button
                disabled={busy || !txHash.trim()}
                onClick={handleConfirmTx}
                className="shrink-0 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <ArrowRight className="mr-1 size-3.5" />
                Verify
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-background p-4 sm:rounded-xl sm:p-5">
        <h3 className="flex items-center gap-2 font-display text-base font-medium tracking-tight text-foreground">
          <Wallet className="size-4 text-primary" />
          Paper credit
        </h3>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted-foreground">
          Paper credit hits your ledger instantly (1% fee). This is what the session spends.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_FUND.map((q) => (
              <Button
                key={q}
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onDeposit(q)}
                className="rounded-xl border-border font-mono text-[11px] text-foreground hover:bg-primary/10"
              >
                +${q}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              type="number"
              min={50}
              max={100000}
              step={50}
              className="h-9 w-28 rounded-2xl border-border text-sm"
              value={depositAmt}
              onChange={(e) => setDepositAmt(Number(e.target.value))}
            />
            <Button
              disabled={busy}
              onClick={() => onDeposit(depositAmt)}
              className="rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Add credit
            </Button>
            <Input
              type="number"
              min={0}
              step={10}
              className="h-9 w-24 rounded-2xl border-border text-sm"
              placeholder="Out"
              value={withdrawAmt || ""}
              onChange={(e) => setWithdrawAmt(Number(e.target.value))}
            />
            <Button
              variant="outline"
              disabled={busy || !(withdrawAmt > 0)}
              onClick={() => onWithdraw(withdrawAmt)}
              className="rounded-2xl border-border text-foreground"
            >
              Withdraw
            </Button>
          </div>
          <p className="font-sans text-[12px] text-muted-foreground">
            Cash: <strong className="text-foreground">${cash.toFixed(2)}</strong>
            {" · "}Min $50 to start session
          </p>
        </div>
      </div>
    </div>
  );
}
