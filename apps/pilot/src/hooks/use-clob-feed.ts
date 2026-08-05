"use client";

import { useEffect, useRef, useState } from "react";

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

export interface ClobFeedState {
  lastPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  connected: boolean;
  updatedAt: number | null;
}

const INITIAL_STATE: ClobFeedState = {
  lastPrice: null,
  bestBid: null,
  bestAsk: null,
  connected: false,
  updatedAt: null,
};

function backoff(attempts: number) {
  return Math.min(15_000, 800 * 2 ** Math.min(attempts, 5));
}

export function useClobFeed(conditionId?: string | null, tokenId?: string | null) {
  const [state, setState] = useState<ClobFeedState>(INITIAL_STATE);
  const tokenRef = useRef(tokenId);
  tokenRef.current = tokenId;

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
          for (const e of events) {
            const m = tokenRef.current;
            const market = e?.market != null ? String(e.market) : "";
            if (m && market && market !== m) continue;
            const last = e?.last_trade_price != null ? Number(e.last_trade_price) : null;
            const bid = e?.best_bid != null ? Number(e.best_bid) : null;
            const ask = e?.best_ask != null ? Number(e.best_ask) : null;
            if (last == null && bid == null && ask == null) continue;
            setState((s) => ({
              lastPrice: last ?? s.lastPrice,
              bestBid: bid ?? s.bestBid,
              bestAsk: ask ?? s.bestAsk,
              connected: s.connected,
              updatedAt: Date.now(),
            }));
          }
        } catch {
          /* non-JSON keepalive */
        }
      };

      ws.onclose = () => {
        setState((s) => ({
          lastPrice: null,
          bestBid: null,
          bestAsk: null,
          connected: false,
          updatedAt: s.updatedAt,
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
