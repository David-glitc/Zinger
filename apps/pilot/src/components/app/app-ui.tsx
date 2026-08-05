"use client";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { CountUp } from "@/components/animations/count-up";

export function PageHeading({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-primary/70">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-[clamp(1.5rem,4vw,2.25rem)] font-medium leading-[1.05] tracking-[-0.03em] text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-xl font-sans text-[13px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  accent,
  index = 0,
}: {
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  tone?: "up" | "dn" | "neutral";
  accent?: boolean;
  index?: number;
}) {
  const num = typeof value === "number" && Number.isFinite(value) ? value : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        "relative overflow-hidden rounded-xl border p-3.5 sm:p-4",
        accent
          ? "zg-card-glow"
          : tone === "up"
            ? "zg-card-premium zg-card-pnl-up"
            : tone === "dn"
              ? "zg-card-premium zg-card-pnl-down"
              : "zg-card-premium",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        {accent ? <span className="zg-live-dot" /> : null}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl",
          tone === "up" && "zg-glow-up",
          tone === "dn" && "zg-glow-down",
          tone === "neutral" && !accent && "text-foreground",
          accent && "text-primary",
        )}
      >
        {num != null ? (
          <CountUp value={num} decimals={2} prefix="$" />
        ) : (
          <span>{String(value ?? "—")}</span>
        )}
      </div>
      {sub ? (
        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{sub}</p>
      ) : null}
    </motion.div>
  );
}

export function GlassPanel({
  children,
  className,
  label,
  right,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={cn("zg-card-premium", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </span>
          {right}
        </div>
      ) : null}
      <div className={cn(!label && "p-4")}>{children}</div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-display text-[13px] font-medium tracking-tight text-foreground">
      <span className="size-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
      {children}
    </h2>
  );
}