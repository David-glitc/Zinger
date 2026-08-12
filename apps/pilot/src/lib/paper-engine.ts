import crypto from "crypto";
import { getCollection } from "./mongo";
import type { PilotAccount, PaperPosition, PaperTrade } from "./pilot-db";

const TP_DELTA = 0.06;
const SL_DELTA = 0.05;

interface Signal {
  direction?: string;
  confidence?: number;
  score?: number;
  action?: string;
  asset?: string;
}

interface Market {
  slug?: string;
  symbol?: string;
  duration?: string;
  prices?: Record<string, unknown>;
}

export interface PaperSnapshot {
  equity: number;
  cash: number;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number | null;
  wins: number;
  losses: number;
  feesPaid: number;
  openCount: number;
  open: PaperPosition[];
  trades: PaperTrade[];
  events: PilotAccount["events"];
  status: string;
}

type Price = { up: number; down: number; slug: string };

function normalizeDurations(d: PilotAccount["rules"]["durations"]): string[] {
  if (Array.isArray(d)) return d.filter(Boolean) as string[];
  return String(d ?? "5m")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeAssets(a: PilotAccount["rules"]["assets"]): string[] {
  if (Array.isArray(a)) return a.filter(Boolean) as string[];
  return String(a ?? "BTC,ETH")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildPriceMap(markets: Market[]): Map<string, Price> {
  const map = new Map<string, Price>();
  for (const m of markets) {
    const prices = (m.prices ?? {}) as Record<string, unknown>;
    const up = Number(prices.up ?? 0);
    const down = Number(prices.down ?? (1 - up));
    if (!Number.isFinite(up) || up <= 0) continue;
    const slug = String(m.slug || "");
    const symbol = String(m.symbol || "").toLowerCase();
    const duration = String(m.duration || "");
    const price: Price = { up, down, slug };
    if (slug) map.set(slug, price);
    if (symbol && duration) map.set(`${symbol}:${duration}`, price);
  }
  return map;
}

export function buildPaperSnapshot(account: PilotAccount | null): PaperSnapshot {
  const positions = Array.isArray(account?.positions) ? account.positions : [];
  const trades = Array.isArray(account?.trades) ? account.trades : [];
  const cash = Number(account?.cash ?? 0);
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl < 0).length;
  const realizedPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const unrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);

  return {
    equity: cash + unrealizedPnl,
    cash,
    realizedPnl,
    unrealizedPnl,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
    wins,
    losses,
    feesPaid: Number(account?.platformFeesPaid ?? 0),
    openCount: positions.length,
    open: positions,
    trades,
    events: account?.events ?? [],
    status: account?.session?.running ? "running" : "idle",
  };
}

export interface PaperCycleResult {
  account: PilotAccount;
  opened: PaperPosition[];
  closed: PaperTrade[];
}

