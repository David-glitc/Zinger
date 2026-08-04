"use client";

import dynamic from "next/dynamic";
import type { MarketChartProps } from "@/components/charts/market-chart";

const MarketChart = dynamic(
  () => import("@/components/charts/market-chart").then((m) => m.MarketChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">
        loading…
      </div>
    ),
  },
);

export function MarketChartLazy(props: MarketChartProps) {
  return <MarketChart {...props} />;
}
