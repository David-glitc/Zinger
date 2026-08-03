import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk, Instrument_Serif } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AppProviders } from "@/providers/app-providers";
import { ThemeProvider } from "@/providers/theme-provider";
import "@/styles/globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "Zinger — wallet-native Polymarket trading",
    template: "%s · Zinger",
  },
  description:
    "Connect your wallet, fund, set bands, start a session. Zinger automates BTC/ETH prediction market trading inside your risk rules.",
  metadataBase: new URL("https://usezinger.xyz"),
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    siteName: "Zinger",
    title: "Zinger — wallet-native Polymarket trading",
    description:
      "Connect your wallet, fund, set bands, start a session. Zinger automates BTC/ETH prediction market trading inside your risk rules.",
    url: "https://usezinger.xyz",
    locale: "en_US",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Zinger — wallet-native Polymarket trading",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Zinger — wallet-native Polymarket trading",
    description:
      "Connect your wallet, fund, set bands, start a session. Zinger automates BTC/ETH prediction market trading inside your risk rules.",
    images: ["/og-image.svg"],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#050607",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${display.variable} ${sans.variable} ${mono.variable} ${serif.variable}`}
    >
      <body className="zg-noise min-h-svh bg-background font-[family-name:var(--font-sans)] text-foreground antialiased">
        <ThemeProvider>
          <AppProviders>
            {children}
            <Toaster richColors position="top-center" />
          </AppProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
