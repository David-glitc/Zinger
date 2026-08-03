"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "What is Zinger?",
    a: "Zinger is an automated trading agent for Polymarket CLOB. It evaluates directional signals on BTC and ETH 5m/15m binary markets and executes trades within risk bands you define.",
  },
  {
    q: "Do I need to hold a token to use it?",
    a: "No. Zinger has no token gate. Connect any EVM wallet on Polygon, fund paper or live pUSD, and start a session.",
  },
  {
    q: "How does the 1% deposit fee work?",
    a: "When you deposit paper credit or convert USDC to pUSD, 1% goes to the protocol fee. The rest credits your ledger. Withdrawals are free.",
  },
  {
    q: "Can I lose real money?",
    a: "Live mode trades your Polymarket CLOB balance. You can lose pUSD if the markets move against you. Start in paper mode to validate the strategy first.",
  },
  {
    q: "What markets does Zinger trade?",
    a: "Currently BTC and UP/DOWN tokens on 5m and 15m windows. 30m and 1h will activate when Polymarket Gamma lists them.",
  },
  {
    q: "How does Zinger decide when to enter?",
    a: "Zinger runs a signal model each cycle. If confidence exceeds your threshold and price is inside your entry band, it places a market order on the CLOB. Positions are held to settlement or a trailing stop.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="font-sans text-base font-medium text-foreground">{q}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="pb-5 font-serif text-[14px] leading-relaxed text-muted-foreground">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Faq() {
  return (
    <section id="faq" className="border-t border-border py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <p className="font-sans text-[13px] font-medium tracking-wide text-primary uppercase">
            Questions?
          </p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.15] tracking-[-0.02em] text-foreground">
            FAQ
          </h2>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mt-10"
        >
          {FAQS.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
