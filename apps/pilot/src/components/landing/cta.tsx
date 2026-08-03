"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { WalletConnectButton } from "@/components/wallet/wallet-connect-button";

export default function Cta() {
  const router = useRouter();
  return (
    <section className="border-t border-border py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 text-center sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="font-display text-[clamp(1.75rem,4vw,2.75rem)] leading-[1.12] tracking-[-0.02em] text-foreground">
            Ready to trade on autopilot?
          </h2>
          <p className="mx-auto mt-4 max-w-lg font-serif text-[16px] leading-relaxed text-muted-foreground">
            Connect your wallet, set your bands, and start the session. Paper
            mode is free — live mode trades your Polymarket pUSD.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <WalletConnectButton
              size="lg"
              className="rounded-2xl bg-primary px-10 text-white hover:bg-primary/90 shadow-lg"
              label="Connect wallet"
              connectedLabel="Open dashboard"
              onConnectedClick={() => router.push("/app")}
            />
          </div>
          <p className="mt-6 font-sans text-sm text-muted-foreground">
            No token gate · No email · No custodial risk
          </p>
        </motion.div>
      </div>
    </section>
  );
}
