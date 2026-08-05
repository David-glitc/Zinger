"use client";

import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { WaitlistForm } from "@/components/waitlist-form";

export default function Waitlist() {
  return (
    <section id="waitlist" className="border-t border-border py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            <Sparkles className="size-3" /> Mainnet alpha
          </span>
          <h2 className="mt-4 font-display text-[clamp(1.75rem,4vw,2.75rem)] leading-[1.12] tracking-[-0.02em] text-foreground">
            Be first in the vault.
          </h2>
          <p className="mx-auto mt-4 max-w-lg font-serif text-[16px] leading-relaxed text-muted-foreground">
            The live vault opens to a small group first. Drop your email and X
            handle and we&apos;ll send your access code the day it does.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="mt-8"
        >
          <WaitlistForm />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-6 text-center font-sans text-sm text-muted-foreground"
        >
          Paper mode is free today — no signup needed to try the agent on
          testnet balances.
        </motion.p>
      </div>
    </section>
  );
}
