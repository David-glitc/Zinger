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
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-[clamp(1.6rem,4vw,2.4rem)] font-[500] leading-[1.05] tracking-[-0.03em]">
          <span className="zg-chrome-text">{title}</span>
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-xl font-sans text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
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
      transition={{ duration: 0.35, delay: index * 0.05, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        "zg-frame zg-glass relative overflow-hidden rounded-xl p-3.5 sm:p-4",
        accent && "border-primary/25",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/80">
          {label}
        </span>
        {accent && <span className="zg-live-dot" />}
      </div>
      <div
        className={cn(
          "mt-1.5 font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl",
          tone === "up" && "text-[var(--success)]",
          tone === "dn" && "text-[var(--error)]",
          accent && "text-primary",
          tone === "neutral" && !accent && "text-foreground",
        )}
      >
        {num != null ? (
          <CountUp value={num} decimals={2} prefix="$" />
        ) : (
          <span>{String(value ?? "—")}</span>
        )}
      </div>
      {sub ? (
        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">{sub}</p>
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
    <div className={cn("zg-glass rounded-xl", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
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
    <h2 className="mb-2.5 flex items-center gap-2 font-display text-[15px] font-[500] tracking-tight text-foreground">
      <span className="size-1 rounded-full bg-primary shadow-[0_0_8px_rgba(200,255,0,0.9)]" />
      {children}
    </h2>
  );
}
