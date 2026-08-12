"use client";

import { motion } from "motion/react";
import { Wallet, SlidersHorizontal, Play, LineChart } from "lucide-react";

const STEPS = [
  {
    icon: Wallet,
    title: "Fund",
    desc: "Paper: credit the ledger with fake cash. Live: send USDC → pUSD on your deposit address, then sync.",
  },
  {
    icon: SlidersHorizontal,
    title: "Band",
    desc: "Cap position size, confidence threshold, entry price range, and asset whitelist. The agent respects your rules.",
  },
  {
    icon: Play,
    title: "Start session",
    desc: "Begin the scan loop. Zinger evaluates 5m and 15m BTC/ETH windows and fills market orders on CLOB.",
  },
  {
    icon: LineChart,
    title: "Watch & settle",
    desc: "Tape, positions, and account equity stream live. Positions settle at expiry — no active management needed.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="border-t border-border py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="max-w-2xl"
        >
          <p className="font-sans text-[13px] font-medium tracking-wide text-primary uppercase">
            How it works
          </p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.15] tracking-[-0.02em] text-foreground">
            Fund. Band. Start. Done.
          </h2>
        </motion.div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.35 }}
              className="relative"
            >
              {i < STEPS.length - 1 ? (
                <div className="absolute left-5 top-12 hidden h-[calc(100%-3rem)] w-px bg-border lg:block" />
              ) : null}
              <div className="relative z-10 flex size-10 items-center justify-center rounded-full bg-primary/5">
                <s.icon className="size-5 text-primary" />
              </div>
              <h3 className="mt-4 font-display text-[18px] font-medium tracking-tight text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 font-sans text-[14px] leading-relaxed text-muted-foreground">
                {s.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
