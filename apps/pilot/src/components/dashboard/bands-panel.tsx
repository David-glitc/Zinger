"use client"

import type { Rules } from "@/lib/api"
import { cn } from "@/lib/utils"

const BANDS: Array<{
  key: keyof Rules
  label: string
  fmt?: (v: unknown) => string
}> = [
  { key: "maxPositionPct", label: "Max position", fmt: (v) => `${v}%` },
  { key: "minConfidence", label: "Min confidence", fmt: (v) => Number(v).toFixed(2) },
  { key: "minPrice", label: "Min entry", fmt: (v) => Number(v).toFixed(2) },
  { key: "maxPrice", label: "Max entry", fmt: (v) => Number(v).toFixed(2) },
  { key: "minTpUsd", label: "Min TP $", fmt: (v) => `$${v}` },
  { key: "assets", label: "Assets", fmt: (v) => String(v) },
]

export function BandsPanel({ rules }: { rules: Rules | null }) {
  if (!rules) {
    return (
      <div className="flex items-center justify-center py-4 font-mono text-xs text-muted-foreground">
        No bands set
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {BANDS.map((b) => {
        const raw = rules[b.key]
        const val = b.fmt ? b.fmt(raw) : String(raw ?? "—")
        return (
          <div key={b.key} className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {b.label}
            </span>
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                b.key === "assets" ? "text-primary" : "text-foreground",
              )}
            >
              {val}
            </span>
          </div>
        )
      })}
    </div>
  )
}
