"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useWalletAuth } from "@/hooks/use-wallet-auth";
import { useAccessKind } from "@/hooks/use-access-kind";
import {
  useEnsureAccount,
  useLiveAccount,
  usePilotSnapshot,
  useSessionToggle,
  useSyncLiveAccount,
} from "@/hooks/use-pilot";
import type { Mode } from "@/lib/api";

export function useAppState() {
  const { address, chainId, isReady } = useWalletAuth();
  const accessKind = useAccessKind();
  const snapshot = usePilotSnapshot(address, isReady);
  const { data: snap } = snapshot;
  const account = snapshot.data?.account ?? null;

  const ensureAccount = useEnsureAccount(address);
  const sessionMutation = useSessionToggle(address);
  const syncLive = useSyncLiveAccount();
  const liveAccountQuery = useLiveAccount(account?.mode === "live");

  const mode: Mode = account?.mode ?? "paper";
  const sessionRunning = !!account?.session?.running;

  const busy =
    ensureAccount.isPending ||
    sessionMutation.isPending ||
    syncLive.isPending;

  const setMode = useCallback(
    async (next: Mode) => {
      if (!chainId) {
        toast.error("Connect a wallet first");
        return;
      }
      if (next === "live" && accessKind === "paper") {
        toast.error("Live mode requires an access code. Paper mode has full functionality with simulated funds.");
        return;
      }
      try {
        await ensureAccount.mutateAsync({ chainId, mode: next });
        if (next === "live") {
          try {
            await syncLive.mutateAsync();
          } catch {
            /* best-effort */
          }
          toast.success("Live — CLOB + Polymarket closed-book synced");
        } else {
          toast.info("Paper mode");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    },
    [chainId, ensureAccount, syncLive, accessKind],
  );

  const toggleSession = useCallback(async () => {
    try {
      const res = await sessionMutation.mutateAsync(sessionRunning);
      toast.success(
        sessionRunning ? "Session stopped" : `Session ${res.account.session.id} running`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [sessionMutation, sessionRunning]);

  return {
    address,
    chainId,
    isReady,
    account,
    snap,
    isLoading: snapshot.isLoading,
    isError: snapshot.isError,
    error: snapshot.error,
    mode,
    sessionRunning,
    busy,
    setMode,
    toggleSession,
    liveAccountQuery,
    syncLive,
    accessKind,
  };
}
