"use client";

import { cn } from "@/lib/utils";

type ScoreCard = {
  id?: string;
  kind?: string;
  title?: string;
  value?: string;
  detail?: string;
  tone?: string;
};

type Narrative = {
  headline?: string;
  lines?: Array<{ tone?: string; text?: string }>;
  paragraph?: string;
};

type AccountBundle = {
  stats?: {
    best?: Array<Record<string, unknown>>;
    totalPnl?: number;
    winRate?: number | string;
    pmRealizedSum?: number;
  };
  curve?: { points?: Array<{ t?: number; equity?: number }> };
  snapshot?: { dataUrl?: string; mime?: string } | null;
};

function money(n: unknown) {
  const v = Number(n || 0);
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
}

function EquitySvg({ points = [] }: { points?: Array<{ equity?: number }> }) {
  const pts = (points || []).filter((p) => Number.isFinite(Number(p.equity)));
  if (pts.length < 2) {
    return (
      <div className="flex h-28 items-center justify-center font-mono text-[10px] text-muted-foreground">
        Equity curve warming…
      </div>
    );
  }
  const vals = pts.map((p) => Number(p.equity));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(0.01, max - min);
  const w = 640;
  const h = 112;
  const pad = 10;
  const path = pts
    .map((p, i) => {
      const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (Number(p.equity) - min) / span) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full" role="img" aria-label="USD equity">
      <path d={path} fill="none" stroke={up ? "var(--color-success)" : "var(--color-destructive)"} strokeWidth="2.2" />
    </svg>
  );
}

export function AccountPanel({
  narrative,
  liveScoreCards = [],
  account,
  cashAudit,
  mode = "paper",
}: {
  narrative?: Narrative | null;
  liveScoreCards?: ScoreCard[];
  account?: AccountBundle | null;
  cashAudit?: Record<string, unknown> | null;
  mode?: string;
}) {
  const best = account?.stats?.best || [];
  const curve = account?.curve?.points || [];
  const snapshot = account?.snapshot;
  const issues = (cashAudit?.issues as string[]) || [];
  const notes = (cashAudit?.notes as string[]) || [];
  const ok = cashAudit?.ok !== false;

  return (
    <div className="space-y-3 p-3">
      {narrative?.headline ? (
        <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2">
          <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Live NLP · {String(mode).toUpperCase()}
          </div>
          <div className="mt-1 text-xs font-medium leading-snug">{narrative.headline}</div>
          <div className="mt-1 space-y-0.5">
            {(narrative.lines || []).slice(1, 5).map((line, i) => (
              <div key={i} className="text-[10px] leading-snug text-muted-foreground">
                · {line.text}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {liveScoreCards.length > 0 ? (
        <div className="overflow-hidden">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Score strip · actions / ML / CLOB / inference
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {liveScoreCards.slice(0, 16).map((card, i) => (
              <div
                key={`${card.id || i}`}
                className={cn(
                  "min-w-[132px] shrink-0 rounded-md border border-border/50 px-2 py-1.5",
                  card.tone === "up" && "border-emerald-500/30",
                  card.tone === "down" && "border-red-500/30",
                  card.tone === "clob" && "border-sky-500/30",
                )}
              >
                <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                  {card.kind}
                </div>
                <div className="truncate text-[10px] font-medium">{card.title}</div>
                <div
                  className={cn(
                    "font-mono text-xs font-bold",
                    card.tone === "up" && "text-emerald-400",
                    card.tone === "down" && "text-red-400",
                    card.tone === "clob" && "text-sky-400",
                  )}
                >
                  {card.value}
                </div>
                {card.detail ? (
                  <div className="truncate text-[9px] text-muted-foreground">{card.detail}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          USD equity · {curve.length} marks
        </div>
        <EquitySvg points={curve} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Best trades
          </div>
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {best.length === 0 ? (
              <div className="text-[10px] text-muted-foreground">No closes yet.</div>
            ) : (
              best.slice(0, 8).map((t, i) => (
                <div
                  key={String(t.id || `${t.slug}-${i}`)}
                  className="flex items-center gap-2 rounded border border-border/40 px-2 py-1 font-mono text-[10px]"
                >
                  <span className="font-bold">{String(t.symbol || "?")}</span>
                  <span className="uppercase text-muted-foreground">{String(t.outcome || "")}</span>
                  <span
                    className={cn(
                      "ml-auto font-bold",
                      Number(t.pnl) >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {money(t.pnl)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Session PnL image
          </div>
          {snapshot?.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={snapshot.dataUrl}
              alt="Session PnL snapshot"
              className="w-full rounded-md border border-border/50"
            />
          ) : (
            <div className="text-[10px] text-muted-foreground">Snapshot pending…</div>
          )}
        </div>
      </div>

      {(issues.length > 0 || (!ok && notes.length > 0)) && (
        <div
          className={cn(
            "rounded-md border px-2 py-1.5 font-mono text-[10px]",
            ok ? "border-border/50" : "border-destructive/40",
          )}
        >
          <div className="mb-1 uppercase tracking-wider text-muted-foreground">
            Audit {ok ? "detail" : "issues"}
          </div>
          {issues.map((iss, i) => (
            <div key={`i-${i}`} className="text-red-400">
              ! {iss}
            </div>
          ))}
          {!ok &&
            notes.map((n, i) => (
              <div key={`n-${i}`} className="text-amber-400/90">
                · {n}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
