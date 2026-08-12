"use client";

import { motion } from "motion/react";
import {
  Brain,
  Gauge,
  Shield,
  Zap,
  BarChart3,
  Wallet,
} from "lucide-react";

const FEATURES = [
  {
    icon: Brain,
    title: "Signal-driven entries",
    desc: "Zinger evaluates BTC/ETH directional signals every cycle and only enters when confidence meets your threshold.",
  },
  {
    icon: Shield,
    title: "Risk bands you control",
    desc: "Set max position size, confidence floor, entry price range, and asset whitelist. The agent can't break your rules.",
  },
  {
    icon: Gauge,
    title: "Paper first, live later",
    desc: "Start in paper mode with fake credit. When you trust the strategy, flip to live and trade your own pUSD.",
  },
  {
    icon: Zap,
    title: "No token gate",
    desc: "No $ZINGER to buy, no staking, no lockups. Just connect your wallet, fund, and trade.",
  },
  {
    icon: BarChart3,
    title: "Real-time tape & settles",
    desc: "Watch every fill, settlement, and P&L tick in the dashboard. No blind spots.",
  },
  {
    icon: Wallet,
    title: "Wallet-native auth",
    desc: "Sign with your own wallet. No email, no password, no custodial risk. Your keys, your pUSD.",
  },
];

export default function Features() {
  return (
    <section id="features" className="border-t border-border py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="max-w-2xl"
        >
          <p className="font-sans text-[13px] font-medium tracking-wide text-primary uppercase">
            Built for crypto natives
          </p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.15] tracking-[-0.02em] text-foreground">
            Everything you need, nothing you don&apos;t
          </h2>
          <p className="mt-3 font-sans text-base leading-relaxed text-muted-foreground">
            Zinger is a lean, opinionated trading agent for Polymarket CLOB.
            It pairs your risk rules with directional signals and executes on
            5m and 15m windows.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.35 }}
            >
              <div className="group rounded-xl border border-border bg-background p-6 transition-all duration-200 hover:shadow-[rgba(0,0,0,0.08)_0px_8px_24px_0px] hover:border-primary/20">
                <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-primary/5">
                  <f.icon className="size-5 text-primary" />
                </div>
                <h3 className="font-display text-[17px] font-medium tracking-tight text-foreground">
                  {f.title}
                </h3>
                <p className="mt-2 font-sans text-[14px] leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
