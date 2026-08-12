"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useConnectWallet } from "@/hooks/use-pilot";
import { readToken, readTokenClaims, storeToken } from "@/lib/access";
import { buildConnectMessage } from "@/lib/connect-message";

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
  const { signMessageAsync } = useSignMessage();
  const lastSynced = useRef<string | null>(null);
  const [signatureError, setSignatureError] = useState<Error | null>(null);

  const normalizedAddress = address?.toLowerCase() ?? null;

  const syncWallet = useCallback(
    async (wallet: string, walletChainId: number) => {
      const claims = readTokenClaims();
      const hasToken = Boolean(readToken());
      const alreadyBound = typeof claims?.wallet === "string";
      const message = buildConnectMessage(wallet, {
        sub: typeof claims?.sub === "string" ? (claims.sub as string) : null,
        iat: typeof claims?.iat === "number" ? (claims.iat as number) : null,
      });

      setSignatureError(null);
      const onConnected = (res?: { token?: string }) => {
        if (res?.token) storeToken(res.token);
        lastSynced.current = wallet;
      };

      if (hasToken && !alreadyBound) {
        // Unbound token: prove ownership of this wallet by signing the
        // token-bound message before the server will bind it to the address.
        const signature = await signMessageAsync({ message });
        mutate({ address: wallet, chainId: walletChainId, signature, message }, { onSuccess: onConnected });
      } else {
        mutate({ address: wallet, chainId: walletChainId }, { onSuccess: onConnected });
      }
    },
    [mutate, signMessageAsync],
  );

  useEffect(() => {
    if (!isConnected || !normalizedAddress || !chainId) {
      lastSynced.current = null;
      setSignatureError(null);
      return;
    }
    if (lastSynced.current === normalizedAddress || isPending) return;

    void syncWallet(normalizedAddress, chainId).catch((err: unknown) => {
      // signing rejected or failed — surface as a sync error instead of
      // leaving the account stuck on "syncing".
      setSignatureError(err instanceof Error ? err : new Error("Wallet signature failed"));
    });
  }, [isConnected, normalizedAddress, chainId, isPending, syncWallet]);

  const authStatus: WalletAuthStatus = useMemo(() => {
    if (isConnecting || isReconnecting) return "connecting";
    if (!isConnected || !normalizedAddress) return "disconnected";
    if (isPending) return "syncing";
    if (isError || signatureError) return "error";
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
    signatureError,
  ]);

  const syncError = error ?? signatureError;

  const disconnectWallet = useCallback(() => {
    lastSynced.current = null;
    setSignatureError(null);
    disconnect();
    reset();
    queryClient.removeQueries({ queryKey: queryKeys.pilot.all });
  }, [disconnect, reset, queryClient]);

  return {
    address: normalizedAddress,
    chainId: chainId ?? null,
    isConnected,
    authStatus,
    isReady: authStatus === "ready",
    isBusy: authStatus === "connecting" || authStatus === "syncing",
    syncError,
    account: data?.account ?? null,
    disconnect: disconnectWallet,
    retrySync: () => {
      if (!normalizedAddress || !chainId) return;
      lastSynced.current = null;
      setSignatureError(null);
      reset();
      void syncWallet(normalizedAddress, chainId).catch((err: unknown) => {
        setSignatureError(err instanceof Error ? err : new Error("Wallet signature failed"));
      });
    },
  };
}