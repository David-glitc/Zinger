import { createConfig, http } from "wagmi";
import { polygon } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "demo";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [
        injectedWallet,
        metaMaskWallet,
        rainbowWallet,
        coinbaseWallet,
        safeWallet,
        walletConnectWallet,
      ],
    },
  ],
  {
    appName: "Zinger",
    projectId: WC_PROJECT_ID,
  },
);

export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors,
  transports: {
    [polygon.id]: http("https://polygon-bor.publicnode.com"),
  },
  ssr: true,
});
