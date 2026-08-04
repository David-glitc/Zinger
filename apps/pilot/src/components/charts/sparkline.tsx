"use client";

import { useMemo, useId } from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  points: number[];
  height?: number;
  width?: number;
  tone?: "up" | "down" | "neutral";
  className?: string;
}

/** Dependency-free SVG sparkline with soft gradient fill + glow. */
export function Sparkline({
  points,
  height = 64,
  width = 260,
  tone = "neutral",
  className,
}: SparklineProps) {
  const gid = useId();
  const color =
    tone === "up" ? "var(--success)" : tone === "down" ? "var(--error)" : "var(--primary)";

  const path = useMemo(() => {
    if (!points.length) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const n = points.length;
    const x = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * width);
    const y = (v: number) => height - ((v - min) / range) * (height - 4) - 2;
    const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
    return d;
  }, [points, width, height]);

  const area = path ? `${path} L${width},${height} L0,${height} Z` : null;

  if (!path || points.length < 2) {
    return <div style={{ width, height }} className={cn("bg-muted/40", className)} />;
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={cn("overflow-visible", className)}
    >
      <defs>
        <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px color-mix(in srgb, ${color} 60%, transparent))` }}
      />
      {area ? <path d={area} fill={`url(#${gid}-fill)`} /> : null}
    </svg>
  );
}
