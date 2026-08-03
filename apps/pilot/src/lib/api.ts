export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "https://zinger.kierkegaard.space/api/v1";

export type Mode = "paper" | "live";

export type Rules = {
  maxPositionPct: number;
  minConfidence: number;
  minPrice: number;
  maxPrice: number;
  assets: string[] | string;
  durations?: string[] | string;
  minTpUsd: number;
};

export type Account = {
  wallet: string;
  accountId: string;
  chainId: number;
  mode: Mode;
  cash: number;
  initialBankroll: number;
  platformFeesPaid: number;
  depositedGross: number;
  withdrawn: number;
  rules: Rules;
  session: {
    running: boolean;
    id?: string | null;
    startedAt?: number | null;
    stoppedAt?: number | null;
  };
  events?: Array<{
    id: string;
    type: string;
    message: string;
    timestamp: number;
    fee?: number;
  }>;
  platformFeeRate: number;
};

export type LiveClosed = {
  key?: string;
  slug?: string | null;
  title?: string | null;
  outcome?: string | null;
  shares?: number;
  avgPrice?: number;
  costUsd?: number;
  amountWonUsd?: number;
  realizedPnl?: number;
  realizedPct?: number | null;
  timestamp?: number | null;
};

export type LiveAccount = {
  updatedAt?: number;
  wallet?: string | null;
  cash?: {
    clob?: number;
    lastSyncAt?: number | null;
    sessionStartCash?: number | null;
    lifetimeBaseline?: number | null;
    sessionCashPnl?: number | null;
  };
  reconcile?: Record<string, unknown> | null;
  closed?: LiveClosed[];
  recentEvents?: Array<Record<string, unknown>>;
  mismatches?: Array<Record<string, unknown>>;
  traces?: Array<Record<string, unknown>>;
  totals?: {
    pmRealizedSum?: number;
    closedWins?: number;
    closedLosses?: number;
  };
};

export type PilotSnapshot = {
  timestamp?: number;
  paper?: {
    equity?: number;
    cash?: number;
    realizedPnl?: number;
    unrealizedPnl?: number;
    feesPaid?: number;
    winRate?: number | null;
    wins?: number;
    losses?: number;
    open?: Array<Record<string, unknown>>;
    trades?: Array<Record<string, unknown>>;
    events?: Array<Record<string, unknown>>;
    status?: string;
  };
  botPaper?: Record<string, unknown>;
  signals?: {
    btc?: { direction?: string; confidence?: number; score?: number; action?: string; asset?: string };
    eth?: { direction?: string; confidence?: number; score?: number; action?: string; asset?: string };
  };
  account?: Account | null;
  session?: Account["session"];
  accounting?: {
    equity: number;
    cash: number;
    realizedPnl: number;
    unrealizedPnl: number;
    clobFees: number;
    platformFees: number;
    winRate: number | null;
    wins: number;
    losses: number;
    openCount: number;
    depositedGross: number;
    withdrawn: number;
  };
  platformFeeRate?: number;
  feed?: { ageMs?: number; botRunning?: boolean };
  liveTrading?: {
    botRunning?: boolean;
    mode?: Mode | null;
    liveReady?: boolean;
    liveAllowed?: boolean;
    writeEgress?: string;
    note?: string;
  };
  liveAccount?: LiveAccount | null;
  sessionLedger?: Record<string, unknown> | null;
  markets?: Array<Record<string, unknown>>;
  opens?: Array<Record<string, unknown>>;
  cashAudit?: {
    ok?: boolean;
    issues?: string[];
    notes?: string[];
    equity?: number;
    cash?: number;
    netPnl?: number;
    pmRealizedSum?: number;
    pnlSource?: string;
  } | null;
  narrative?: {
    headline?: string;
    lines?: Array<{ tone?: string; text?: string }>;
    paragraph?: string;
  } | null;
  edgeGate?: {
    n?: number;
    wins?: number;
    losses?: number;
    wr?: number;
    avgWin?: number;
    avgLoss?: number;
    expectancy?: number;
    breakEvenWr?: number;
    kelly?: number;
    totalPnl?: number;
    lookback?: number;
    mode?: string;
    minTrades?: number;
    minExpectancy?: number;
    edgeOk?: boolean;
    arbOnly?: boolean;
    directionalAllowed?: boolean;
    liveAllowed?: boolean;
    reason?: string;
  } | null;
  liveScoreCards?: Array<{
    id?: string;
    kind?: string;
    title?: string;
    value?: string;
    detail?: string;
    tone?: string;
  }>;
  accountBook?: {
    stats?: {
      best?: Array<Record<string, unknown>>;
      totalPnl?: number;
      winRate?: number | string;
      pmRealizedSum?: number;
    };
    curve?: { updatedAt?: number; points?: Array<{ t?: number; equity?: number }> };
    snapshot?: { mime?: string; dataUrl?: string } | null;
  } | null;
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText || "request failed");
  }
  return data as T;
}

export function getPilot(address?: string | null) {
  const q = address ? `?address=${encodeURIComponent(address)}` : "";
  return jsonFetch<PilotSnapshot>(`/pilot${q}`);
}

export function connectWalletApi(address: string, chainId: number) {
  return jsonFetch<{ ok: boolean; account: Account }>("/pilot/connect", {
    method: "POST",
    body: JSON.stringify({ address, chainId }),
  });
}

