"use client";

import { useEffect, useRef, useState } from "react";
import type { PricePoint } from "@/lib/api";

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

export interface ClobTickFeedState {
  ticks: PricePoint[];
  lastPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  connected: boolean;
  updatedAt: number | null;
}

const INITIAL_STATE: ClobTickFeedState = {
  ticks: [],
  lastPrice: null,
  bestBid: null,
  bestAsk: null,
  connected: false,
  updatedAt: null,
};

function backoff(attempts: number) {
  return Math.min(15_000, 800 * 2 ** Math.min(attempts, 5));
}

function eventTimeToSec(e: Record<string, unknown>): number | null {
  const raw = e?.time ?? e?.timestamp;
  if (raw == null) return null;
  const str = String(raw);
  if (!str) return null;
  if (/^\d{10}$/.test(str)) return Number(str);
  if (/^\d{13}$/.test(str)) return Math.floor(Number(str) / 1000);
  const ms = Date.parse(str);
  if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  return null;
}

/**
 * CLOB WS feed that accumulates trade ticks into a rolling series,
 * so lightweight-charts can stream live via series.update().
 */
export function useClobTickFeed(
  conditionId?: string | null,
  tokenId?: string | null,
  maxPoints = 720,
) {
  const [state, setState] = useState<ClobTickFeedState>(INITIAL_STATE);
  const tokenRef = useRef(tokenId);
  tokenRef.current = tokenId;
  const maxRef = useRef(maxPoints);
  maxRef.current = maxPoints;

  useEffect(() => {
    if (!conditionId) {
      setState(INITIAL_STATE);
      return;
    }

    setState(INITIAL_STATE);

    let ws: WebSocket | null = null;
    let disposed = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(`${WS_URL}/${conditionId}`);
      } catch {
        scheduleRetry();
        return;
      }

      ws.onopen = () => {
        attempts = 0;
        setState((s) => ({ ...s, connected: true }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          const events: Array<Record<string, unknown>> = Array.isArray(msg?.events)
            ? msg.events
            : [];
          if (!events.length) return;
          const m = tokenRef.current;
          let last: number | null = null;
          let bid: number | null = null;
          let ask: number | null = null;
          let lastTs: number | null = null;
          const newTicks: PricePoint[] = [];
          for (const e of events) {
            const market = e?.market != null ? String(e.market) : "";
            if (m && market && market !== m) continue;
            const ts = eventTimeToSec(e) ?? Math.floor(Date.now() / 1000);
            const p = e?.last_trade_price != null ? Number(e.last_trade_price) : null;
            if (p != null && Number.isFinite(p) && p > 0) {
              newTicks.push({ t: ts, p });
              last = p;
              lastTs = ts;
            }
            const b = e?.best_bid != null ? Number(e.best_bid) : null;
            const a = e?.best_ask != null ? Number(e.best_ask) : null;
            if (b != null && Number.isFinite(b)) bid = b;
            if (a != null && Number.isFinite(a)) ask = a;
          }
          if (last == null && bid == null && ask == null) return;

          setState((s) => {
            const base = s.ticks;
            let ticks = base;
            if (newTicks.length) {
              ticks = [...base, ...newTicks];
              const max = maxRef.current;
              if (ticks.length > max) ticks = ticks.slice(-max);
            }
            return {
              ticks,
              lastPrice: last ?? s.lastPrice,
              bestBid: bid ?? s.bestBid,
              bestAsk: ask ?? s.bestAsk,
              connected: s.connected,
              updatedAt: lastTs != null ? lastTs * 1000 : Date.now(),
            };
          });
        } catch {
          /* non-JSON keepalive */
        }
      };

      ws.onclose = () => {
        setState((s) => ({
          ...s,
          lastPrice: null,
          bestBid: null,
          bestAsk: null,
          connected: false,
        }));
        if (disposed) return;
        scheduleRetry();
      };

      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    };

    const scheduleRetry = () => {
      attempts += 1;
      retryTimer = setTimeout(connect, backoff(attempts));
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [conditionId, tokenId]);

  return state;
}
