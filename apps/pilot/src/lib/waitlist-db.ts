import { getCollection } from "./mongo";
import crypto from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

function getTokenSecret(): string {
  if (TOKEN_SECRET) return TOKEN_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ACCESS_TOKEN_SECRET is required in production");
  }
  return "zg-local-dev-secret";
}

function generateCode(length = 8): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function signToken(payload: Record<string, unknown>): string {
  const secret = getTokenSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const secret = getTokenSecret();
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && typeof payload.exp === "number" && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface WaitlistEntry {
  email: string;
  xHandle: string;
  code: string | null;
  sent: boolean;
  used: boolean;
  usedAt: number | null;
  wallet: string | null;
  createdAt: number;
}

export async function addToWaitlist(email: string, xHandle = "") {
  const col = await getCollection("waitlist");
  const existing = await col.findOne({ email });
  if (existing) return { already: true };

  await col.insertOne({
    email,
    xHandle,
    code: null,
    sent: false,
    used: false,
    usedAt: null,
    wallet: null,
    createdAt: Date.now(),
  });
  return { already: false };
}

export async function getWaitlistCount() {
  const col = await getCollection("waitlist");
  return col.countDocuments();
}

export async function generateAccessCode(email: string) {
  const col = await getCollection("waitlist");
  const entry = await col.findOne({ email });
  if (!entry) return null;

  if (entry.code) {
    return { code: entry.code, email, existing: true };
  }

  const code = generateCode(8);
  await col.updateOne({ email }, { $set: { code } });
  return { code, email, existing: false };
}

export async function sendAccessCode(email: string) {
  const col = await getCollection("waitlist");
  const entry = await col.findOne({ email });
  if (!entry) return { error: "not_on_waitlist" };

  let code = entry.code;
  if (!code) {
    code = generateCode(8);
    await col.updateOne({ email }, { $set: { code } });
  }

  await col.updateOne({ email }, { $set: { sent: true } });

  return { code, email, sent: true };
}

export async function validateCode(code: string, wallet?: string): Promise<{
  ok: boolean;
  error?: string;
  token?: string;
  email?: string;
  kind?: string;
}> {
  const col = await getCollection("waitlist");
  const entry = await col.findOne({ code: code.toUpperCase() });

  if (!entry) return { ok: false, error: "not_found" };
  if (entry.used && entry.wallet !== wallet) return { ok: false, error: "already_used" };
  if (entry.used && entry.wallet === wallet) {
    const token = signToken({
      sub: entry.email,
      code,
      kind: "full",
      wallet,
      iat: Date.now(),
      exp: Date.now() + 90 * 24 * 60 * 60 * 1000,
    });
    return { ok: true, token, email: entry.email, kind: "full" };
  }

  const updated = {
    used: true,
    usedAt: Date.now(),
    wallet: wallet ?? null,
  };

  await col.updateOne({ email: entry.email }, { $set: updated });

  const token = signToken({
    sub: entry.email,
    code,
    kind: "full",
    wallet,
    iat: Date.now(),
    exp: Date.now() + 90 * 24 * 60 * 60 * 1000,
  });

  return { ok: true, token, email: entry.email, kind: "full" };
}

export function createPaperToken() {
  return signToken({
    kind: "paper",
    iat: Date.now(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
}

/** Re-issues a token bound to a wallet once the user connects it. */
export function issueBoundToken(
  kind: "full" | "paper",
  wallet: string,
  sub: string | null = null,
) {
  return signToken({
    kind,
    ...(sub ? { sub } : {}),
    wallet,
    iat: Date.now(),
    exp: Date.now() + 90 * 24 * 60 * 60 * 1000,
  });
}

export function validateAccessToken(token: string): Record<string, unknown> | null {
  return verifyToken(token);
}
