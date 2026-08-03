"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { Mode } from "@/lib/api";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WalletConnectCompact } from "@/components/wallet/wallet-connect-button";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

const NAV: Array<{ href: string; label: string; external?: boolean }> = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
  { href: "https://play.zinger.kierkegaard.space", label: "Playground", external: true },
];

export function ModeRail({
  mode,
  onChange,
  disabled,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => v && onChange(v as Mode)}
      disabled={disabled}
      variant="outline"
      size="sm"
      className="rounded-2xl border-border bg-background"
    >
      <ToggleGroupItem
        value="paper"
        aria-label="Paper mode"
        className="rounded-2xl px-4 font-sans text-[13px] font-medium tracking-normal data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        Paper
      </ToggleGroupItem>
      <ToggleGroupItem
        value="live"
        aria-label="Live mode"
        className="rounded-2xl px-4 font-sans text-[13px] font-medium tracking-normal data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        Live
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function SiteHeader({
  children,
  showNav = true,
  ctaHref = "/app",
}: {
  children?: React.ReactNode;
  showNav?: boolean;
  ctaHref?: string;
}) {
  const router = useRouter();

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-8">
        <Link
          href="/"
          className="shrink-0 font-sans text-[18px] font-[400] tracking-tight text-foreground"
        >
          Zinger
        </Link>

        {showNav ? (
          <nav className="hidden items-center gap-6 text-base text-muted-foreground md:flex">
            {NAV.map((item, i) =>
              item.external ? (
                <motion.a
                  key={item.href}
                  href={item.href}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.3 }}
                  className="font-sans transition-colors hover:text-foreground"
                >
                  {item.label}
                </motion.a>
              ) : (
                <motion.a
                  key={item.href}
                  href={item.href}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.3 }}
                  className="font-sans transition-colors hover:text-foreground"
                >
                  {item.label}
                </motion.a>
              ),
            )}
          </nav>
        ) : null}

        <div className="flex items-center gap-2 sm:gap-3">
          {children}
          {showNav ? (
            <>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                <Button
                  size="sm"
                  className="hidden rounded-2xl bg-primary px-4 text-primary-foreground hover:bg-primary/90 sm:inline-flex"
                  onClick={() => router.push(ctaHref)}
                >
                  Dashboard
                </Button>
              </motion.div>
              <div className="hidden sm:block">
                <WalletConnectCompact />
              </div>
              <Sheet>
                <SheetTrigger asChild className="md:hidden">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Open menu"
                    className="rounded-2xl border-border"
                  >
                    <Menu className="size-4 text-foreground" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72 border-border bg-background">
                  <nav className="mt-8 flex flex-col gap-4">
                    {NAV.map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className="font-sans text-base text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {item.label}
                      </a>
                    ))}
                    <Button
                      className="mt-4 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => router.push(ctaHref)}
                    >
                      Open dashboard
                    </Button>
                    <WalletConnectCompact />
                  </nav>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            <WalletConnectCompact />
          )}
        </div>
      </div>
    </motion.header>
  );
}
