"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { CountUp } from "@/components/animations/count-up";

interface LiveStats {
  tvl: number;
  totalUsers: number;
  activeSessions: number;
  liveUsers: number;
  clobProvisioned: number;
}

export default function Stats() {
  const [data, setData] = useState<LiveStats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }, []);

  const stats = [
    { value: Math.round(data?.tvl ?? 0), label: "Total value deposited", prefix: "$" },
    { value: data?.totalUsers ?? 0, label: "Wallets connected", suffix: "" },
    { value: data?.clobProvisioned ?? 0, label: "CLOB accounts provisioned", suffix: "" },
    { value: data?.activeSessions ?? 0, label: "Active trading sessions", suffix: "" },
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
                <CountUp value={s.value} decimals={0} prefix={s.prefix} suffix={s.suffix} />
              </p>
              <p className="mt-2 font-sans text-base text-muted-foreground">
                {s.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
