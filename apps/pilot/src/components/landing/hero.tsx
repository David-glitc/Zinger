"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

function DashboardCta({ size = "lg" }: { size?: "default" | "lg" }) {
  const router = useRouter();
  return (
    <Button
      size={size}
      className="zg-volt-btn rounded-xl px-8 text-white"
      onClick={() => router.push("/app")}
    >
      Launch app
    </Button>
  );
}

export default function Hero() {
  return (
    <section className="relative mx-auto flex min-h-[85vh] max-w-6xl flex-col justify-center px-6 pb-24 pt-28 sm:px-8 sm:pt-32">
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="font-sans text-base font-medium tracking-wide text-primary"
      >
        Zinger for Polymarket
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="mt-4 max-w-4xl font-display text-[clamp(2.5rem,8vw,5.5rem)] leading-[1.08] tracking-[-0.03em] text-foreground"
      >
        Trade Polymarket
        <br />
        <span className="text-primary">on autopilot</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="mt-5 max-w-2xl font-serif text-lg leading-relaxed text-muted-foreground sm:text-xl"
      >
        Connect your wallet, set risk bands, and let Zinger execute directional
        BTC/ETH trades on Polymarket CLOB. No token gate. No gas hacks.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center"
      >
        <DashboardCta size="lg" />
        <Button
          variant="ghost"
          size="lg"
          asChild
          className="rounded-2xl px-6 text-muted-foreground"
        >
          <Link href="#how">How it works</Link>
        </Button>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.4 }}
        className="mt-8 flex flex-wrap gap-4 text-sm text-muted-foreground"
      >
        <span>Powered by Polymarket CLOB</span>
        <span className="hidden sm:inline">·</span>
        <span>Paper & live</span>
        <span className="hidden sm:inline">·</span>
        <span>1% deposit fee</span>
        <span className="hidden sm:inline">·</span>
        <span>No token gate</span>
      </motion.div>
    </section>
  );
}
