"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

function CountUp({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const dur = 1500;
    function tick(now: number) {
      const t = Math.min((now - start) / dur, 1);
      setV(Math.floor(t * end));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end]);
  return <>{prefix}{v.toLocaleString()}{suffix}</>;
}

interface StatsData {
  trades: number;
  winRate: number | null;
  equity: number;
  openCount: number;
}

export default function Stats() {
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => {
    fetch("/api/intelligence")
      .then((r) => r.json())
      .then((d) => {
        if (d?.paper) {
          const wins = d.paper.wins || 0;
          const losses = d.paper.losses || 0;
          setData({
            trades: wins + losses,
            winRate: d.paper.winRate,
            equity: d.paper.equity,
            openCount: d.paper.openCount,
          });
        }
      })
      .catch(() => {});
  }, []);

  const stats = [
    { value: data?.trades ?? 0, label: "Trades executed", suffix: "+" },
    { value: data?.winRate != null ? Math.round(data.winRate * 100) : 0, label: "Avg win rate", suffix: "%" },
    { value: Math.round(data?.equity ?? 0), label: "Paper equity", prefix: "$" },
    { value: 5, label: "Window durations", suffix: "m+" },
  ];

  return (
    <section className="border-t border-border bg-muted py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6 sm:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="text-center"
            >
              <p className="font-display text-[clamp(2rem,5vw,3.25rem)] leading-none tracking-[-0.03em] text-foreground">
                <CountUp end={s.value} suffix={s.suffix} prefix={s.prefix} />
              </p>
              <p className="mt-2 font-serif text-base text-muted-foreground">
                {s.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}