"use client";

import { SiteHeader } from "@/components/site-header";
import Hero from "@/components/landing/hero";
import Features from "@/components/landing/features";
import Stats from "@/components/landing/stats";
import Faq from "@/components/landing/faq";
import Cta from "@/components/landing/cta";
import HowItWorks from "@/components/landing/how-it-works";

export default function LandingPage() {
  return (
    <div className="relative min-h-svh bg-background">
      <div className="pointer-events-none fixed inset-0 -z-10 zg-aurora" />
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh] zg-grid" />
      <SiteHeader />
      <Hero />
      <Features />
      <HowItWorks />
      <Stats />
      <Faq />
      <Cta />
      <footer className="border-t border-border py-8 text-center font-sans text-sm text-muted-foreground">
        <div className="mx-auto max-w-6xl px-6 sm:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <a href="/app" className="transition-colors hover:text-foreground">Dashboard</a>
            <a href="https://play.zinger.kierkegaard.space" className="transition-colors hover:text-foreground">Playground</a>
            <a href="https://zinger.kierkegaard.space" className="transition-colors hover:text-foreground">API</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
            <span className="text-border">·</span>
            <span>Powered by Polymarket CLOB</span>
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground/70">
            Zinger v0.2 · Autonomous trading agent for Polymarket
          </p>
        </div>
      </footer>
    </div>
  );
}
