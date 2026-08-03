"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useWalletAuth } from "@/hooks/use-wallet-auth";
import { WalletConnectButton } from "@/components/wallet/wallet-connect-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md border-border/60">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Zinger</CardTitle>
          <CardDescription>{children}</CardDescription>
        </CardHeader>
      </Card>
      <Button variant="ghost" className="mt-6" asChild>
        <Link href="/">← Back to home</Link>
      </Button>
    </div>
  );
}

export function WalletAuthGate({ children }: { children: React.ReactNode }) {
  const { authStatus, syncError, retrySync } = useWalletAuth();

  if (authStatus === "connecting" || authStatus === "syncing") {
    return (
      <AuthShell>
        <span className="inline-flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {authStatus === "connecting" ? "Connecting wallet…" : "Provisioning your trading account…"}
        </span>
      </AuthShell>
    );
  }

  if (authStatus === "disconnected") {
    return (
      <AuthShell>
        <p className="mb-4">Connect a Polygon wallet to open your dashboard.</p>
        <CardContent className="flex justify-center px-6 pb-6">
          <WalletConnectButton size="lg" label="Connect wallet" />
        </CardContent>
      </AuthShell>
    );
  }

  if (authStatus === "error") {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 px-4">
        <Alert variant="destructive">
          <AlertTitle>Could not sync account</AlertTitle>
          <AlertDescription>
            {syncError instanceof Error ? syncError.message : "Unknown error"}
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button onClick={retrySync}>Retry</Button>
          <Button variant="outline" asChild>
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
