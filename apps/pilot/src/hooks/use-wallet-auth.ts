"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useConnectWallet } from "@/hooks/use-pilot";

export type WalletAuthStatus =
  | "disconnected"
  | "connecting"
  | "syncing"
  | "ready"
  | "error";

export function useWalletAuth() {
  const queryClient = useQueryClient();
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const { mutate, isPending, isSuccess, isError, data, error, reset } = useConnectWallet();
  const lastSynced = useRef<string | null>(null);

  const normalizedAddress = address?.toLowerCase() ?? null;

  useEffect(() => {
    if (!isConnected || !normalizedAddress || !chainId) {
      lastSynced.current = null;
      return;
    }
    if (lastSynced.current === normalizedAddress || isPending) return;
    mutate(
      { address: normalizedAddress, chainId },
      { onSuccess: () => { lastSynced.current = normalizedAddress; } },
    );
  }, [isConnected, normalizedAddress, chainId, isPending, mutate]);

  const authStatus: WalletAuthStatus = useMemo(() => {
    if (isConnecting || isReconnecting) return "connecting";
    if (!isConnected || !normalizedAddress) return "disconnected";
    if (isPending) return "syncing";
    if (isError) return "error";
    if (isSuccess || lastSynced.current === normalizedAddress) return "ready";
    return "syncing";
  }, [
    isConnected,
    isConnecting,
    isReconnecting,
    normalizedAddress,
    isPending,
    isError,
    isSuccess,
  ]);

  function disconnectWallet() {
    lastSynced.current = null;
    disconnect();
    reset();
    queryClient.removeQueries({ queryKey: queryKeys.pilot.all });
  }

  return {
    address: normalizedAddress,
    chainId: chainId ?? null,
    isConnected,
    authStatus,
    isReady: authStatus === "ready",
    isBusy: authStatus === "connecting" || authStatus === "syncing",
    syncError: error,
    account: data?.account ?? null,
    disconnect: disconnectWallet,
    retrySync: () => {
      if (!normalizedAddress || !chainId) return;
      lastSynced.current = null;
      mutate({ address: normalizedAddress, chainId });
    },
  };
}
