"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  LineSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PricePoint } from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

export interface MarketChartSignal {
  direction?: string;
  confidence?: number;
}

export interface MarketChartProps {
  history: PricePoint[];
  livePrice?: number | null;
  entryPrice?: number | null;
  entryTime?: number | null;
  target?: number | null;
  signal?: MarketChartSignal | null;
  height?: number;
  compact?: boolean;
  title?: string;
  currentPrice?: number | null;
}

export function MarketChart({
  history,
  livePrice,
  entryPrice,
  entryTime,
  target,
  signal,
  height = 280,
  compact,
  title,
  currentPrice,
}: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const targetLineRef = useRef<ReturnType<ISeriesApi<"Line">["createPriceLine"]> | null>(null);

  const data = useMemo(() => {
    const pts = [...history];
    if (livePrice != null) {
      const lastT = pts.length ? pts[pts.length - 1].t : Math.floor(Date.now() / 1000);
      const t = lastT >= Math.floor(Date.now() / 1000) - 5 ? lastT : Math.floor(Date.now() / 1000);
      const existing = pts[pts.length - 1];
      if (existing && Math.abs(existing.t - t) <= 60) {
        pts[pts.length - 1] = { t, p: livePrice };
      } else {
        pts.push({ t, p: livePrice });
      }
    }
    return pts;
  }, [history, livePrice]);

  const lastT = data.length ? data[data.length - 1].t : Math.floor(Date.now() / 1000);

  const markers = useMemo(() => {
    const out: Array<{
      time: UTCTimestamp;
      position: "aboveBar" | "belowBar";
      color: string;
      shape: "arrowUp" | "arrowDown" | "circle";
      text: string;
    }> = [];

    const entryTimeResolved =
      entryTime ??
      (entryPrice != null
        ? (() => {
            let best = null as number | null;
            let diff = Infinity;
            for (const pt of data) {
              const d = Math.abs(pt.p - entryPrice);
              if (d < diff) {
                diff = d;
                best = pt.t;
              }
            }
            return best;
          })()
        : null);

    if (entryPrice != null && entryTimeResolved != null) {
      out.push({
        time: entryTimeResolved as UTCTimestamp,
        position: "belowBar",
        color: "#2bd576",
        shape: "circle",
        text: "ENTRY",
      });
    }

    const dir = String(signal?.direction || "").toLowerCase();
    if (dir && lastT) {
      const conf = Math.round(Number(signal?.confidence ?? 0) * 100);
      out.push({
        time: lastT as UTCTimestamp,
        position: dir === "up" ? "aboveBar" : "belowBar",
        color: dir === "up" ? "#3b82f6" : "#ff4d5e",
        shape: dir === "up" ? "arrowUp" : "arrowDown",
        text: `${dir === "up" ? "BUY" : "SELL"}${conf ? ` ${conf}%` : ""}`,
      });
    }

    return out;
  }, [entryPrice, entryTime, signal, lastT, data]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6b7280",
        fontSize: 10,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(128,128,128,0.08)" },
        horzLines: { color: "rgba(128,128,128,0.08)" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderVisible: false,
        rightOffset: compact ? 2 : 6,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "rgba(59,130,246,0.25)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2563eb" },
        horzLine: { color: "rgba(59,130,246,0.25)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2563eb" },
      },
    });

    const series = chart.addSeries(LineSeries, {
      color: compact ? "#3b82f6" : "#2563eb",
      lineWidth: compact ? 1 : 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: compact ? 2 : 3,
      crosshairMarkerBorderColor: "#ffffff",
      crosshairMarkerBackgroundColor: "#3b82f6",
    });

    const markers = createSeriesMarkers(series, []);

    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = markers;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
  }, [compact]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      data.map((p) => ({ time: p.t as UTCTimestamp, value: p.p })),
    );
  }, [data]);

  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.setMarkers(markers);
  }, [markers]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (targetLineRef.current) {
      series.removePriceLine(targetLineRef.current);
      targetLineRef.current = null;
    }
    if (target != null && Number.isFinite(target)) {
      targetLineRef.current = series.createPriceLine({
        price: target,
        color: "#2563eb",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "TARGET",
      });
    }
  }, [target, seriesRef]);

  useEffect(() => {
    if (!chartRef.current || !data.length) return;
    chartRef.current.timeScale().fitContent();
  }, [data.length]);

  if (!history.length) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
      >
        {compact ? "no data" : "No price history yet"}
      </div>
    );
  }

  const lastPrice = livePrice ?? (history.length ? history[history.length - 1].p : null);

  return (
    <div className="relative w-full">
      {title || currentPrice != null ? (
        <div className="mb-1 flex items-center justify-between gap-2">
          {title ? (
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {title}
            </span>
          ) : null}
          {lastPrice != null ? (
            <span className="font-mono text-[12px] tabular-nums text-foreground">
              {lastPrice.toFixed(3)}
            </span>
          ) : null}
        </div>
      ) : null}
      <div ref={containerRef} style={{ height }} className="w-full" />
      {signal ? (
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          className={cn(
            "pointer-events-none absolute right-2 top-6 rounded-md px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest",
            String(signal.direction).toLowerCase() === "up"
              ? "bg-[var(--success)]/10 text-[var(--success)]"
              : String(signal.direction).toLowerCase() === "down"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground",
          )}
        >
          {String(signal.direction || "neutral")} {Math.round(Number(signal.confidence ?? 0) * 100)}%
        </motion.div>
      ) : null}
    </div>
  );
}
