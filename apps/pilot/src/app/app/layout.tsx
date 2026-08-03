import { WalletAuthGate } from "@/components/auth/wallet-auth-gate";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletAuthGate>
      <AppShell>{children}</AppShell>
    </WalletAuthGate>
  );
}
