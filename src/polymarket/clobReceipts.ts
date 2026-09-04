/**
 * Raw CLOB response capture.
 *
 * Captures the response whole and unmodified so live fill-scale questions
 * (makingAmount/takingAmount units, rejection shape) can be answered from
 * wire data rather than guesses.
 */
import fs from 'fs';
import { dataPath } from './dataDir.js';

/** Append-only JSONL path — resolved at write time so tests can override data dir. */
function receiptLogFile() {
  return dataPath('clob_receipts.jsonl');
}
const ROTATE_BYTES = 4 * 1024 * 1024;

const ENABLED = process.env.ZINGER_CAPTURE_RECEIPTS !== '0';
const ECHO = process.env.ZINGER_RECEIPT_ECHO !== '0';

export interface ClobReceipt {
  at: string;
  fn: string;
  phase: 'response' | 'throw';
  request: Record<string, unknown>;
  raw?: unknown;
  rawKeys?: string[];
  rawType?: string;
  derived?: Record<string, unknown>;
  error?: { message: string; name?: string; code?: unknown; status?: unknown; body?: unknown };
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'bigint') return `${val.toString()}n`;
    if (typeof val === 'function') return '[function]';
    if (val instanceof Error) return { name: val.name, message: val.message, stack: val.stack };
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[circular]';
      seen.add(val);
    }
    return val;
  });
}

function describe(raw: unknown): { rawKeys?: string[]; rawType: string } {
  const rawType = raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { rawKeys: Object.keys(raw as Record<string, unknown>), rawType };
  }
  return { rawType };
}

/** Record one CLOB interaction. Never throws. */
export function captureReceipt(entry: Omit<ClobReceipt, 'at'>): void {
  if (!ENABLED) return;
  try {
    const record: ClobReceipt = {
      at: new Date().toISOString(),
      ...entry,
      ...('raw' in entry ? describe(entry.raw) : { rawType: 'absent' }),
    };
    const line = safeStringify(record);
    if (typeof line !== 'string') return;

    try {
      const RECEIPT_LOG = receiptLogFile();
      if (fs.statSync(RECEIPT_LOG).size > ROTATE_BYTES) {
        fs.renameSync(RECEIPT_LOG, `${RECEIPT_LOG}.1`);
      }
    } catch { /* no log yet */ }

    fs.appendFileSync(receiptLogFile(), `${line}\n`);
    if (ECHO) console.log(`📼 CLOB RECEIPT ${line}`);
  } catch {
    // Deliberately silent — diagnostics must not break live orders.
  }
}

export async function captureClobCall<T>(
  fn: string,
  request: Record<string, unknown>,
  call: () => Promise<T>,
): Promise<T> {
  try {
    const raw = await call();
    captureReceipt({ fn, phase: 'response', request, raw });
    return raw;
  } catch (err: any) {
    captureReceipt({
      fn,
      phase: 'throw',
      request,
      error: {
        message: String(err?.message ?? err),
        name: err?.name,
        code: err?.code,
        status: err?.status ?? err?.response?.status,
        body: err?.response?.data ?? err?.body ?? null,
      },
    });
    throw err;
  }
}

export function receiptLogPath(): string {
  return receiptLogFile();
}

export function readReceipts(limit = 50): ClobReceipt[] {
  try {
    const lines = fs.readFileSync(receiptLogFile(), 'utf8').split('\n').filter(Boolean);
    return lines.slice(-limit).flatMap((l) => {
      try { return [JSON.parse(l) as ClobReceipt]; } catch { return []; }
    });
  } catch {
    return [];
  }
}
