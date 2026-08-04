"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { WalletConnectCompact } from "@/components/wallet/wallet-connect-button";
import type { Mode } from "@/lib/api";
import {
  LayoutDashboard,
  BookOpen,
  Landmark,
  ArrowDownToLine,
  SlidersHorizontal,
  CandlestickChart,
  LogOut,
  Menu,
  X,
  ChevronLeft,
} from "lucide-react";

const NAV = [
  { href: "/app", icon: LayoutDashboard, label: "Command", hint: "Live position & session" },
  { href: "/app/charts", icon: CandlestickChart, label: "Charts", hint: "Market charts & signals" },
  { href: "/app/book", icon: BookOpen, label: "Book", hint: "Open, tape & settles" },
  { href: "/app/vault", icon: Landmark, label: "Vault", hint: "Execution account" },
  { href: "/app/fund", icon: ArrowDownToLine, label: "Fund", hint: "Deposit & swap" },
  { href: "/app/settings", icon: SlidersHorizontal, label: "Settings", hint: "Bands & risk" },
] as const;

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
    <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-border/70 bg-muted/40 p-0.5">
      {(["paper", "live"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            className={cn(
              "rounded-md px-3 py-1.5 font-sans text-[12px] font-medium capitalize tracking-wide transition-all",
              active
                ? m === "live"
                  ? "bg-[#ff4d5e]/90 text-white shadow-[0_0_18px_-4px_rgba(255,77,94,0.6)]"
                  : "bg-primary text-primary-foreground shadow-[0_0_18px_-4px_rgba(59,130,246,0.5)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

interface AppSidebarProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onDisconnect: () => void;
  busy: boolean;
}

export function AppSidebar({
  mode,
  onModeChange,
  onDisconnect,
  busy,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 font-sans text-[13px] transition-colors",
              active
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="zg-nav-active"
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_12px_rgba(59,130,246,0.7)]"
              />
            )}
            <item.icon
              className={cn(
                "size-[17px] shrink-0",
                active && "text-primary",
              )}
            />
            {!collapsed && (
              <span className={cn(active && "font-medium")}>{item.label}</span>
            )}
            {!collapsed && item.hint && !active && (
              <span className="ml-auto hidden font-mono text-[9px] text-muted-foreground/50 xl:block">
                {item.hint}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
      <span className="flex size-7 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
        <span className="zg-live-dot" />
      </span>
      {!collapsed && (
        <span className="font-display text-[17px] font-[500] tracking-tight text-foreground">
          Zinger
        </span>
      )}
    </div>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex items-center border-b border-border/70",
          collapsed ? "justify-center py-3" : "h-14 justify-between px-4",
        )}
      >
        {collapsed ? (
          brand
        ) : (
          <>
            <Link href="/">{brand}</Link>
            <button
              onClick={() => setCollapsed(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="size-4" />
            </button>
          </>
        )}
      </div>

      <div className={cn("flex-1 overflow-y-auto", collapsed ? "px-2 py-4" : "px-3 py-4")}>
        <div className={cn("mb-5", collapsed && "flex flex-col items-center")}>
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
            {collapsed ? "" : "Mode"}
          </p>
          <ModeRail mode={mode} onChange={onModeChange} disabled={busy} />
        </div>

        <div className="mb-4 border-t border-border/50" />

        {nav}

        <div className="mt-6 border-t border-border/50 pt-4">
          {!collapsed && (
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
              Network
            </p>
          )}
          <div className="zg-chip justify-center">
            <span className="size-1.5 rounded-full bg-[var(--success)]" />
            Polygon · 137
          </div>
        </div>
      </div>

      <div
        className={cn(
          "border-t border-border/70 p-3",
          collapsed && "flex flex-col items-center gap-2",
        )}
      >
        <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
          {!collapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDisconnect}
              className="flex-1 justify-start rounded-lg text-[12px] text-muted-foreground hover:text-foreground"
            >
              <LogOut className="mr-1.5 size-3.5" />
              Disconnect
            </Button>
          )}
          {collapsed && (
            <button
              onClick={onDisconnect}
              className="rounded-lg border border-border p-2 text-muted-foreground"
              aria-label="Disconnect"
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>
        <div className={cn("mt-2 [&_button]:w-full", collapsed && "mt-2")}>
          <WalletConnectCompact />
        </div>
        <div className={cn("mt-2", collapsed && "flex justify-center")}>
          <ThemeToggle className="w-full" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile header */}
      <div className="sticky top-0 z-40 flex h-13 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-md lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded border border-primary/30 bg-primary/10">
            <span className="zg-live-dot" />
          </span>
          <span className="font-display text-[16px] font-[500] tracking-tight text-foreground">
            Zinger
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border-border"
            aria-label="Open menu"
          >
            <Menu className="size-4 text-foreground" />
          </Button>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden h-svh flex-col border-r border-border/70 bg-sidebar transition-all duration-200 lg:sticky lg:top-0 lg:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-svh w-72 flex-col border-r border-border/70 bg-sidebar"
          >
            <div className="flex h-14 items-center justify-between border-b border-border/70 px-4">
              {brand}
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <button onClick={() => setMobileOpen(false)} className="text-muted-foreground">
                  <X className="size-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4">
                <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
                  Mode
                </p>
                <ModeRail mode={mode} onChange={onModeChange} disabled={busy} />
              </div>
              <div className="mb-4 border-t border-border/50" />
              <nav className="flex flex-col gap-1">{nav}</nav>
            </div>
            <div className="border-t border-border/70 p-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDisconnect}
                  className="rounded-lg border-border text-muted-foreground"
                >
                  <LogOut className="mr-1 size-3.5" />
                  Disconnect
                </Button>
              </div>
              <div className="mt-2 [&_button]:w-full">
                <WalletConnectCompact />
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </>
  );
}
