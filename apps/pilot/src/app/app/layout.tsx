import { AppProviders } from "@/providers/app-providers";
import { WalletAuthGate } from "@/components/auth/wallet-auth-gate";
import { AccessGate } from "@/components/auth/access-gate";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AccessGate>
        <WalletAuthGate>
          <AppShell>{children}</AppShell>
        </WalletAuthGate>
      </AccessGate>
    </AppProviders>
  );
}
