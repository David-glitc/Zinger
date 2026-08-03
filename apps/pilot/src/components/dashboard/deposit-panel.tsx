"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { DepositInfo } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useConfirmUsdcDeposit } from "@/hooks/use-pilot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function DepositPanel({
  info,
  address,
}: {
  info: DepositInfo | null | undefined;
  address?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [txHash, setTxHash] = useState("");
  const confirmDeposit = useConfirmUsdcDeposit(address);

  async function onConfirmTx() {
    const hash = txHash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      toast.error("Enter a valid transaction hash (0x...)");
      return;
    }
    try {
      const res = await confirmDeposit.mutateAsync(hash);
      if (res.ok) {
        toast.success(
          `USDC deposit confirmed · ${res.usdcAmount.toFixed(2)} USDC → ${(res.pUsdAmount ?? 0).toFixed(2)} pUSD`,
        );
        setTxHash("");
      } else {
        toast.error("Deposit not found or failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm deposit");
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded border border-border/40 px-3 py-1.5 text-[10px] font-mono text-muted-foreground hover:bg-muted/30"
      >
        <svg
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>USDC Deposit</span>
        <span className="text-foreground">
          ${(info?.depositWalletBalance ?? 0).toFixed(2)} pUSD
        </span>
        <Badge
          variant="outline"
          className={cn(
            "ml-auto text-[9px]",
            info?.scanActive
              ? "border-[var(--success)] text-[var(--success)]"
              : "border-muted-foreground/40",
          )}
        >
          {info?.scanActive ? "Scanner active" : "Scanner off"}
        </Badge>
      </button>
      {open ? (
        <Card className="border-border/60">
          <CardContent className="space-y-3 p-3">
            <div className="space-y-1">
              <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Send USDC to this address (Polygon)
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded border border-border/40 bg-muted px-2 py-1 font-mono text-[10px]">
                  {info?.receiveAddress || "Loading…"}
                </code>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    if (info?.receiveAddress) {
                      navigator.clipboard.writeText(info.receiveAddress);
                      toast.success("Address copied");
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
              <span>
                pUSD balance:{" "}
                <span className="text-foreground">
                  ${(info?.depositWalletBalance ?? 0).toFixed(2)}
                </span>
              </span>
            </div>

            <Separator className="my-1" />

            <div className="space-y-1">
              <Label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Confirm transaction (after sending USDC)
              </Label>
              <div className="flex gap-2">
                <Input
                  className="h-7 flex-1 font-mono text-[10px]"
                  placeholder="0x..."
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                />
                <Button
                  size="xs"
                  disabled={confirmDeposit.isPending || !txHash.trim()}
                  onClick={onConfirmTx}
                >
                  Verify
                </Button>
              </div>
            </div>

            <p className="text-[9px] text-muted-foreground">
              Send Polygon native USDC (not ERC-20 on Ethereum). After the tx confirms,
              paste the hash above. The bot swaps USDC → pUSD and credits your account.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
