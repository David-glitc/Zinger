"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { useAppState } from "@/hooks/use-app-state";
import { useWalletAuth } from "@/hooks/use-wallet-auth";
import { useAccessKind } from "@/hooks/use-access-kind";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { mode, setMode, busy } = useAppState();
  const { disconnect } = useWalletAuth();
  const accessKind = useAccessKind();

  return (
    <div className="min-h-svh lg:flex">
      <AppSidebar
        mode={mode}
        onModeChange={setMode}
        onDisconnect={disconnect}
        busy={busy}
        accessKind={accessKind}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
