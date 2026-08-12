"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useWalletAuth } from "@/hooks/use-wallet-auth";
import { WalletConnectButton } from "@/components/wallet/wallet-connect-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { clearToken } from "@/lib/access";

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
  const { authStatus, syncError, retrySync, disconnect: disconnectWallet } = useWalletAuth();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (authStatus === "syncing" || authStatus === "connecting") {
      const t = setTimeout(() => setStuck(true), 8000);
      return () => clearTimeout(t);
    }
    setStuck(false);
  }, [authStatus]);

  if (authStatus === "connecting" || authStatus === "syncing") {
    return stuck ? (
      <AuthShell>
        <p className="mb-2 text-sm text-muted-foreground">
          Taking longer than expected. Try reconnecting.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={retrySync} className="w-full">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Retry
          </Button>
          <Button variant="ghost" onClick={disconnectWallet} className="w-full text-muted-foreground">
            Disconnect
          </Button>
        </div>
      </AuthShell>
    ) : (
      <AuthShell>
        <span className="inline-flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {authStatus === "connecting" ? "Connecting wallet…" : "Syncing your account…"}
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
    const isForbidden =
      syncError instanceof Error &&
      "status" in syncError &&
      (syncError as { status?: number }).status === 403;

    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 px-4">
        <Alert variant="destructive">
          <AlertTitle>Could not sync account</AlertTitle>
          <AlertDescription>
            {isForbidden
              ? "This access is linked to a different wallet. Reset your access to continue."
              : syncError instanceof Error
                ? syncError.message
                : "Unknown error"}
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          {isForbidden ? (
            <Button
              onClick={() => {
                clearToken();
                disconnectWallet();
                window.location.reload();
              }}
            >
              Reset access
            </Button>
          ) : (
            <Button onClick={retrySync}>Retry</Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
