// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { canWrite, partitionPatchByAuthority } from '../../src/polymarket/config/resolver.js';

describe('canWrite — write-side precedence', () => {
  it('lets automation claim fields nobody owns', () => {
    expect(canWrite('automation', null)).toBe(true);
  });

  it('refuses automation over an operator-owned field', () => {
    expect(canWrite('automation', 'operator')).toBe(false);
  });

  it('refuses automation over a guardrail-owned field', () => {
    expect(canWrite('automation', 'guardrail')).toBe(false);
  });

  it('lets automation rewrite its own field, so regime adaptation keeps working', () => {
    expect(canWrite('automation', 'automation')).toBe(true);
  });

  it('lets a guardrail override automation but not the operator', () => {
    expect(canWrite('guardrail', 'automation')).toBe(true);
    expect(canWrite('guardrail', 'operator')).toBe(false);
  });

  it('lets the operator override anything', () => {
    for (const owner of ['operator', 'guardrail', 'automation', 'system', null]) {
      expect(canWrite('operator', owner)).toBe(true);
    }
  });

  it('never polices system writes, which are derived facts not settings', () => {
    expect(canWrite('system', 'operator')).toBe(true);
    expect(canWrite('automation', 'system')).toBe(true);
  });
});

describe('partitionPatchByAuthority', () => {
  const owners = {
    minConfidence: 'operator',
    holdToSettleFavorites: 'operator',
    slPct: 'automation',
    tpPct: null,
  };
  const ownerOf = (f) => owners[f] ?? null;

  it('splits an automation patch into what it may and may not apply', () => {
    const { allowed, blocked } = partitionPatchByAuthority(
      { minConfidence: 0.5, holdToSettleFavorites: false, slPct: 21, tpPct: 30 },
      'automation',
      ownerOf,
    );
    expect(allowed).toEqual({ slPct: 21, tpPct: 30 });
    expect(blocked.map((b) => b.field).sort()).toEqual(['holdToSettleFavorites', 'minConfidence']);
  });

  it('reports the blocking owner so a refusal can be explained', () => {
    const { blocked } = partitionPatchByAuthority({ minConfidence: 0.5 }, 'automation', ownerOf);
    expect(blocked[0]).toEqual({ field: 'minConfidence', value: 0.5, ownerTier: 'operator' });
  });

  it('applies an operator patch in full', () => {
    const patch = { minConfidence: 0.62, slPct: 18 };
    const { allowed, blocked } = partitionPatchByAuthority(patch, 'operator', ownerOf);
    expect(allowed).toEqual(patch);
    expect(blocked).toEqual([]);
  });

  it('tolerates an empty or missing patch', () => {
    expect(partitionPatchByAuthority(undefined, 'automation', ownerOf)).toEqual({ allowed: {}, blocked: [] });
  });
});
