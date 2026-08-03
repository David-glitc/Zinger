import type { Account, DepositInfo, LiveAccount, Mode, PilotSnapshot, Rules, UsdcDepositResult } from "@/lib/api";
import { jsonFetch } from "@/services/http.client";

export const pilotService = {
  getSnapshot(address?: string | null) {
    const q = address ? `?address=${encodeURIComponent(address)}` : "";
    return jsonFetch<PilotSnapshot>(`/pilot${q}`);
  },

  connectWallet(address: string, chainId: number) {
    return jsonFetch<{ ok: boolean; account: Account }>("/pilot/connect", {
      method: "POST",
      body: JSON.stringify({ address, chainId }),
    });
  },

  ensureAccount(address: string, chainId: number, mode?: Mode) {
    return jsonFetch<{ ok: boolean; account: Account }>("/pilot/account", {
      method: "POST",
      body: JSON.stringify({ address, chainId, mode }),
    });
  },

  deposit(address: string, amount: number) {
    return jsonFetch<{
      ok: boolean;
      account: Account;
      gross: number;
      fee: number;
      net: number;
    }>("/pilot/deposit", {
      method: "POST",
      body: JSON.stringify({ address, amount }),
    });
  },

  withdraw(address: string, amount: number) {
    return jsonFetch<{ ok: boolean; account: Account }>("/pilot/withdraw", {
      method: "POST",
      body: JSON.stringify({ address, amount }),
    });
  },

  saveRules(address: string, rules: Rules) {
    return jsonFetch<{ ok: boolean; account: Account }>("/pilot/rules", {
      method: "POST",
      body: JSON.stringify({ address, rules }),
    });
  },

  startSession(address: string) {
    return jsonFetch<{ ok: boolean; account: Account }>("/pilot/session/start", {
      method: "POST",
      body: JSON.stringify({ address }),
    });
  },

  stopSession(address: string) {
    return jsonFetch<{ ok: boolean; account: Account }>("/pilot/session/stop", {
      method: "POST",
      body: JSON.stringify({ address }),
    });
  },

  getDepositInfo() {
    return jsonFetch<DepositInfo>("/pilot/deposit-info");
  },

  confirmUsdcDeposit(address: string, txHash: string) {
    return jsonFetch<UsdcDepositResult>("/pilot/deposit-usdc", {
      method: "POST",
      body: JSON.stringify({ address, txHash }),
    });
  },

  getDeposits(address: string) {
    return jsonFetch<{ deposits: Array<Record<string, unknown>> }>(
      `/pilot/deposits?address=${encodeURIComponent(address)}`,
    );
  },

  getLiveAccount(refresh = false) {
    const q = refresh ? "?refresh=1" : "";
    return jsonFetch<LiveAccount & { ok?: boolean; timestamp?: number; note?: string }>(
      `/live-account${q}`,
    );
  },

  syncLiveAccount() {
    return jsonFetch<LiveAccount & { ok: boolean }>("/live-account/sync", {
      method: "POST",
      body: "{}",
    });
  },
} as const;
