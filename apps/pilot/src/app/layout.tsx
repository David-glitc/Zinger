import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/providers/theme-provider";
import "@/styles/globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const display = Geist({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
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
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="min-h-svh bg-background font-[family-name:var(--font-sans)] text-foreground antialiased">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
