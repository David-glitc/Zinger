"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, BookOpen, Coins, SlidersHorizontal, X } from "lucide-react";

const ONBOARD_DISMISSED_KEY = "zg_onboard_dismissed";

export function FirstRunBanner({
  visible,
  cash,
  mode,
}: {
  visible: boolean;
  cash: number;
  mode: string;
}) {
  const [dismissed, setDismissed] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(ONBOARD_DISMISSED_KEY);
    setDismissed(stored === "true");
  }, []);

  function dismiss() {
    localStorage.setItem(ONBOARD_DISMISSED_KEY, "true");
    setDismissed(true);
  }

  if (!visible || dismissed) return null;

  const canFund = cash < 50;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="overflow-hidden"
      >
        <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-display text-[15px] font-medium tracking-tight text-foreground">
                Welcome to Zinger
              </p>
              <p className="mt-1 font-sans text-[12px] leading-relaxed text-muted-foreground">
                {canFund
                  ? `You're in ${mode} mode. Add paper credit to get started — it takes 30 seconds.`
                  : "You're funded. Set your risk bands, then start a session to hunt entries."}
              </p>
            </div>
            <button onClick={dismiss} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {canFund ? (
              <button
                onClick={() => { router.push("/app/fund"); dismiss(); }}
                className="zg-volt-btn inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-white"
              >
                <Coins className="size-3.5" />
                <span className="font-mono text-[11px] uppercase tracking-[0.12em]">Add paper credit</span>
                <ArrowRight className="size-3.5" />
              </button>
            ) : null}
            <button
              onClick={() => { router.push("/app/settings"); dismiss(); }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted/50"
            >
              <SlidersHorizontal className="size-3.5" />
              Set bands
            </button>
            {!canFund ? (
              <button
                onClick={() => { router.push("/app/book"); dismiss(); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted/50"
              >
                <BookOpen className="size-3.5" />
                Open book
              </button>
            ) : null}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
