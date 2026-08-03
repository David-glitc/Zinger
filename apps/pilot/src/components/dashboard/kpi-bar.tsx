"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/animations/count-up";

export interface KpiItem {
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  tone?: "up" | "dn" | "neutral";
  sparklineData?: { value: number }[];
}

export function KpiBar({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/50 bg-border/30 sm:grid-cols-3 md:grid-cols-5">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.06, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn(
            "relative flex flex-col gap-0.5 bg-card px-3 py-2.5",
            "hover:bg-accent/50 transition-colors duration-200",
          )}
        >
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {item.label}
          </span>
          <span
            className={cn(
              "font-mono text-sm font-semibold tracking-tight tabular-nums",
              item.tone === "up" && "text-[var(--success)]",
              item.tone === "dn" && "text-[var(--error)]",
            )}
          >
            <CountUp
              value={typeof item.value === "number" ? item.value : 0}
              decimals={2}
              prefix={typeof item.value === "number" && item.value > 0 ? "" : ""}
            />
          </span>
          {item.sub ? (
            <span className="font-mono text-[9px] text-muted-foreground/70">
              {item.sub}
            </span>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}
