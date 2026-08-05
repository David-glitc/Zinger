"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { Mode, Rules } from "@/lib/api";
import { pilotService } from "@/services/pilot.service";

export function usePilotSnapshot(address?: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.pilot.snapshot(address),
    queryFn: () => pilotService.getSnapshot(address),
    enabled: enabled && !!address,
    refetchInterval: enabled && address ? 2_500 : false,
    staleTime: 500,
  });
}

export function useConnectWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ address, chainId }: { address: string; chainId: number }) =>
      pilotService.connectWallet(address.toLowerCase(), chainId),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(queryKeys.pilot.snapshot(vars.address.toLowerCase()), (old) => ({
        ...(typeof old === "object" && old ? old : {}),
        account: data.account,
      }));
      void queryClient.invalidateQueries({
        queryKey: queryKeys.pilot.snapshot(vars.address.toLowerCase()),
      });
    },
  });
}

export function useEnsureAccount(address?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chainId, mode }: { chainId: number; mode?: Mode }) => {
      if (!address) throw new Error("Wallet not connected");
      return pilotService.ensureAccount(address.toLowerCase(), chainId, mode);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.pilot.snapshot(address?.toLowerCase()),
      });
      return data;
    },
  });
}

export function useDeposit(address?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => {
      if (!address) throw new Error("Wallet not connected");
      return pilotService.deposit(address.toLowerCase(), amount);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.pilot.snapshot(address?.toLowerCase()),
      });
    },
  });
}

export function useWithdraw(address?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => {
      if (!address) throw new Error("Wallet not connected");
      return pilotService.withdraw(address.toLowerCase(), amount);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.pilot.snapshot(address?.toLowerCase()),
      });
    },
  });
}

export function useSaveRules(address?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rules: Rules) => {
      if (!address) throw new Error("Wallet not connected");
      return pilotService.saveRules(address.toLowerCase(), rules);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.pilot.snapshot(address?.toLowerCase()),
      });
    },
  });
}

export function useSessionToggle(address?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (running: boolean) => {
      if (!address) throw new Error("Wallet not connected");
      const addr = address.toLowerCase();
      return running ? pilotService.stopSession(addr) : pilotService.startSession(addr);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.pilot.snapshot(address?.toLowerCase()),
      });
    },
  });
}

export function usePilotAccount(address?: string | null) {
  const snapshot = usePilotSnapshot(address, !!address);
  return {
    ...snapshot,
    account: snapshot.data?.account ?? null,
    snap: snapshot.data ?? null,
  };
}

export function useDepositInfo() {
  return useQuery({
    queryKey: ["pilot", "deposit-info"],
    queryFn: () => pilotService.getDepositInfo(),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useConfirmUsdcDeposit(address?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (txHash: string) => {
      if (!address) throw new Error("Wallet not connected");
      return pilotService.confirmUsdcDeposit(address.toLowerCase(), txHash);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.pilot.snapshot(address?.toLowerCase()),
      });
      void queryClient.invalidateQueries({
        queryKey: ["pilot", "deposit-info"],
      });
    },
  });
}

export function useDeposits(address?: string | null) {
  return useQuery({
    queryKey: ["pilot", "deposits", address?.toLowerCase()],
    queryFn: () => pilotService.getDeposits(address?.toLowerCase() || ""),
    enabled: !!address,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useLiveAccount(enabled = true) {
  return useQuery({
    queryKey: ["pilot", "live-account"],
    queryFn: () => pilotService.getLiveAccount(false),
    enabled,
    refetchInterval: enabled ? 8_000 : false,
    staleTime: 4_000,
  });
}

export function useSyncLiveAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pilotService.syncLiveAccount(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pilot", "live-account"] });
      void queryClient.invalidateQueries({ queryKey: ["pilot", "deposit-info"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pilot.all });
    },
  });
}
