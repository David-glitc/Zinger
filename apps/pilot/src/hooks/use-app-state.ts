"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useWalletAuth } from "@/hooks/use-wallet-auth";
import {
  useEnsureAccount,
  useLiveAccount,
  usePilotSnapshot,
  useSessionToggle,
  useSyncLiveAccount,
} from "@/hooks/use-pilot";
import type { Mode } from "@/lib/api";

/**
 * Central app state shared by every /app page. Mode, session, and live
 * sync live here so switching paper/live in the rail updates every page.
 */
export function useAppState() {
  const { address, chainId, isReady } = useWalletAuth();
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
    [chainId, ensureAccount, syncLive],
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
  };
}
