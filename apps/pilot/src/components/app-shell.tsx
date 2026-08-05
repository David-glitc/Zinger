"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { useAppState } from "@/hooks/use-app-state";
import { useWalletAuth } from "@/hooks/use-wallet-auth";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { mode, setMode, busy } = useAppState();
  const { disconnect } = useWalletAuth();

  return (
    <div className="min-h-svh lg:flex">
      <AppSidebar
        mode={mode}
        onModeChange={setMode}
        onDisconnect={disconnect}
        busy={busy}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
