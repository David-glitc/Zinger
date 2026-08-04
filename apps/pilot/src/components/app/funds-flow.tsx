"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { money } from "@/lib/api";
import {
  Wallet,
  Landmark,
  Coins,
  Target,
  TrendingUp,
  Receipt,
  ArrowDownToLine,
  ArrowUpRight,
  Repeat,
  X,
} from "lucide-react";
import { CountUp } from "@/components/animations/count-up";

export interface FundsFlowData {
  mode: string;
  sessionRunning: boolean;
  depositedGross: number;
  withdrawn: number;
  platformFees: number;
  clobFees: number;
  cash: number;
  liveCash: number;
  depositWalletBalance: number;
  openCount: number;
  openSize: number;
  unrealized: number;
  realized: number;
  lifetimeBaseline: number | null;
  sessionCashPnl: number | null;
}

type NodeId = "baseline" | "deposited" | "depositwallet" | "clob" | "open" | "realized" | "fees" | "withdrawn";

interface FlowNode {
  id: NodeId;
  title: string;
  sub: string;
  value: number | null;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "green" | "rose" | "neutral";
  data?: Array<{ k: string; v: string }>;
  href?: string;
}

export function FundsFlow({ data }: { data: FundsFlowData }) {
  const live = data.mode === "live";
  const [selected, setSelected] = useState<NodeId | null>(null);

  const nodes: FlowNode[] = useMemo(() => {
    const base: FlowNode[] = [
      {
        id: "baseline",
        title: "Lifetime baseline",
        sub: "first CLOB sync",
        value: data.lifetimeBaseline,
        icon: Landmark,
        tone: "neutral",
        data: [
          { k: "First CLOB cash", v: money(data.lifetimeBaseline ?? 0) },
          { k: "Current CLOB cash", v: money(data.liveCash) },
          { k: "vs baseline", v: money((data.lifetimeBaseline != null ? data.liveCash - data.lifetimeBaseline : null) ?? null) },
        ],
      },
      {
        id: "deposited",
        title: "Deposited",
        sub: live ? "USDC → pUSD, 1% fee" : "paper credit, 1% fee",
        value: data.depositedGross,
        icon: ArrowDownToLine,
        tone: "blue",
        data: [
          { k: "Gross deposited", v: money(data.depositedGross) },
          { k: "Withdrawn", v: money(data.withdrawn) },
          { k: "Platform fees", v: money(data.platformFees) },
          { k: "Net in account", v: money(data.depositedGross - data.withdrawn - data.platformFees) },
        ],
      },
    ];
    if (!live) {
      base.splice(1, 1); // paper has no USDC split
    }
    return base;
  }, [data, live]);

  const allNodes: FlowNode[] = useMemo(() => {
    return [
      ...nodes,
      {
        id: "depositwallet",
        title: "Deposit wallet",
        sub: live ? "pUSD hold · swap mid-flight" : "ledger",
        value: data.depositWalletBalance,
        icon: Wallet,
        tone: "neutral",
        data: [
          { k: "pUSD balance", v: money(data.depositWalletBalance) },
          { k: "Converted from", v: money(data.depositedGross) },
          { k: "CLOB cash", v: money(data.liveCash) },
        ],
      },
      {
        id: "clob",
        title: "CLOB cash",
        sub: live ? `session PnL ${money(data.sessionCashPnl ?? null)}` : "execution",
        value: data.liveCash,
        icon: Coins,
        tone: "blue",
        href: "/app/vault",
        data: [
          { k: "Spendable", v: money(data.liveCash) },
          { k: "Session start", v: money(data.cash) },
          { k: "Session PnL", v: money(data.sessionCashPnl ?? null) },
          { k: "Reconciled", v: live ? "PM closed-book" : "paper" },
        ],
      },
      {
        id: "open",
        title: "Open positions",
        sub: `${data.openCount} live · ${money(data.unrealized)} unrealized`,
        value: data.openSize,
        icon: Target,
        tone: data.unrealized >= 0 ? "green" : "rose",
        href: "/app/book#open",
        data: [
          { k: "Open count", v: String(data.openCount) },
          { k: "Size at cost", v: money(data.openSize) },
          { k: "Unrealized PnL", v: money(data.unrealized) },
        ],
      },
      {
        id: "realized",
        title: "Realized PnL",
        sub: "closed wins − losses",
        value: realizedValue(data),
        icon: TrendingUp,
        tone: (data.realized ?? 0) >= 0 ? "green" : "rose",
        href: "/app/book#settled",
        data: [
          { k: "Realized PnL", v: money(data.realized) },
          { k: "Unrealized PnL", v: money(data.unrealized) },
          { k: "Net PnL", v: money((data.realized ?? 0) + (data.unrealized ?? 0)) },
        ],
      },
      {
        id: "fees",
        title: "Fees",
        sub: "platform + CLOB",
        value: data.platformFees + data.clobFees,
        icon: Receipt,
        tone: "rose",
        data: [
          { k: "Platform fees", v: money(data.platformFees) },
          { k: "CLOB / fill fees", v: money(data.clobFees) },
          { k: "Total drag", v: money(data.platformFees + data.clobFees) },
        ],
      },
      {
        id: "withdrawn",
        title: "Withdrawn",
        sub: "back to your wallet",
        value: data.withdrawn,
        icon: ArrowUpRight,
        tone: "neutral",
        data: [{ k: "Withdrawn total", v: money(data.withdrawn) }],
      },
    ];
  }, [nodes, data, live]);

  const selectedNode = selected ? allNodes.find((n) => n.id === selected) : null;

  function NodeCard({ node, dim }: { node: FlowNode; dim: boolean }) {
    const active = selected === node.id;
    return (
      <motion.button
        type="button"
        onClick={() => setSelected(active ? null : node.id)}
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "zg-frame zg-glass relative w-full overflow-hidden rounded-xl p-3 text-left transition-all",
          dim && "opacity-30 saturate-0",
          active && "ring-1 ring-primary/60 shadow-[0_0_24px_-6px_rgba(59,130,246,0.4)]",
          node.tone === "blue" && active && "border-primary/40",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <node.icon
            className={cn(
              "size-4",
              node.tone === "blue"
                ? "text-primary"
                : node.tone === "green"
                  ? "text-[var(--success)]"
                  : node.tone === "rose"
                    ? "text-destructive"
                    : "text-muted-foreground",
            )}
          />
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            {node.id}
          </span>
        </div>
        <p className="mt-1.5 truncate font-display text-[13px] font-[500] text-foreground">
          {node.title}
        </p>
        <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">{node.sub}</p>
        <p
          className={cn(
            "mt-1.5 font-mono text-lg font-semibold tabular-nums tracking-tight",
            node.tone === "blue"
              ? "text-primary"
              : node.tone === "green"
                ? "text-[var(--success)]"
                : node.tone === "rose"
                  ? "text-destructive"
                  : "text-foreground",
          )}
        >
          {node.value != null && Number.isFinite(node.value) ? (
            <CountUp value={node.value} prefix="$" className="" />
          ) : (
            "—"
          )}
        </p>
        {node.href ? (
          <span className="mt-1 inline-flex items-center gap-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
            open <ArrowUpRight className="size-2.5" />
          </span>
        ) : null}
      </motion.button>
    );
  }

  function Pipe({ active, down }: { active: boolean; down?: boolean }) {
    return (
      <div className="relative flex h-8 items-center justify-center">
        <div
          className={cn(
            "w-px border-l border-dashed transition-colors",
            active ? "border-primary/70" : "border-border/60",
            down ? "h-full" : "h-full",
          )}
        />
        {data.sessionRunning ? (
          <motion.span
            className="absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-primary"
            animate={{ top: ["20%", "80%"], opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      {/* Diagram */}
      <div className="zg-glass rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Funds flow · {live ? "live" : "paper"}
          </span>
          {data.sessionRunning ? (
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--success)]">
              <span className="zg-live-dot" /> streaming
            </span>
          ) : null}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {nodes.map((n) => (
            <NodeCard key={n.id} node={n} dim={false} />
          ))}
        </div>

        <Pipe active={!!selectedNode} />

        <NodeCard
          node={allNodes.find((n) => n.id === (live ? "clob" : "clob"))!}
          dim={!!selectedNode && selected !== "clob"}
        />

        <Pipe active={!!selectedNode} />

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {["open", "realized", "fees", "withdrawn"].map((id) => {
            const n = allNodes.find((x) => x.id === id)!;
            return <NodeCard key={id} node={n} dim={!!selectedNode && selected !== id} />;
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className="min-h-[160px]">
        <AnimatePresence mode="wait">
          {selectedNode ? (
            <motion.div
              key={selectedNode.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="zg-frame zg-glass sticky top-20 rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                    {selectedNode.id}
                  </p>
                  <h3 className="mt-0.5 font-display text-[15px] font-[500] text-foreground">
                    {selectedNode.title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-primary">
                {selectedNode.value != null && Number.isFinite(selectedNode.value) ? (
                  <CountUp value={selectedNode.value} prefix="$" />
                ) : (
                  "—"
                )}
              </p>
              {selectedNode.data?.length ? (
                <dl className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                  {selectedNode.data.map((d) => (
                    <div key={d.k} className="flex items-center justify-between gap-2">
                      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                        {d.k}
                      </dt>
                      <dd className="font-mono text-[12px] tabular-nums text-foreground">{d.v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {selectedNode.href ? (
                <a
                  href={selectedNode.href}
                  className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary hover:underline"
                >
                  inspect <ArrowUpRight className="size-3" />
                </a>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 p-4 text-center"
            >
              <Repeat className="size-5 text-muted-foreground/40" />
              <p className="max-w-[220px] font-mono text-[10px] leading-relaxed text-muted-foreground">
                Tap any stage to audit the money: where it entered, what it&apos;s doing now, and
                where it went.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function realizedValue(d: FundsFlowData) {
  return d.realized;
}
