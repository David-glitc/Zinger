"use client"

import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"
import { Stagger, StaggerItem } from "@/components/animations/stagger"

function money(n: number | null | undefined) {
  const x = Number(n)
  if (!Number.isFinite(x)) return "—"
  return (
    "$" +
    x.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

export function OpenTable({
  opens,
}: {
  opens: Array<Record<string, unknown>>
}) {
  if (opens.length === 0) {
    return (
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="py-6 text-center font-mono text-xs text-muted-foreground"
      >
        No open positions — start a session
      </motion.p>
    )
  }

  return (
    <AnimatePresence mode="popLayout">
      <table className="w-full border-collapse font-mono text-xs">
        <thead>
          <tr className="border-b border-border/40 text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-2 py-1 text-left font-normal">Asset</th>
            <th className="px-2 py-1 text-left font-normal">Side</th>
            <th className="px-2 py-1 text-right font-normal">Entry</th>
            <th className="px-2 py-1 text-right font-normal">Mark</th>
            <th className="px-2 py-1 text-right font-normal">P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          <Stagger staggerDelay={0.04}>
            {opens.slice(0, 16).map((p, i) => {
              const pnl = Number(p.unrealizedPnl)
              return (
                <StaggerItem key={String(p.id || p.slug || i)}>
                  <motion.tr
                    layout
                    exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                    className="border-b border-border/20 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-2 py-1 font-semibold">{String(p.asset || "?")}</td>
                    <td className="px-2 py-1">
                      <span
                        className={cn(
                          "font-semibold",
                          String(p.outcome || "").toUpperCase() === "UP"
                            ? "text-[var(--success)]"
                            : "text-destructive",
                        )}
                      >
                        {String(p.outcome || "").toUpperCase().slice(0, 2)}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {Number(p.entry || 0).toFixed(3)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {Number(p.mark || 0).toFixed(3)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1 text-right font-semibold tabular-nums",
                        pnl >= 0 ? "text-[var(--success)]" : "text-destructive",
                      )}
                    >
                      <motion.span
                        key={pnl}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {money(pnl)}
                      </motion.span>
                    </td>
                  </motion.tr>
                </StaggerItem>
              )
            })}
          </Stagger>
        </tbody>
      </table>
    </AnimatePresence>
  )
}

export function TapeTable({
  events,
}: {
  events: Array<Record<string, unknown>>
}) {
  if (events.length === 0) {
    return (
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="py-6 text-center font-mono text-xs text-muted-foreground"
      >
        No events yet
      </motion.p>
    )
  }

  const sorted = [...events].reverse().slice(0, 60)

  return (
    <div className="max-h-[240px] overflow-y-auto">
      <AnimatePresence>
        <Stagger staggerDelay={0.03}>
          {sorted.map((e, i) => (
            <StaggerItem key={String(e.id || i)}>
              <motion.div
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "flex items-center gap-2 border-b border-border/10 px-3 py-1.5 font-mono text-[10px] transition-colors hover:bg-muted/20",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider",
                    String(e.type) === "open"
                      ? "bg-[var(--success)]/10 text-[var(--success)]"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {String(e.type || "evt").slice(0, 4)}
                </span>
                <span className="flex-1 truncate text-muted-foreground">
                  {String(e.message || "")}
                </span>
                {e.pnl != null ? (
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      Number(e.pnl) >= 0 ? "text-[var(--success)]" : "text-destructive",
                    )}
                  >
                    {money(Number(e.pnl))}
                  </span>
                ) : null}
              </motion.div>
            </StaggerItem>
          ))}
        </Stagger>
      </AnimatePresence>
    </div>
  )
}

export function SettledTable({
  trades,
}: {
  trades: Array<Record<string, unknown>>
}) {
  if (trades.length === 0) {
    return (
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="py-6 text-center font-mono text-xs text-muted-foreground"
      >
        No settled trades
      </motion.p>
    )
  }

  return (
    <AnimatePresence mode="popLayout">
      <table className="w-full border-collapse font-mono text-xs">
        <thead>
          <tr className="border-b border-border/40 text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-2 py-1 text-left font-normal">Asset</th>
            <th className="px-2 py-1 text-left font-normal">Dir</th>
            <th className="px-2 py-1 text-right font-normal">P&amp;L</th>
            <th className="px-2 py-1 text-right font-normal">Reason</th>
          </tr>
        </thead>
        <tbody>
          <Stagger staggerDelay={0.02}>
            {trades.slice(0, 40).map((t, i) => (
              <StaggerItem key={String(t.id || i)}>
                <motion.tr
                  layout
                  exit={{ opacity: 0 }}
                  className="border-b border-border/20 transition-colors hover:bg-muted/30"
                >
                  <td className="px-2 py-1 font-semibold">{String(t.asset || t.symbol || "?")}</td>
                  <td className="px-2 py-1">
                    <span
                      className={cn(
                        "font-semibold",
                        String(t.outcome || "").toUpperCase() === "UP"
                          ? "text-[var(--success)]"
                          : "text-destructive",
                      )}
                    >
                      {String(t.outcome || "").toUpperCase().slice(0, 2)}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1 text-right font-semibold tabular-nums",
                      Number(t.pnl) >= 0 ? "text-[var(--success)]" : "text-destructive",
                    )}
                  >
                    {money(Number(t.pnl))}
                  </td>
                  <td className="px-2 py-1 text-right text-muted-foreground">
                    {String(t.reason || t.exitReason || "—")}
                  </td>
                </motion.tr>
              </StaggerItem>
            ))}
          </Stagger>
        </tbody>
      </table>
    </AnimatePresence>
  )
}
