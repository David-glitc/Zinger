"use client";

import { motion } from "motion/react";
import { useGeoblock } from "@/hooks/use-intelligence";
import { AlertTriangle, CheckCircle, Globe, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PulseDot } from "@/components/animations/pulse-dot";

export function GeoblockStatus() {
  const { data, isLoading, isError } = useGeoblock();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-2 font-mono text-[10px]"
    >
      {isLoading ? (
        <>
          <Globe className="size-3 animate-pulse text-muted-foreground" />
          <span className="text-muted-foreground">Checking geo…</span>
        </>
      ) : isError || !data ? (
        <>
          <XCircle className="size-3 text-destructive" />
          <span className="text-destructive">Geo check failed</span>
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2"
        >
          {data.geoblock?.blocked ? (
            <XCircle className="size-3 text-destructive" />
          ) : (
            <CheckCircle className="size-3 text-[var(--success)]" />
          )}
          <span className={cn(data.geoblock?.blocked ? "text-destructive" : "text-[var(--success)]")}>
            {data.geoblock?.country || data.region.toUpperCase()}
          </span>
          <span className="text-muted-foreground">· {data.region}</span>
          {data.geoblock?.blocked ? (
            <span className="text-destructive">BLOCKED</span>
          ) : (
            <>
              <PulseDot active={true} className="text-[var(--success)]" />
              <span className="text-[var(--success)]">OK</span>
            </>
          )}
          {data.latencyMs && (
            <span className="text-muted-foreground">· {data.latencyMs}ms</span>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

export function GeoblockAlert() {
  const { data } = useGeoblock();
  const blocked = data?.geoblock?.blocked === true;

  return (
    <motion.div
      initial={blocked ? { opacity: 0, y: -12, height: 0 } : false}
      animate={blocked ? { opacity: 1, y: 0, height: "auto" } : { opacity: 0, height: 0 }}
      className={cn("overflow-hidden", !blocked && "pointer-events-none")}
    >
      {blocked ? (
        <div className="flex items-center gap-2 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] text-destructive">
          <AlertTriangle className="size-3 shrink-0" />
          <span>
            Deploy region <strong>{data?.region}</strong> ({data?.geoblock?.country}) is geo-blocked
            by Polymarket. Re-deploy to a non-blocked region: Ireland (<code>dub1</code>), Germany (
            <code>fra1</code>), or Singapore (<code>sin1</code>).
          </span>
        </div>
      ) : null}
    </motion.div>
  );
}
