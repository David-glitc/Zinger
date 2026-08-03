import { API_BASE } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignalEntry = {
  direction: string;
  confidence: number;
  score: number;
  action: string;
};

type ModelEntry = {
  name: string;
  status: string;
  accuracy: number | null;
  samples: number;
};

type GeoblockEntry = {
  blocked: boolean | null;
  ip: string | null;
  country: string | null;
  region: string | null;
  viaProxy: boolean;
};

type ProxyEntry = {
  ok: boolean;
  configured: boolean;
  latencyMs: number | null;
  detail: string;
};

type PaperEntry = {
  equity: number;
  cash: number;
  realizedPnl: number;
  winRate: number | null;
  wins: number;
  losses: number;
  openCount: number;
};

type IntelligencePayload = {
  timestamp: number;
  signals: { btc: SignalEntry | null; eth: SignalEntry | null } | null;
  models: ModelEntry[];
  geoblock: GeoblockEntry | null;
  proxyStatus: ProxyEntry;
  paper: PaperEntry | null;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown, fallback = ""): string {
  return v != null ? String(v) : fallback;
}

function nullableStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function extractSignal(src: Record<string, unknown> | undefined): SignalEntry | null {
  if (!src) return null;
  return {
    direction: str(src.direction, "neutral"),
    confidence: num(src.confidence, 0),
    score: num(src.score, 0),
    action: str(src.action, "hold"),
  };
}

function extractPaper(src: Record<string, unknown> | null | undefined): PaperEntry | null {
  if (!src) return null;
  const openArr = Array.isArray(src.open) ? src.open : [];
  return {
    equity: num(src.equity, 0),
    cash: num(src.cash, 0),
    realizedPnl: num(src.realizedPnl, 0),
    winRate: nullableNum(src.winRate),
    wins: num(src.wins, 0),
    losses: num(src.losses, 0),
    openCount: num(src.openCount, openArr.length),
  };
}

function extractModels(src: unknown): ModelEntry[] {
  if (!Array.isArray(src)) return [];
  return src.map((m: Record<string, unknown>) => ({
    name: str(m.name, "?"),
    status: str(m.status, "unknown"),
      accuracy: nullableNum(m.accuracy),
    samples: num(m.samples, 0),
  }));
}

function extractGeoblock(src: Record<string, unknown> | undefined): GeoblockEntry | null {
  if (!src) return null;
  return {
      blocked: src.blocked != null ? Boolean(src.blocked) : null,
      ip: nullableStr(src.ip),
      country: nullableStr(src.country),
      region: nullableStr(src.region),
    viaProxy: bool(src.viaProxy, false),
  };
}

function extractProxy(src: Record<string, unknown> | null): ProxyEntry {
  if (!src) return { ok: false, configured: false, latencyMs: null, detail: "unreachable" };
  return {
    ok: bool(src.ok, false),
    configured: bool(src.configured, false),
    latencyMs: nullableNum(src.latencyMs),
    detail: str(src.detail, "no proxy"),
  };
}

export async function GET() {
  const base = API_BASE;

  const [stateRes, geoblockRes, proxyRes] = await Promise.all([
    fetchJson<Record<string, unknown>>(`${base}/pilot`),
    fetchJson<Record<string, unknown>>(`${base}/../poly/state?lean=1`),
    fetchJson<Record<string, unknown>>(`${base}/proxy-health`),
  ]);

  const signalsRaw = stateRes?.signals as Record<string, unknown> | undefined;
  const paperRaw = stateRes?.paper as Record<string, unknown> | undefined;
  const geoblockRaw = geoblockRes?.geoblock as Record<string, unknown> | undefined;
  const modelsRaw = geoblockRes?.models;

  const payload: IntelligencePayload = {
    timestamp: Date.now(),
    signals: signalsRaw
      ? {
          btc: extractSignal(signalsRaw.btc as Record<string, unknown> | undefined),
          eth: extractSignal(signalsRaw.eth as Record<string, unknown> | undefined),
        }
      : null,
    models: extractModels(modelsRaw),
    geoblock: extractGeoblock(geoblockRaw),
    proxyStatus: extractProxy(proxyRes),
    paper: extractPaper(paperRaw),
  };

  return Response.json(payload, {
    headers: { "cache-control": "no-cache, max-age=2" },
  });
}
