"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { useSaveRules } from "@/hooks/use-pilot";
import { usePortfolio } from "@/hooks/use-portfolio";
import { toast } from "sonner";
import { Save, RotateCcw, SlidersHorizontal } from "lucide-react";
import { PageHeading, GlassPanel, SectionLabel } from "@/components/app/app-ui";
import { CapitalInsights } from "@/components/dashboard/capital-insights";
import { GeoblockAlert } from "@/components/dashboard/geoblock-status";
import { Button } from "@/components/ui/button";

const ASSETS = ["BTC,ETH", "BTC", "ETH"];
const DURATIONS = ["5m", "5m,15m", "5m,15m,30m,1h", "15m"];

interface BandFieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function BandField({ label, hint, children }: BandFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </label>
        {hint ? (
          <span className="font-mono text-[10px] text-muted-foreground/60">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function PctSlider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="zg-range flex-1"
        style={{ ["--zg-pct" as string]: `${pct}%` }}
      />
      <span className="w-16 shrink-0 text-right font-mono text-[12px] tabular-nums text-foreground">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const { account, snap, mode, busy, liveAccountQuery } = useAppState();
  const saveRules = useSaveRules(account?.wallet ?? null);
  const liveAcct = liveAccountQuery.data || snap?.liveAccount || null;
  const portfolio = usePortfolio(snap, mode, liveAcct);

  const [rules, setRules] = useState({
    maxPositionPct: 10,
    minConfidence: 0.38,
    minPrice: 0.42,
    maxPrice: 0.68,
    assets: "BTC,ETH",
    durations: "5m,15m",
    minTpUsd: 5,
  });

  useEffect(() => {
    if (!account?.rules) return;
    const r = account.rules;
    setRules({
      maxPositionPct: Number(r.maxPositionPct ?? 10),
      minConfidence: Number(r.minConfidence ?? 0.38),
      minPrice: Number(r.minPrice ?? 0.42),
      maxPrice: Number(r.maxPrice ?? 0.68),
      assets: String(r.assets ?? "BTC,ETH"),
      durations: String(r.durations ?? "5m,15m"),
      minTpUsd: Number(r.minTpUsd ?? 5),
    });
  }, [account?.rules]);

  const dirty =
    !account?.rules ||
    Number(account.rules.maxPositionPct ?? 10) !== rules.maxPositionPct ||
    Number(account.rules.minConfidence ?? 0.38) !== rules.minConfidence ||
    Number(account.rules.minPrice ?? 0.42) !== rules.minPrice ||
    Number(account.rules.maxPrice ?? 0.68) !== rules.maxPrice ||
    String(account.rules.assets ?? "BTC,ETH") !== rules.assets ||
    String(account.rules.durations ?? "5m,15m") !== rules.durations ||
    Number(account.rules.minTpUsd ?? 5) !== rules.minTpUsd;

  function reset() {
    setRules({
      maxPositionPct: 10,
      minConfidence: 0.38,
      minPrice: 0.42,
      maxPrice: 0.68,
      assets: "BTC,ETH",
      durations: "5m,15m",
      minTpUsd: 5,
    });
  }

  async function onSave() {
    if (rules.maxPrice <= rules.minPrice) {
      toast.error("Max entry must be above min entry");
      return;
    }
    try {
      await saveRules.mutateAsync({
        maxPositionPct: rules.maxPositionPct,
        minConfidence: rules.minConfidence,
        minPrice: rules.minPrice,
        maxPrice: rules.maxPrice,
        assets: rules.assets,
        durations: rules.durations,
        minTpUsd: rules.minTpUsd,
      });
      toast.success("Bands saved — live in the next scan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
      <GeoblockAlert />
      <PageHeading
        eyebrow="Tune"
        title="Bands & risk"
        subtitle="These filters decide what the session can trade. Tighter bands mean fewer, higher-conviction entries."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              className="rounded-lg border-border font-mono text-[11px] uppercase tracking-[0.14em]"
            >
              <RotateCcw className="mr-1.5 size-3.5" /> Defaults
            </Button>
            <Button
              size="sm"
              disabled={busy || !dirty}
              onClick={onSave}
              className="zg-volt-btn rounded-lg font-mono text-[11px] uppercase tracking-[0.14em] text-white"
            >
              <Save className="mr-1.5 size-3.5" /> Save bands
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        {/* Left: bands */}
        <div className="space-y-5">
          <GlassPanel label="ENTRY BANDS">
            <div className="space-y-5 p-4 sm:p-5">
              <BandField label="Max position" hint="per trade, % of equity">
                <PctSlider
                  value={rules.maxPositionPct}
                  min={1}
                  max={25}
                  step={0.5}
                  onChange={(v) => setRules({ ...rules, maxPositionPct: v })}
                  format={(v) => `${v.toFixed(1)}%`}
                />
              </BandField>

              <BandField label="Min confidence" hint="signal strength">
                <PctSlider
                  value={rules.minConfidence}
                  min={0.2}
                  max={0.9}
                  step={0.01}
                  onChange={(v) => setRules({ ...rules, minConfidence: v })}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
              </BandField>

              <BandField label="Price band" hint="entry price of the outcome">
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0.2}
                    max={0.9}
                    step={0.01}
                    className="zg-num"
                    value={rules.minPrice}
                    onChange={(e) =>
                      setRules({ ...rules, minPrice: Math.max(0, Number(e.target.value)) })
                    }
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">to</span>
                  <input
                    type="number"
                    min={0.3}
                    max={0.99}
                    step={0.01}
                    className="zg-num"
                    value={rules.maxPrice}
                    onChange={(e) =>
                      setRules({ ...rules, maxPrice: Math.min(1, Number(e.target.value)) })
                    }
                  />
                </div>
                <div className="relative mt-2 h-2 rounded-full bg-border/60">
                  <div
                    className="absolute top-0 h-full rounded-full bg-primary/30"
                    style={{
                      left: `${rules.minPrice * 100}%`,
                      width: `${(rules.maxPrice - rules.minPrice) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between font-mono text-[9px] text-muted-foreground/60">
                  <span>0.00</span>
                  <span>0.50</span>
                  <span>1.00</span>
                </div>
              </BandField>

              <div className="grid gap-4 sm:grid-cols-2">
                <BandField label="Assets">
                  <select
                    className="zg-num cursor-pointer appearance-none"
                    value={rules.assets}
                    onChange={(e) => setRules({ ...rules, assets: e.target.value })}
                  >
                    {ASSETS.map((a) => (
                      <option key={a} value={a}>
                        {a.replace(",", " + ")}
                      </option>
                    ))}
                  </select>
                </BandField>
                <BandField label="Durations">
                  <select
                    className="zg-num cursor-pointer appearance-none"
                    value={rules.durations}
                    onChange={(e) => setRules({ ...rules, durations: e.target.value })}
                  >
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d.replace(",", " / ")}
                      </option>
                    ))}
                  </select>
                </BandField>
              </div>

              <BandField label="Min take-profit" hint="close a winner only above this $">
                <PctSlider
                  value={rules.minTpUsd}
                  min={2}
                  max={50}
                  step={1}
                  onChange={(v) => setRules({ ...rules, minTpUsd: v })}
                  format={(v) => `$${v}`}
                />
              </BandField>
            </div>
          </GlassPanel>
        </div>

        {/* Right: live preview */}
        <div className="space-y-5">
          <section className="space-y-2.5">
            <SectionLabel>Live preview</SectionLabel>
            <CapitalInsights
              edgeGate={snap?.edgeGate}
              config={{
                kellyFraction: 0,
                maxPositionPct: rules.maxPositionPct / 100,
                minConfidence: rules.minConfidence,
              }}
              cash={portfolio.cash}
            />
          </section>

          <GlassPanel label="HOW IT READS">
            <div className="space-y-2.5 p-4 font-sans text-[12px] leading-relaxed text-muted-foreground">
              <p>
                The session watches {rules.assets.replace(",", " and ")} across{" "}
                {rules.durations.replace(",", ", ")} books and only fires when conviction clears{" "}
                {(rules.minConfidence * 100).toFixed(0)}% and the outcome sits between{" "}
                {rules.minPrice.toFixed(2)} and {rules.maxPrice.toFixed(2)}.
              </p>
              <p>
                Each trade caps at {rules.maxPositionPct.toFixed(1)}% of equity and must bank at
                least ${rules.minTpUsd} to close as a winner.
              </p>
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
                <SlidersHorizontal className="size-3" /> changes apply on the next scan
              </p>
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