export function ensureAccount(address: string, chainId: number, mode?: Mode) {
  return jsonFetch<{ ok: boolean; account: Account }>("/pilot/account", {
    method: "POST",
    body: JSON.stringify({ address, chainId, mode }),
  });
}

export function deposit(address: string, amount: number) {
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
}

export function withdraw(address: string, amount: number) {
  return jsonFetch<{ ok: boolean; account: Account }>("/pilot/withdraw", {
    method: "POST",
    body: JSON.stringify({ address, amount }),
  });
}

export function saveRulesApi(address: string, rules: Rules) {
  return jsonFetch<{ ok: boolean; account: Account }>("/pilot/rules", {
    method: "POST",
    body: JSON.stringify({ address, rules }),
  });
}

export function startSession(address: string) {
  return jsonFetch<{ ok: boolean; account: Account }>("/pilot/session/start", {
    method: "POST",
    body: JSON.stringify({ address }),
  });
}

export function stopSession(address: string) {
  return jsonFetch<{ ok: boolean; account: Account }>("/pilot/session/stop", {
    method: "POST",
    body: JSON.stringify({ address }),
  });
}

export type DepositInfo = {
  receiveAddress: string;
  depositWallet: string | null;
  depositWalletBalance: number;
  usdcAddress: string;
  pusdAddress: string;
  chainId: number;
  network: string;
  scanActive: boolean;
};

export type UsdcDepositResult = {
  ok: boolean;
  account: Account;
  usdcAmount: number;
  pUsdAmount?: number;
  net: number;
  fee: number;
  txHash: string;
  swapTx?: string;
  depositTx?: string;
};

export function getDepositInfo() {
  return jsonFetch<DepositInfo>("/pilot/deposit-info");
}

export function confirmUsdcDeposit(address: string, txHash: string) {
  return jsonFetch<UsdcDepositResult>("/pilot/deposit-usdc", {
    method: "POST",
    body: JSON.stringify({ address, txHash }),
  });
}

export function getDeposits(address: string) {
  return jsonFetch<{ deposits: Array<Record<string, unknown>> }>(
    `/pilot/deposits?address=${encodeURIComponent(address)}`,
  );
}

export function money(n: number | null | undefined, d = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return (
    "$" +
    x.toLocaleString(undefined, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    })
  );
}

export function shortAddr(a: string) {
  if (!a || a.length < 10) return a || "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/* ————————————————————————————————————————————————————————————————
   Polymarket market charts (via the Vercel CLOB / Gamma proxy)
   ———————————————————————————————————————————————————————————————— */

export type PricePoint = { t: number; p: number };

export type MarketDetail = {
  slug: string;
  marketId: string;
  conditionId: string;
  outcomes: string[];
  clobTokenIds: string[];
  question: string;
  volume: number;
  liquidity: number;
  startTime: number | null;
  endTime: number | null;
  acceptingOrders: boolean;
};

async function proxyFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `proxy ${res.status}`);
  }
  return data as T;
}

/** CLOB price history for a single outcome token. */
export function getPriceHistory(
  tokenId: string,
  interval = "1m",
  fidelity = 10,
) {
  return proxyFetch<{ history: PricePoint[] }>(
    `/api/proxy/clob/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}&fidelity=${fidelity}`,
  );
}

/** Resolve an event slug to market id / condition / clob token ids. */
export async function getMarketDetail(slug: string): Promise<MarketDetail> {
  const data = await proxyFetch<Record<string, unknown>>(
    `/api/proxy/gamma/events/slug/${encodeURIComponent(slug)}`,
  );
  const rawMarket = Array.isArray(data?.markets)
    ? ((data.markets as Array<Record<string, unknown>>)[0] ?? {})
    : (data as Record<string, unknown>);

  const outcomes = (() => {
    try {
      const parsed = JSON.parse(String(rawMarket.outcomes || "[]"));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return Array.isArray(rawMarket.outcomes) ? rawMarket.outcomes.map(String) : [];
    }
  })();

  const tokenIds = (() => {
    try {
      const parsed = JSON.parse(String(rawMarket.clobTokenIds || "[]"));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  })();

  const toSec = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? (n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)) : null;
  };

  return {
    slug,
    marketId: String(rawMarket.id || data?.id || ""),
    conditionId: String(rawMarket.conditionId || ""),
    outcomes,
    clobTokenIds: tokenIds,
    question: String(rawMarket.question || rawMarket.title || slug),
    volume: Number(rawMarket.volumeNum ?? rawMarket.volume ?? 0) || 0,
    liquidity: Number(rawMarket.liquidityNum ?? rawMarket.liquidity ?? 0) || 0,
    startTime: toSec(rawMarket.startDateIso ?? rawMarket.startTime) ?? toSec(data?.startDateIso),
    endTime: toSec(rawMarket.endDateIso ?? rawMarket.endTime) ?? toSec(data?.endDateIso),
    acceptingOrders: rawMarket.acceptingOrders !== false,
  };
}

/** Pick a CLOB interval/fidelity for a market duration. */
export function chartResolution(duration: string | null | undefined) {
  const d = String(duration || "").toLowerCase();
  if (d.includes("h") || d.includes("d")) {
    const hours = Number(d.replace(/\D/g, ""));
    if (d.includes("d") || hours >= 4) return { interval: "1h", fidelity: 1 };
    return { interval: "1h", fidelity: 1 };
  }
  return { interval: "1m", fidelity: 10 };
}
