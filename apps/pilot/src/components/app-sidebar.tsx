"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { WalletConnectCompact } from "@/components/wallet/wallet-connect-button";
import type { Mode } from "@/lib/api";
import {
  LayoutDashboard,
  CandlestickChart,
  BookOpen,
  Landmark,
  ArrowDownToLine,
  SlidersHorizontal,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const NAV = [
  { href: "/app", icon: LayoutDashboard, label: "Command" },
  { href: "/app/charts", icon: CandlestickChart, label: "Charts" },
  { href: "/app/book", icon: BookOpen, label: "Book" },
  { href: "/app/vault", icon: Landmark, label: "Vault" },
  { href: "/app/fund", icon: ArrowDownToLine, label: "Fund" },
  { href: "/app/settings", icon: SlidersHorizontal, label: "Settings" },
] as const;

function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-lg border border-border/70 bg-muted/50 p-0.5">
      {(["paper", "live"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-center font-sans text-[12px] font-medium capitalize transition-colors",
              active
                ? m === "live"
                  ? "bg-red-500 text-white shadow-[0_0_14px_-4px_rgba(239,68,68,0.5)]"
                  : "bg-primary text-primary-foreground shadow-[0_0_14px_-4px_rgba(59,130,246,0.5)]"
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

function NavItems({ collapsed }: { collapsed?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
              active
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <item.icon className={cn("size-[18px] shrink-0", active && "text-primary")} />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent({
  mode,
  onModeChange,
  onDisconnect,
  busy,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onDisconnect: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border/70 px-4">
        <span className="flex size-7 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
          <span className="size-2 rounded-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.7)]" />
        </span>
        <Link href="/" className="font-display text-[16px] font-medium tracking-tight text-foreground">
          Zinger
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-1.5 px-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
          Mode
        </div>
        <ModeToggle mode={mode} onChange={onModeChange} disabled={busy} />

        <div className="my-4 border-t border-border/50" />

        <NavItems />
      </div>

      <div className="shrink-0 border-t border-border/70 px-3 py-3">
        <div className="flex items-center justify-center rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5">
          <span className="size-1.5 rounded-full bg-[var(--success)]" />
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">Polygon</span>
        </div>

        <div className="mt-2.5 [&_button]:w-full">
          <WalletConnectCompact />
        </div>

        <div className="mt-2 flex items-center gap-1">
          <ThemeToggle className="flex-1" />
          <button
            onClick={onDisconnect}
            className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            <span>Disconnect</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface AppSidebarProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onDisconnect: () => void;
  busy: boolean;
}

export function AppSidebar({ mode, onModeChange, onDisconnect, busy }: AppSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="sticky top-0 z-40 flex h-13 items-center justify-between border-b border-border/70 bg-background/95 px-4 backdrop-blur-md lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded border border-primary/30 bg-primary/10">
            <span className="size-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
          </span>
          <span className="font-display text-[16px] font-medium tracking-tight text-foreground">
            Zinger
          </span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
      </div>

      <aside className="hidden h-svh w-[212px] shrink-0 flex-col border-r border-border/70 bg-sidebar lg:sticky lg:top-0 lg:flex">
        <SidebarContent mode={mode} onModeChange={onModeChange} onDisconnect={onDisconnect} busy={busy} />
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-svh w-[260px] flex-col border-r border-border/70 bg-sidebar shadow-2xl"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
                  <span className="zg-live-dot" />
                </span>
                <Link href="/" className="font-display text-[16px] font-medium tracking-tight text-foreground">
                  Zinger
                </Link>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
                aria-label="Close navigation"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
              <div className="mb-1.5 px-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
                Mode
              </div>
              <ModeToggle mode={mode} onChange={onModeChange} disabled={busy} />

              <div className="my-4 border-t border-border/50" />

              <NavItems />
            </div>

            <div className="shrink-0 border-t border-border/70 px-3 py-3">
              <div className="[&_button]:w-full">
                <WalletConnectCompact />
              </div>
              <div className="mt-2 flex items-center gap-1">
                <ThemeToggle className="flex-1" />
                <button
                  onClick={() => { onDisconnect(); setMobileOpen(false); }}
                  className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <LogOut className="size-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
