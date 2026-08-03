"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WalletConnectButtonProps = {
  className?: string;
  size?: "default" | "sm" | "lg";
  label?: string;
  connectedLabel?: string;
  onConnectedClick?: () => void;
};

export function WalletConnectButton({
  className,
  size = "default",
  label = "Connect wallet",
  connectedLabel,
  onConnectedClick,
}: WalletConnectButtonProps) {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return (
            <Button size={size} className={cn("rounded-full", className)} disabled>
              {label}
            </Button>
          );
        }

        if (!connected) {
          return (
            <Button
              size={size}
              className={cn("rounded-full", className)}
              onClick={openConnectModal}
            >
              {label}
            </Button>
          );
        }

        if (chain.unsupported) {
          return (
            <Button
              size={size}
              variant="destructive"
              className={cn("rounded-full", className)}
              onClick={openChainModal}
            >
              Wrong network
            </Button>
          );
        }

        return (
          <Button
            size={size}
            variant="outline"
            className={cn("rounded-full font-mono text-xs", className)}
            onClick={() => {
              if (onConnectedClick) onConnectedClick();
              else openAccountModal();
            }}
          >
            {connectedLabel || account.displayName}
          </Button>
        );
      }}
    </ConnectButton.Custom>
  );
}

export function WalletConnectCompact() {
  return (
    <ConnectButton
      showBalance={false}
      chainStatus="icon"
      accountStatus="address"
    />
  );
}
