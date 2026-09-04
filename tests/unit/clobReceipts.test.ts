import { describe, it, expect } from 'vitest';
import {
  captureReceipt,
  captureClobCall,
  readReceipts,
  receiptLogPath,
} from '../../src/polymarket/clobReceipts.js';

describe('clobReceipts', () => {
  it('captureReceipt appends a readable JSONL row', () => {
    const before = readReceipts(5).length;
    captureReceipt({
      fn: 'unit-test',
      phase: 'response',
      request: { amount: 1 },
      raw: { orderID: 'abc', takingAmount: '1000000' },
    });
    const rows = readReceipts(20);
    expect(rows.length).toBeGreaterThan(before);
    const last = rows[rows.length - 1];
    expect(last.fn).toBe('unit-test');
    expect(last.rawKeys).toContain('orderID');
    expect(receiptLogPath()).toContain('clob_receipts.jsonl');
  });

  it('captureClobCall records throws then rethrows', async () => {
    await expect(captureClobCall('boom', { x: 1 }, async () => {
      throw new Error('nope');
    })).rejects.toThrow('nope');
    const last = readReceipts(5).at(-1);
    expect(last?.phase).toBe('throw');
    expect(last?.error?.message).toContain('nope');
  });
});
