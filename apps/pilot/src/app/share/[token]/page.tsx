import type { Metadata } from "next";
import { ShareCard } from "./share-card";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  return {
    title: `Zinger PnL · ${token}`,
    description: "Trade result on Zinger — wallet-native Polymarket trading.",
    openGraph: {
      title: `Zinger Trade · ${token}`,
      description: "Automated prediction market trading on Polymarket.",
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  return <ShareCard token={token} />;
}
