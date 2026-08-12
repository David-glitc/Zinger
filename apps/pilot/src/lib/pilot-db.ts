import { getCollection } from "./mongo";
import crypto from "crypto";

export interface PaperPosition {
  id: string;
  asset: string;
  outcome: "UP" | "DOWN";
  duration: string;
  slug: string;
  entry: number;
  mark: number;
  shares: number;
  sizeUsd: number;
  confidence: number;
  tp: number;
  sl: number;
  openedAt: number;
  unrealizedPnl: number;
  pnlPct: number;
}

export interface PaperTrade {
  id: string;
  asset: string;
  outcome: "UP" | "DOWN";
  duration: string;
  slug: string;
  entry: number;
  exit: number;
  shares: number;
  sizeUsd: number;
  pnl: number;
  pnlPct: number;
  reason: string;
  openedAt: number;
  closedAt: number;
}

export interface PilotAccount {
  wallet: string;
  accountId: string;
  chainId: number;
  mode: "paper" | "live";
  cash: number;
  initialBankroll: number;
  platformFeesPaid: number;
  depositedGross: number;
  withdrawn: number;
  rules: {
    maxPositionPct: number;
    minConfidence: number;
    minPrice: number;
    maxPrice: number;
    assets: string[];
    durations: string[];
    minTpUsd: number;
  };
  session: {
    running: boolean;
    id: string | null;
    startedAt: number | null;
    stoppedAt: number | null;
  };
  events: Array<{
    id: string;
    type: string;
    message: string;
    timestamp: number;
    fee?: number;
    pnl?: number;
  }>;
  usdcDeposits: Array<{
    txHash: string;
    amount: number;
    pusdAmount: number;
    fee: number;
    block: number;
    confirmedAt: number;
  }>;
  positions: PaperPosition[];
  trades: PaperTrade[];
  clobApiKey: string | null;
  clobApiSecret: string | null;
  clobApiPassphrase: string | null;
  clobProxyAddress: string | null;
  profile?: {
    username?: string | null;
    displayName?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    xHandle?: string | null;
    public: boolean;
    updatedAt: number;
  } | null;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_RULES = Object.freeze({
  maxPositionPct: 10,
  minConfidence: 0.38,
  minPrice: 0.42,
  maxPrice: 0.68,
  assets: ["BTC", "ETH"],
  durations: ["5m", "15m"],
  minTpUsd: 5,
});

function makeAccountId(wallet: string) {
  return `za_${crypto
    .createHash("sha256")
    .update(`zinger-acct:${wallet}`)
    .digest("hex")
    .slice(0, 12)}`;
}

function defaultAccount(wallet: string, chainId = 137): PilotAccount {
  return {
    wallet,
    accountId: makeAccountId(wallet),
    chainId,
    mode: "paper",
    cash: 0,
    initialBankroll: 0,
    platformFeesPaid: 0,
    depositedGross: 0,
    withdrawn: 0,
    rules: { ...DEFAULT_RULES },
    session: { running: false, id: null, startedAt: null, stoppedAt: null },
    events: [],
    usdcDeposits: [],
    positions: [],
    trades: [],
    clobApiKey: null,
    clobApiSecret: null,
    clobApiPassphrase: null,
    clobProxyAddress: null,
    profile: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function normalizeAddress(address: string) {
  const a = address.toLowerCase().trim();
  if (!/^0x[a-f0-9]{40}$/.test(a)) return null;
  return a;
}

export async function getAccount(wallet: string): Promise<PilotAccount | null> {
  const col = await getCollection("pilot_accounts");
  const doc = await col.findOne({ wallet });
  return (doc as unknown as PilotAccount) ?? null;
}

export async function ensureAccount(
  wallet: string,
  chainId = 137,
): Promise<PilotAccount> {
  const normalized = normalizeAddress(wallet);
  if (!normalized) throw new Error("Invalid wallet address");

  const col = await getCollection("pilot_accounts");
  const existing = await col.findOne({ wallet: normalized });
  if (existing) {
    const updated = { ...existing, chainId, updatedAt: Date.now() } as unknown as PilotAccount;
    await col.updateOne({ wallet: normalized }, { $set: { chainId, updatedAt: Date.now() } });
    return updated;
  }

  const acct = defaultAccount(normalized, chainId);
  await col.insertOne({ ...acct } as unknown as Record<string, unknown>);
  return acct;
}

export async function connectWallet(
  wallet: string,
  chainId: number,
): Promise<{ account: PilotAccount; isNew: boolean }> {
  const normalized = normalizeAddress(wallet);
  if (!normalized) throw new Error("Invalid wallet address");

  const existing = await getAccount(normalized);
  if (existing) {
    return { account: existing, isNew: false };
  }

  const acct = await ensureAccount(normalized, chainId);
  return { account: acct, isNew: true };
}

export async function deposit(
  wallet: string,
  amount: number,
): Promise<{
  account: PilotAccount;
  gross: number;
  fee: number;
  net: number;
}> {
  const normalized = normalizeAddress(wallet);
  if (!normalized) throw new Error("Invalid wallet address");

  const fee = amount * 0.01;
  const net = amount - fee;

  const col = await getCollection("pilot_accounts");
  const doc = await col.findOne({ wallet: normalized });
  if (!doc) throw new Error("Account not found");

  const acct = doc as unknown as PilotAccount;
  const updated: Partial<PilotAccount> = {
    cash: acct.cash + net,
    initialBankroll: acct.initialBankroll + net,
    depositedGross: acct.depositedGross + amount,
    platformFeesPaid: acct.platformFeesPaid + fee,
    updatedAt: Date.now(),
    events: [
      ...acct.events,
      {
        id: crypto.randomUUID(),
        type: "deposit",
        message: `Deposited $${amount.toFixed(2)} (net $${net.toFixed(2)} after 1% fee)`,
        timestamp: Date.now(),
        fee,
      },
    ],
  };

  await col.updateOne({ wallet: normalized }, { $set: updated });
  return {
    account: { ...acct, ...updated },
    gross: amount,
    fee,
    net,
  };
}

export async function withdraw(
  wallet: string,
  amount: number,
): Promise<{ account: PilotAccount }> {
  const normalized = normalizeAddress(wallet);
  if (!normalized) throw new Error("Invalid wallet address");

  const col = await getCollection("pilot_accounts");
  const doc = await col.findOne({ wallet: normalized });
  if (!doc) throw new Error("Account not found");

  const acct = doc as unknown as PilotAccount;
  if (acct.cash < amount) throw new Error("Insufficient balance");

  const updated: Partial<PilotAccount> = {
    cash: acct.cash - amount,
    initialBankroll: acct.initialBankroll - amount,
    withdrawn: acct.withdrawn + amount,
    updatedAt: Date.now(),
  };

  await col.updateOne({ wallet: normalized }, { $set: updated });
  return { account: { ...acct, ...updated } };
}

export async function saveRules(
  wallet: string,
  rules: PilotAccount["rules"],
): Promise<{ account: PilotAccount }> {
  const normalized = normalizeAddress(wallet);
  if (!normalized) throw new Error("Invalid wallet address");

  const col = await getCollection("pilot_accounts");
  const doc = await col.findOne({ wallet: normalized });
  if (!doc) throw new Error("Account not found");

  const updated = { rules, updatedAt: Date.now() };
  await col.updateOne({ wallet: normalized }, { $set: updated });
  return { account: { ...doc, ...updated } as unknown as PilotAccount };
}

export async function startSession(
  wallet: string,
): Promise<{ account: PilotAccount }> {
  const normalized = normalizeAddress(wallet);
  if (!normalized) throw new Error("Invalid wallet address");

  const col = await getCollection("pilot_accounts");
  const doc = await col.findOne({ wallet: normalized });
  if (!doc) throw new Error("Account not found");

  const acct = doc as unknown as PilotAccount;
  const sessionId = `zs_${crypto.randomUUID().slice(0, 8)}`;
  const updated = {
    session: { running: true, id: sessionId, startedAt: Date.now(), stoppedAt: null },
    updatedAt: Date.now(),
    events: [
      ...acct.events,
      {
        id: crypto.randomUUID(),
        type: "session",
        message: `Session ${sessionId} started`,
        timestamp: Date.now(),
      },
    ],
  };

  await col.updateOne({ wallet: normalized }, { $set: updated });
  return { account: { ...acct, ...updated } };
}

export async function stopSession(
  wallet: string,
): Promise<{ account: PilotAccount }> {
  const normalized = normalizeAddress(wallet);
  if (!normalized) throw new Error("Invalid wallet address");

  const col = await getCollection("pilot_accounts");
  const doc = await col.findOne({ wallet: normalized });
  if (!doc) throw new Error("Account not found");

  const acct = doc as unknown as PilotAccount;
  const updated = {
    session: {
      running: false,
      id: acct.session.id,
      startedAt: acct.session.startedAt,
      stoppedAt: Date.now(),
    },
    updatedAt: Date.now(),
  };

  await col.updateOne({ wallet: normalized }, { $set: updated });
  return { account: { ...acct, ...updated } };
}

export interface SafeAccount extends Omit<PilotAccount, "clobApiSecret" | "clobApiPassphrase"> {
  clobApiKeyHint: string | null;
}

export function sanitizeAccount(acct: PilotAccount | null): SafeAccount | null {
  if (!acct) return null;
  const { clobApiSecret, clobApiPassphrase, clobApiKey, ...rest } = acct as PilotAccount & Record<string, unknown>;
  void clobApiSecret;
  void clobApiPassphrase;
  return {
    ...rest,
    clobApiKeyHint: typeof clobApiKey === "string" ? clobApiKey.slice(0, 8) : null,
  } as unknown as SafeAccount;
}
