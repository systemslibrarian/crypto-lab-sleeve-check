import { describe, it, expect } from 'vitest';
import {
  buildLogTables,
  gfInv,
  gfMul,
  gfPow,
  isSubspace,
  subfield16,
  POLY_AES,
  POLY_KUZNYECHIK,
  POLY_TKLOG,
} from './field';

describe('INV-7 -- three distinct polynomials, none of them a default', () => {
  it('names each one explicitly', () => {
    expect(POLY_TKLOG).toBe(0x11d);
    expect(POLY_KUZNYECHIK).toBe(0x1c3);
    expect(POLY_AES).toBe(0x11b);
    expect(new Set([POLY_TKLOG, POLY_KUZNYECHIK, POLY_AES]).size).toBe(3);
  });
});

describe('field arithmetic', () => {
  it('multiplication is commutative and has 1 as identity', () => {
    for (const m of [POLY_TKLOG, POLY_KUZNYECHIK, POLY_AES]) {
      for (let a = 0; a < 256; a += 7) {
        expect(gfMul(a, 1, m)).toBe(a);
        for (let b = 0; b < 256; b += 11) expect(gfMul(a, b, m)).toBe(gfMul(b, a, m));
      }
    }
  });

  it('every non-zero element has an inverse, in every field', () => {
    for (const m of [POLY_TKLOG, POLY_KUZNYECHIK, POLY_AES]) {
      for (let a = 1; a < 256; a++) expect(gfMul(a, gfInv(a, m), m)).toBe(1);
    }
    expect(gfInv(0, POLY_AES)).toBe(0);
  });

  it('distributes over XOR', () => {
    for (let a = 1; a < 256; a += 13)
      for (let b = 1; b < 256; b += 17)
        for (let c = 1; c < 256; c += 19)
          expect(gfMul(a, b ^ c, POLY_TKLOG)).toBe(gfMul(a, b, POLY_TKLOG) ^ gfMul(a, c, POLY_TKLOG));
  });
});

describe('log tables', () => {
  it('X generates F*_2^8 modulo 0x11D', () => {
    const t = buildLogTables(POLY_TKLOG, 0x02);
    expect(new Set(t.exp).size).toBe(255);
    for (let x = 1; x < 256; x++) expect(gfPow(t, t.log[x])).toBe(x);
  });

  it('X does NOT generate F*_2^8 modulo the AES polynomial -- so it is rejected, not silently used', () => {
    expect(() => buildLogTables(POLY_AES, 0x02)).toThrow(/not a generator|does not generate/);
  });

  it('rejects a plainly non-generating element', () => {
    expect(() => buildLogTables(POLY_TKLOG, 0x01)).toThrow(/not a generator|does not generate/);
  });

  it('gives the identity the representative 255, and 0 no log at all', () => {
    const t = buildLogTables(POLY_TKLOG, 0x02);
    expect(t.log[1]).toBe(255);
    expect(t.log[0]).toBe(-1);
    expect(t.exp[0]).toBe(1);
  });
});

describe('the subfield F_16', () => {
  it('has 16 elements and is closed under XOR, in both GOST fields', () => {
    for (const [m, g] of [
      [POLY_TKLOG, 0x02],
      [POLY_AES, 0x03],
    ] as const) {
      const f16 = subfield16(buildLogTables(m, g));
      expect(f16).toHaveLength(16);
      expect(new Set(f16).size).toBe(16);
      expect(isSubspace(f16)).toBe(true);
    }
  });

  it('is closed under multiplication too -- it is a field, not just a subspace', () => {
    const t = buildLogTables(POLY_TKLOG, 0x02);
    const f16 = new Set(subfield16(t));
    for (const a of f16) for (const b of f16) expect(f16.has(gfMul(a, b, POLY_TKLOG))).toBe(true);
  });

  it('isSubspace rejects a set missing 0 and one not closed under XOR', () => {
    expect(isSubspace([1, 2, 3])).toBe(false);
    expect(isSubspace([0, 1, 2])).toBe(false);
    expect(isSubspace([0, 1, 2, 3])).toBe(true);
  });
});
