"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { ArrowUp, ArrowDown, Minus } from "lucide-react"
import { PulseDot } from "@/components/animations/pulse-dot"

type Signal = {
  direction?: string
  confidence?: number
  score?: number
  action?: string
}

function SignalRow({
  label,
  s,
  delay,
}: {
  label: string
  s?: Signal | null
  delay?: number
}) {
  const dir = s?.direction ?? "neutral"
  const tone =
    dir === "up"
      ? "text-[var(--success)]"
      : dir === "down"
        ? "text-destructive"
        : "text-muted-foreground"
  const Icon =
    dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : Minus
  const conf = Number(s?.confidence ?? 0)

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: delay ?? 0, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 shadow-sm"
    >
      <motion.div
        animate={dir !== "neutral" ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.4, repeat: 0 }}
      >
        <Icon className={cn("size-4 shrink-0", tone)} />
      </motion.div>
      <span className={cn("w-8 font-mono text-xs font-bold", tone)}>
        {label}
      </span>
      <div className="flex flex-1 items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, conf * 100)}%` }}
            transition={{ duration: 0.6, delay: (delay ?? 0) + 0.2, ease: "easeOut" }}
            className={cn(
              "h-full rounded-full",
              conf >= 0.6
                ? "bg-[var(--success)]"
                : conf >= 0.3
                  ? "bg-yellow-500"
                  : "bg-destructive/60",
            )}
          />
        </div>
        <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
          {String(s?.action ?? "hold").slice(0, 4)}
        </span>
      </div>
    </motion.div>
  )
}

export function SignalPanel({
  btc,
  eth,
  ageMs,
}: {
  btc?: Signal | null
  eth?: Signal | null
  ageMs?: number | null
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <PulseDot active={!!btc || !!eth} className="text-[var(--success)]" />
        Live signals
        {ageMs != null ? (
          <span className="ml-1 text-[9px] text-muted-foreground/60">
            {Math.round(ageMs / 1000)}s ago
          </span>
        ) : null}
      </span>
      <SignalRow label="BTC" s={btc} delay={0} />
      <SignalRow label="ETH" s={eth} delay={0.08} />
    </div>
  )
}
