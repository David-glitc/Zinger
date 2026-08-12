"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePilotSnapshot } from "@/hooks/use-pilot";
import { useWalletAuth } from "@/hooks/use-wallet-auth";
import type { PilotSnapshot } from "@/lib/api";

type EventLike = { id?: string; type?: string; message?: string; pnl?: number };

function signalSignature(signals: PilotSnapshot["signals"]) {
  if (!signals) return null;
  const part = (a: unknown) => {
    const s = a as { direction?: string; confidence?: number } | undefined;
    return s?.direction ? `${s.direction}${Math.floor((s.confidence ?? 0) * 20) / 20}` : "";
  };
  return `b:${part(signals.btc)}|e:${part(signals.eth)}`;
}

export function NotificationsMonitor() {
  const { address, isReady } = useWalletAuth();
  const snap = usePilotSnapshot(address, isReady);

  const bootstrapped = useRef(false);
  const seenEvents = useRef<Set<string>>(new Set());
  const lastSig = useRef<string | null>(null);
  const lastNotified = useRef<string | null>(null);

  useEffect(() => {
    if (!snap.data || !isReady) return;
    const events = (snap.data.paper?.events ?? []) as EventLike[];

    if (!bootstrapped.current) {
      for (const e of events) if (e.id) seenEvents.current.add(e.id);
      bootstrapped.current = true;
      return;
    }

    for (const e of events) {
      if (!e.id || seenEvents.current.has(e.id)) continue;
      seenEvents.current.add(e.id);
      const msg = e.message || "Update";
      if (e.type === "close") {
        const pnl = Number(e.pnl ?? 0);
        const body = `${msg} · ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`;
        if (pnl >= 0) toast.success(body);
        else toast.error(body);
      } else if (e.type === "open") {
        toast.info(msg);
      } else {
        toast.message(msg);
      }
    }
  }, [snap.data, isReady]);

  useEffect(() => {
    if (!snap.data?.signals || !isReady) return;
    const sig = signalSignature(snap.data.signals);
    if (!sig) return;
    if (lastSig.current !== null && sig !== lastSig.current && sig !== lastNotified.current) {
      const s = snap.data.signals;
      const pick = s.btc && Number(s.btc.confidence ?? 0) >= 0.7 ? s.btc : s.eth;
      if (pick && pick.direction && Number(pick.confidence ?? 0) >= 0.7) {
        toast.info(`Signal · ${pick.asset || "MARKET"} ${pick.direction.toUpperCase()} ${Math.round(Number(pick.confidence) * 100)}%`, {
          description: "High-confidence entry signal",
        });
        lastNotified.current = sig;
      }
    }
    lastSig.current = sig;
  }, [snap.data?.signals, isReady]);

  return null;
}
