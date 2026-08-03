export type IntelligenceData = {
  timestamp: number;
  signals?: {
    btc: { direction: string; confidence: number; score: number; action: string } | null;
    eth: { direction: string; confidence: number; score: number; action: string } | null;
  };
  models?: Array<{ name: string; status: string; accuracy: number | null; samples: number }>;
  geoblock?: {
    blocked: boolean | null;
    ip: string | null;
    country: string | null;
    region: string | null;
    viaProxy: boolean;
  };
  proxyStatus?: {
    ok: boolean;
    configured: boolean;
    latencyMs: number | null;
    detail: string;
  };
  paper?: {
    equity: number;
    cash: number;
    realizedPnl: number;
    winRate: number | null;
    wins: number;
    losses: number;
    openCount: number;
  };
};

export type GeoblockStatus = {
  ok: boolean;
  timestamp: number;
  region: string;
  clobReachable: boolean;
  polymarketReachable: boolean;
  geoblock: {
    blocked: boolean | null;
    ip: string | null;
    country: string | null;
  } | null;
  latencyMs: number;
  proxy: string;
};

export async function getIntelligence(): Promise<IntelligenceData> {
  const res = await fetch("/api/intelligence");
  if (!res.ok) throw new Error("intelligence unavailable");
  return res.json();
}

export async function getGeoblock(): Promise<GeoblockStatus> {
  const res = await fetch("/api/geoblock");
  if (!res.ok) throw new Error("geoblock check failed");
  return res.json();
}

export async function proxyClob(path: string, init?: RequestInit) {
  const res = await fetch(`/api/proxy/clob${path}`, init);
  if (!res.ok) throw new Error(`clob proxy: ${res.status}`);
  return res.json();
}

export async function proxyGamma(path: string, init?: RequestInit) {
  const res = await fetch(`/api/proxy/gamma${path}`, init);
  if (!res.ok) throw new Error(`gamma proxy: ${res.status}`);
  return res.json();
}