export function runPaperCycle(
  account: PilotAccount,
  signals: Record<string, Signal> | null,
  markets: Market[],
  opts: { closeAll?: boolean } = {},
): PaperCycleResult {
  const positions: PaperPosition[] = Array.isArray(account.positions)
    ? [...account.positions]
    : [];
  const trades: PaperTrade[] = Array.isArray(account.trades) ? [...account.trades] : [];
  const events = Array.isArray(account.events) ? [...account.events] : [];
  let cash = Number(account.cash ?? 0);
  const opened: PaperPosition[] = [];
  const closed: PaperTrade[] = [];

  const rules = account.rules;
  const pmap = buildPriceMap(markets);
  const now = Date.now();

  const remaining: PaperPosition[] = [];
  for (const pos of positions) {
    const m = pmap.get(pos.slug) ?? pmap.get(`${pos.asset.toLowerCase()}:${pos.duration}`);
    const mark = m
      ? pos.outcome === "DOWN"
        ? 1 - m.up
        : m.up
      : pos.mark;
    const unrealizedPnl = (mark - pos.entry) * pos.shares;
    const updated: PaperPosition = {
      ...pos,
      mark,
      unrealizedPnl,
      pnlPct: pos.entry > 0 ? ((mark - pos.entry) / pos.entry) * 100 : 0,
    };

    let exitReason: string | null = null;
    let exitPrice = mark;

    if (opts.closeAll) {
      exitReason = "session-end";
    } else {
      if (mark >= pos.tp) {
        exitReason = "take-profit";
        exitPrice = pos.tp;
      } else if (mark <= pos.sl) {
        exitReason = "stop-loss";
        exitPrice = pos.sl;
      } else {
        const sig = signals?.[pos.asset.toLowerCase()];
        if (
          sig &&
          sig.direction &&
          sig.confidence != null &&
          sig.confidence >= Number(rules.minConfidence ?? 0.38) &&
          sig.direction.toLowerCase() !== pos.outcome.toLowerCase()
        ) {
          exitReason = "signal-flip";
        }
      }
    }

    if (exitReason) {
      const pnl = (exitPrice - pos.entry) * pos.shares;
      const trade: PaperTrade = {
        id: crypto.randomUUID(),
        asset: pos.asset,
        outcome: pos.outcome,
        duration: pos.duration,
        slug: pos.slug,
        entry: pos.entry,
        exit: exitPrice,
        shares: pos.shares,
        sizeUsd: pos.sizeUsd,
        pnl,
        pnlPct: pos.entry > 0 ? ((exitPrice - pos.entry) / pos.entry) * 100 : 0,
        reason: exitReason,
        openedAt: pos.openedAt,
        closedAt: now,
      };
      closed.push(trade);
      trades.push(trade);
      cash += pos.sizeUsd + pnl;
      events.push({
        id: crypto.randomUUID(),
        type: "close",
        message: `${pos.asset} ${pos.outcome} ${pos.duration} closed @ ${exitPrice.toFixed(3)} (${exitReason})`,
        pnl,
        timestamp: now,
      });
    } else {
      remaining.push(updated);
    }
  }

  if (!opts.closeAll) {
    const durations = normalizeDurations(rules.durations);
    const assets = normalizeAssets(rules.assets);
    const minConf = Number(rules.minConfidence ?? 0.38);
    const minPrice = Number(rules.minPrice ?? 0.42);
    const maxPrice = Number(rules.maxPrice ?? 0.68);
    const maxPct = Number(rules.maxPositionPct ?? 10) / 100;

    for (const asset of assets) {
      const key = asset.toLowerCase();
      const sig = signals?.[key];
      if (!sig || !sig.direction || sig.confidence == null || sig.confidence < minConf) continue;
      const dir = sig.direction.toUpperCase();
      if (dir !== "UP" && dir !== "DOWN") continue;

      for (const dur of durations) {
        const exists = remaining.some(
          (p) => p.asset.toLowerCase() === key && p.duration === dur,
        );
        if (exists) continue;

        const m = pmap.get(`${key}:${dur}`) ?? pmap.get(`${key}:${dur.replace(/ /g, "")}`);
        if (!m) continue;

        const price = dir === "UP" ? m.up : 1 - m.up;
        if (!Number.isFinite(price) || price < minPrice || price > maxPrice) continue;

        const size = Math.min(cash * maxPct, cash);
        if (size < 1) continue;
        const shares = size / price;

        const pos: PaperPosition = {
          id: crypto.randomUUID(),
          asset: asset.toUpperCase(),
          outcome: dir,
          duration: dur,
          slug: m.slug || `${key}:${dur}`,
          entry: price,
          mark: price,
          shares,
          sizeUsd: size,
          confidence: sig.confidence,
          tp: Math.min(price + TP_DELTA, 0.95),
          sl: Math.max(price - SL_DELTA, 0.05),
          openedAt: now,
          unrealizedPnl: 0,
          pnlPct: 0,
        };

        remaining.push(pos);
        opened.push(pos);
        cash -= size;
        events.push({
          id: crypto.randomUUID(),
          type: "open",
          message: `${pos.asset} ${dir} ${dur} @ ${price.toFixed(3)} (conf ${(sig.confidence * 100).toFixed(0)}%)`,
          timestamp: now,
        });
        if (cash < 1) break;
      }
    }
  }

  for (const pos of remaining) {
    const m = pmap.get(pos.slug) ?? pmap.get(`${pos.asset.toLowerCase()}:${pos.duration}`);
    if (m && m.up != null) {
      const mark = pos.outcome === "DOWN" ? 1 - m.up : m.up;
      pos.mark = mark;
      pos.unrealizedPnl = (mark - pos.entry) * pos.shares;
      pos.pnlPct = pos.entry > 0 ? ((mark - pos.entry) / pos.entry) * 100 : 0;
    }
  }

  const updated: PilotAccount = {
    ...account,
    positions: remaining,
    trades,
    cash,
    events,
    updatedAt: now,
  };

  return { account: updated, opened, closed };
}

export async function persistPaperCycle(wallet: string, cycle: PaperCycleResult) {
  const col = await getCollection("pilot_accounts");
  await col.updateOne(
    { wallet },
    {
      $set: {
        positions: cycle.account.positions,
        trades: cycle.account.trades,
        cash: cycle.account.cash,
        events: cycle.account.events,
        updatedAt: cycle.account.updatedAt,
      },
    },
  );
}

const CORE_API = process.env.NEXT_PUBLIC_API_URL || "https://zinger.kierkegaard.space/api/v1";

export async function fetchCoreSignals(): Promise<{
  signals: Record<string, Signal> | null;
  markets: Market[];
}> {
  try {
    const res = await fetch(`${CORE_API}/pilot?address=public`, { cache: "no-store" });
    if (!res.ok) return { signals: null, markets: [] };
    const data = (await res.json()) as Record<string, unknown>;
    return {
      signals: (data.signals as Record<string, Signal>) ?? null,
      markets: (data.markets as Market[]) ?? [],
    };
  } catch {
    return { signals: null, markets: [] };
  }
}
