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

/**
 * Live market data straight from the Polymarket CLOB websocket.
 * Subscribes to the `market/{conditionId}` channel and surfaces the
 * last trade price / best bid / best ask for a specific token id.
 * Auto-reconnects with capped exponential backoff.
 */
export function useClobFeed(conditionId?: string | null, tokenId?: string | null) {
  const [state, setState] = useState<ClobFeedState>({
    lastPrice: null,
    bestBid: null,
    bestAsk: null,
    connected: false,
    updatedAt: null,
  });
  const tokenRef = useRef(tokenId);
  tokenRef.current = tokenId;

  useEffect(() => {
    if (!conditionId) return;

    let ws: WebSocket | null = null;
    let disposed = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(`${WS_URL}/${conditionId}`);
      } catch {
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
        setState((s) => ({ ...s, connected: false }));
        if (disposed) return;
        attempts += 1;
        const delay = Math.min(15_000, 800 * 2 ** Math.min(attempts, 5));
        retryTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
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
  }, [conditionId]);

  return state;
}
