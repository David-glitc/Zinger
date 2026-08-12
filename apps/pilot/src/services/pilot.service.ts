import type { Account, DepositInfo, LiveAccount, Mode, PilotSnapshot, Rules, UsdcDepositResult } from "@/lib/api";
import { jsonFetch, localFetch } from "@/services/http.client";

export const pilotService = {
  getSnapshot(address?: string | null) {
    const q = address ? `?address=${encodeURIComponent(address)}` : "";
    return localFetch<PilotSnapshot>(`/api/pilot${q}`);
  },

  connectWallet(address: string, chainId: number) {
    return localFetch<{ ok: boolean; account: Account; isNew?: boolean; token?: string }>(
      "/api/pilot/connect",
      { method: "POST", body: JSON.stringify({ address, chainId }) },
    );
  },

  ensureAccount(address: string, chainId: number, mode?: Mode) {
    return localFetch<{ ok: boolean; account: Account }>("/api/pilot/account", {
      method: "POST",
      body: JSON.stringify({ address, chainId, mode }),
    });
  },

  deposit(address: string, amount: number) {
    return localFetch<{
      ok: boolean;
      account: Account;
      gross: number;
      fee: number;
      net: number;
    }>("/api/pilot/deposit", {
      method: "POST",
      body: JSON.stringify({ address, amount }),
    });
  },

  withdraw(address: string, amount: number) {
    return localFetch<{ ok: boolean; account: Account }>("/api/pilot/withdraw", {
      method: "POST",
      body: JSON.stringify({ address, amount }),
    });
  },

  saveRules(address: string, rules: Rules) {
    return localFetch<{ ok: boolean; account: Account }>("/api/pilot/rules", {
      method: "POST",
      body: JSON.stringify({ address, rules }),
    });
  },

  startSession(address: string) {
    return localFetch<{ ok: boolean; account: Account }>("/api/pilot/session/start", {
      method: "POST",
      body: JSON.stringify({ address }),
    });
  },

  stopSession(address: string) {
    return localFetch<{ ok: boolean; account: Account }>("/api/pilot/session/stop", {
      method: "POST",
      body: JSON.stringify({ address }),
    });
  },

  getDepositInfo(address: string) {
    return localFetch<DepositInfo>(
      `/api/pilot/deposit-info?address=${encodeURIComponent(address)}`,
    );
  },

  confirmUsdcDeposit(address: string, txHash: string) {
    return jsonFetch<UsdcDepositResult>(
      "/pilot/deposit-usdc",
      { method: "POST", body: JSON.stringify({ address, txHash }) },
    );
  },

  provisionClob(address: string, signature: string, timestamp: string, nonce: string) {
    return localFetch<{ ok: boolean; apiKey?: string }>(
      "/api/pilot/clob/provision",
      {
        method: "POST",
        body: JSON.stringify({ address, signature, timestamp, nonce }),
      },
    );
  },

  getClobStatus(address: string) {
    return localFetch<{ provisioned: boolean; hasApiKey?: boolean }>(
      `/api/pilot/clob/provision?address=${encodeURIComponent(address)}`,
    );
  },

  getClobBalanceCheck(address: string) {
    return localFetch<{
      polyBalance: number;
      usdcBalance: number;
      needsPoly: boolean;
      needsUsdc: boolean;
      canProvision: boolean;
      canTrade: boolean;
      thresholds: { poly: number; usdc: number };
    }>(`/api/pilot/clob/check?address=${encodeURIComponent(address)}`);
  },

  paperTick(address: string) {
    return localFetch<{ ok: boolean; opened: number; closed: number }>(
      "/api/pilot/paper/tick",
      { method: "POST", body: JSON.stringify({ address }) },
    );
  },

  getDeposits(address: string) {
    return localFetch<{ deposits: Array<Record<string, unknown>> }>(
      `/api/pilot/deposits?address=${encodeURIComponent(address)}`,
    );
  },

  getLiveAccount(refresh = false) {
    const q = refresh ? "?refresh=1" : "";
    return jsonFetch<LiveAccount & { ok?: boolean; timestamp?: number; note?: string }>(
      `/live-account${q}`,
    );
  },

  getProfile(wallet: string) {
    return localFetch<{ wallet: string; profile: Record<string, unknown> | null }>(
      `/api/profiles?wallet=${encodeURIComponent(wallet)}`,
    );
  },

  listProfiles() {
    return localFetch<{ profiles: Array<Record<string, unknown>> }>(
      "/api/profiles?list=true",
    );
  },

  saveProfile(wallet: string, profile: Record<string, unknown>) {
    return localFetch<{ ok: boolean; profile: Record<string, unknown> }>(
      "/api/profiles",
      { method: "POST", body: JSON.stringify({ wallet, ...profile }) },
    );
  },

  syncLiveAccount() {
    return jsonFetch<LiveAccount & { ok: boolean }>("/live-account/sync", {
      method: "POST",
      body: "{}",
    });
  },
} as const;
