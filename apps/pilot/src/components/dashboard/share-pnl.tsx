"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Share2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SharePnlProps {
  pnl: number;
  entryPrice?: number | string | null;
  exitPrice?: number | string | null;
  outcome?: string | null;
  asset?: string | null;
  slug?: string | null;
  size?: "sm" | "default";
}

export function SharePnl({
  pnl,
  entryPrice,
  exitPrice,
  outcome,
  asset,
  slug,
  size = "default",
}: SharePnlProps) {
  const [loading, setLoading] = useState(false);

  async function share() {
    setLoading(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pnl,
          entryPrice: entryPrice != null ? String(entryPrice) : undefined,
          exitPrice: exitPrice != null ? String(exitPrice) : undefined,
          outcome,
          asset,
          slug,
        }),
      });
      const data = (await res.json()) as { ok: boolean; token?: string; error?: string };

      if (!data.ok || !data.token) {
        toast.error("Couldn't create share link");
        return;
      }

      const url = `${window.location.origin}/share/${data.token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied", {
        description: url,
      });
    } catch {
      toast.error("Failed to create share link");
    } finally {
      setLoading(false);
    }
  }

  if (size === "sm") {
    return (
      <button
        type="button"
        disabled={loading}
        onClick={share}
        className="inline-flex items-center gap-1 rounded-md p-1 text-muted-foreground/60 hover:text-foreground disabled:opacity-50"
        title="Share trade"
      >
        {loading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Share2 className="size-3" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={share}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground",
        loading && "opacity-50",
      )}
    >
      {loading ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Share2 className="size-3" />
      )}
      Share
    </button>
  );
}
