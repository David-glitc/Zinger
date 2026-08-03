"use client";

import { useIntelligence } from "@/hooks/use-intelligence";
import { cn } from "@/lib/utils";
import { Activity, Cpu, BarChart3 } from "lucide-react";

export function IntelligencePanel() {
  const { data, isLoading } = useIntelligence();

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-4 font-mono text-xs text-muted-foreground">
        Loading intelligence…
      </div>
    );
  }

  const signals = data.signals;
  const models = data.models || [];
  const paper = data.paper;

  return (
    <div className="flex flex-col divide-y divide-border/40 text-xs">
      {/* Signal heads-up */}
      <div className="flex items-center gap-3 px-3 py-1.5">
        <Activity className="size-3 text-primary" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Signal pipeline
        </span>
        <span className="ml-auto font-mono text-[9px] text-muted-foreground">
          {new Date(data.timestamp).toLocaleTimeString()}
        </span>
      </div>
      {signals?.btc ? (
        <SignalRow label="BTC" s={signals.btc} />
      ) : null}
      {signals?.eth ? (
        <SignalRow label="ETH" s={signals.eth} />
      ) : null}
      {!signals?.btc && !signals?.eth ? (
        <div className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
          No signals yet
        </div>
      ) : null}

      {/* Model health */}
      {models.length > 0 ? (
        <>
          <div className="flex items-center gap-3 px-3 py-1.5">
            <Cpu className="size-3 text-chart-2" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Models
            </span>
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">
              {models.length} active
            </span>
          </div>
          {models.slice(0, 4).map((m) => (
            <div
              key={m.name}
              className="flex items-center gap-2 px-3 py-1 font-mono text-[10px]"
            >
              <span className="w-16 truncate text-muted-foreground">{m.name}</span>
              <span
                className={cn(
                  m.status === "running" || m.status === "healthy"
                    ? "text-[var(--success)]"
                    : "text-destructive",
                )}
              >
                {m.status}
              </span>
              {m.accuracy != null ? (
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {(m.accuracy * 100).toFixed(1)}%
                </span>
              ) : null}
              {m.samples > 0 ? (
                <span className="tabular-nums text-muted-foreground">
                  n={m.samples}
                </span>
              ) : null}
            </div>
          ))}
        </>
      ) : null}

      {/* Paper stats */}
      {paper ? (
        <>
          <div className="flex items-center gap-3 px-3 py-1.5">
            <BarChart3 className="size-3 text-chart-1" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Paper
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 px-3 py-1.5 font-mono text-[9px]">
            <div>
              <span className="text-muted-foreground">Equity </span>
              <span className="tabular-nums">${paper.equity.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Cash </span>
              <span className="tabular-nums">${paper.cash.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">P&L </span>
              <span
                className={cn(
                  "tabular-nums",
                  paper.realizedPnl >= 0 ? "text-[var(--success)]" : "text-destructive",
                )}
              >
                ${paper.realizedPnl >= 0 ? "+" : ""}
                {paper.realizedPnl.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Win </span>
              <span className="tabular-nums">
                {paper.winRate != null ? `${(paper.winRate * 100).toFixed(1)}%` : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">W/L </span>
              <span className="tabular-nums">
                {paper.wins}/{paper.losses}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Open </span>
              <span className="tabular-nums">{paper.openCount}</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function SignalRow({
  label,
  s,
}: {
  label: string;
  s: { direction: string; confidence: number; score: number; action: string };
}) {
  const dir = s.direction || "neutral";
  const tone =
    dir === "up"
      ? "text-[var(--success)]"
      : dir === "down"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 hover:bg-muted/20">
      <span className={cn("w-6 font-mono text-xs font-bold", tone)}>{label}</span>
      <span className={cn("w-8 font-mono text-[10px] font-semibold", tone)}>
        {dir === "up" ? "▲" : dir === "down" ? "▼" : "—"} {dir.toUpperCase().slice(0, 2)}
      </span>
      <div className="flex flex-1 items-center gap-1.5">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/50">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              s.confidence >= 0.6
                ? "bg-[var(--success)]"
                : s.confidence >= 0.3
                  ? "bg-yellow-500"
                  : "bg-destructive/60",
            )}
            style={{ width: `${Math.min(100, s.confidence * 100)}%` }}
          />
        </div>
      </div>
      <span className="ml-auto font-mono text-[9px] tabular-nums text-muted-foreground">
        {s.action?.slice(0, 4) || "hold"}
      </span>
    </div>
  );
}
