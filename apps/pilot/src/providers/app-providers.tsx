"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { polygon } from "wagmi/chains";
import { useTheme } from "next-themes";
import { wagmiConfig } from "@/config/web3";
import { getQueryClient } from "@/lib/query-client";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={polygon}
          modalSize="compact"
          theme={
            dark
              ? darkTheme({
                  accentColor: "#3b82f6",
                  accentColorForeground: "#ffffff",
                  borderRadius: "medium",
                  overlayBlur: "small",
                })
              : lightTheme({
                  accentColor: "#2563eb",
                  accentColorForeground: "#ffffff",
                  borderRadius: "medium",
                  overlayBlur: "small",
                })
          }
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
