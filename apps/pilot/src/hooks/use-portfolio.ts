"use client";

import { useMemo } from "react";
import type { Mode, PilotSnapshot } from "@/lib/api";

interface LooseLiveAcct {
  cash?: { clob?: number; lastSyncAt?: number | null };
  totals?: { pmRealizedSum?: number; closedWins?: number; closedLosses?: number };
  closed?: Array<Record<string, unknown>>;
}

/** Derives paper/live portfolio numbers shared by every /app page. */
export function usePortfolio(
  snap: PilotSnapshot | null | undefined,
  mode: Mode,
  liveAcctOverride: unknown = null,
) {
  return useMemo(() => {
    const paper = snap?.paper;
    const accounting = snap?.accounting;
    const botOpens = (snap?.opens || []) as Array<Record<string, unknown>>;
    const liveAcct =
      (liveAcctOverride as LooseLiveAcct | null | undefined) ||
      (snap?.liveAccount as LooseLiveAcct | null | undefined) ||
      null;

    const paperOpens = Array.isArray(paper?.open)
      ? (paper.open as Array<Record<string, unknown>>)
      : Object.values((paper?.open || {}) as Record<string, Record<string, unknown>>);

    const liveOpens = botOpens.filter((p) => !p.mode || p.mode === "live");
    const paperBotOpens = botOpens.filter((p) => !p.mode || p.mode === "paper");

    const opens =
      mode === "live"
        ? liveOpens
        : paperOpens.length
          ? paperOpens
          : paperBotOpens;

    const events = (paper?.events || snap?.account?.events || []) as Array<Record<string, unknown>>;

    const liveClosed = (liveAcct?.closed || []) as Array<Record<string, unknown>>;
    const paperTrades = (paper?.trades || []) as Array<Record<string, unknown>>;

    const trades: Array<Record<string, unknown>> =
      mode === "live"
        ? liveClosed.map((c) => ({
            ...c,
            symbol: String(c.slug || "").includes("eth") ? "ETH" : "BTC",
            outcome: String(c.outcome || "").toLowerCase(),
            pnl: c.realizedPnl,
            entryPrice: c.avgPrice,
            exitPrice: Number(c.curPrice) === 1 || Number(c.realizedPnl) > 0 ? 1 : 0,
            shares: c.shares,
            size: c.costUsd,
            exitReason: "settle",
            closed: true,
            title: c.title,
          }))
        : paperTrades;

    const liveCash = Number(liveAcct?.cash?.clob ?? 0);
    const liveRealized = Number(liveAcct?.totals?.pmRealizedSum ?? 0);
    const liveWins = Number(liveAcct?.totals?.closedWins ?? 0);
    const liveLosses = Number(liveAcct?.totals?.closedLosses ?? 0);

    const equity = Number(
      mode === "live" ? liveCash : accounting?.equity ?? paper?.equity ?? snap?.account?.cash ?? 0,
    );
    const cash = Number(
      mode === "live" ? liveCash : accounting?.cash ?? paper?.cash ?? snap?.account?.cash ?? 0,
    );
    const realized = Number(
      mode === "live" ? liveRealized : accounting?.realizedPnl ?? paper?.realizedPnl ?? 0,
    );
    const unrealized = Number(
      mode === "live"
        ? liveOpens.reduce((s, p) => s + Number(p.pnl || 0), 0)
        : accounting?.unrealizedPnl ?? paper?.unrealizedPnl ?? 0,
    );
    const winRate =
      mode === "live"
        ? liveWins + liveLosses > 0
          ? liveWins / (liveWins + liveLosses)
          : null
        : accounting?.winRate ?? paper?.winRate ?? null;
    const wins = mode === "live" ? liveWins : accounting?.wins ?? paper?.wins ?? 0;
    const losses = mode === "live" ? liveLosses : accounting?.losses ?? paper?.losses ?? 0;

    return {
      opens,
      events,
      trades,
      equity,
      cash,
      realized,
      unrealized,
      winRate,
      wins,
      losses,
      liveCash,
      liveOpens,
    };
  }, [snap, mode, liveAcctOverride]);
}
