import { describe, it, expect } from 'vitest';
import {
  blockFromHex,
  blockToHex,
  keyFromHex,
  decryptBlock,
  encryptBlock,
  encryptTrace,
  keySchedule,
  linearL,
  roundConstants,
  transformL,
  transformLInv,
  transformR,
  transformRInv,
  transformS,
  transformSInv,
  transformX,
  traceRound,
  L_COEFFS,
} from './kuznyechik';
import { gfMul, POLY_KUZNYECHIK, POLY_TKLOG } from './field';
import * as V from './vectors';

const hex = (b: Uint8Array) => blockToHex(b);

describe('INV-1 -- RFC 7801 Section 5 known-answer tests', () => {
  it('5.1: S applied four times', () => {
    for (let n = 0; n < 4; n++) {
      expect(hex(transformS(blockFromHex(V.S_CHAIN[n])))).toBe(V.S_CHAIN[n + 1]);
    }
  });

  it('5.1 inverted: S^-1 walks the chain back', () => {
    for (let n = 4; n > 0; n--) {
      expect(hex(transformSInv(blockFromHex(V.S_CHAIN[n])))).toBe(V.S_CHAIN[n - 1]);
    }
  });

  it('5.2: R applied four times', () => {
    for (let n = 0; n < 4; n++) {
      expect(hex(transformR(blockFromHex(V.R_CHAIN[n])))).toBe(V.R_CHAIN[n + 1]);
    }
  });

  it('5.2 inverted: R^-1 walks the chain back', () => {
    for (let n = 4; n > 0; n--) {
      expect(hex(transformRInv(blockFromHex(V.R_CHAIN[n])))).toBe(V.R_CHAIN[n - 1]);
    }
  });

  it('5.3: L applied four times', () => {
    for (let n = 0; n < 4; n++) {
      expect(hex(transformL(blockFromHex(V.L_CHAIN[n])))).toBe(V.L_CHAIN[n + 1]);
    }
  });

  it('5.3 inverted: L^-1 walks the chain back', () => {
    for (let n = 4; n > 0; n--) {
      expect(hex(transformLInv(blockFromHex(V.L_CHAIN[n])))).toBe(V.L_CHAIN[n - 1]);
    }
  });

  it('5.4: the first eight round constants C_1..C_8', () => {
    const c = roundConstants();
    V.ROUND_CONSTANTS_1_TO_8.forEach((want, idx) => expect(hex(c[idx])).toBe(want));
  });

  it('5.4: all ten round keys', () => {
    const rk = keySchedule(keyFromHex(V.TEST_KEY));
    expect(rk).toHaveLength(10);
    V.ROUND_KEYS.forEach((want, idx) => expect(hex(rk[idx])).toBe(want));
  });

  it('5.5: the named intermediates of round 1', () => {
    const rk = keySchedule(keyFromHex(V.TEST_KEY));
    const t = traceRound(rk[0], blockFromHex(V.TEST_PLAINTEXT));
    expect(hex(t.afterX)).toBe(V.ROUND1_AFTER_X);
    expect(hex(t.afterS)).toBe(V.ROUND1_AFTER_S);
    expect(hex(t.afterL)).toBe(V.ROUND1_AFTER_L);
  });

  it('5.5: every intermediate state of the full encryption', () => {
    const { labels, states } = encryptTrace(keyFromHex(V.TEST_KEY), blockFromHex(V.TEST_PLAINTEXT));
    expect(labels).toHaveLength(10);
    // Nine LSX rounds then one X -- not ten full rounds.
    expect(labels.filter((l) => l.startsWith('LSX'))).toHaveLength(9);
    expect(labels[9]).toBe('X[K_10]');
    V.ENCRYPT_TRACE.forEach((want, idx) => expect(hex(states[idx])).toBe(want));
  });

  it('5.5: encrypt reaches the published ciphertext', () => {
    expect(hex(encryptBlock(keyFromHex(V.TEST_KEY), blockFromHex(V.TEST_PLAINTEXT)))).toBe(
      V.TEST_CIPHERTEXT,
    );
  });

  it('5.6: the first three states of the published decryption', () => {
    const rk = keySchedule(keyFromHex(V.TEST_KEY));
    const afterX = transformX(rk[9], blockFromHex(V.TEST_CIPHERTEXT));
    expect(hex(afterX)).toBe(V.DECRYPT_AFTER_X_K10);
    const afterLInv = transformLInv(afterX);
    expect(hex(afterLInv)).toBe(V.DECRYPT_AFTER_LINV);
    expect(hex(transformSInv(afterLInv))).toBe(V.DECRYPT_AFTER_SINV);
  });

  it('5.6: decrypt recovers the published plaintext', () => {
    expect(hex(decryptBlock(keyFromHex(V.TEST_KEY), blockFromHex(V.TEST_CIPHERTEXT)))).toBe(
      V.TEST_PLAINTEXT,
    );
  });

  it('round-trips on inputs the RFC does not cover', () => {
    const key = keyFromHex('00'.repeat(31) + '01');
    for (const pt of ['00'.repeat(16), 'ff'.repeat(16), '0123456789abcdeffedcba9876543210']) {
      const block = blockFromHex(pt);
      expect(hex(decryptBlock(key, encryptBlock(key, block)))).toBe(pt);
    }
  });
});

describe('INV-7 -- the L polynomial is read out of RFC 7801, not assumed', () => {
  it('uses field Q, p(x) = x^8+x^7+x^6+x+1 (0x1C3), for l', () => {
    expect(POLY_KUZNYECHIK).toBe(0x1c3);
  });

  it('is a different field from the one pi is a TKlog over', () => {
    expect(POLY_KUZNYECHIK).not.toBe(POLY_TKLOG);
  });

  it('the two polynomials give different products, so neither can stand in for the other', () => {
    // If a single modulus had silently served both fields, this would be equal.
    const differ = [];
    for (let a = 2; a < 256; a++) {
      if (gfMul(a, a, POLY_KUZNYECHIK) !== gfMul(a, a, POLY_TKLOG)) differ.push(a);
    }
    expect(differ.length).toBeGreaterThan(0);
  });

  it('reproduces l from Section 5.2 independently of transformR', () => {
    // R(...0100) = 94... : only a_1 is set, and l's coefficient on a_1 is 148 = 0x94.
    const a = blockFromHex(V.R_CHAIN[0]);
    expect(linearL(a)).toBe(0x94);
    expect(L_COEFFS[14]).toBe(148);
  });
});

describe('the Section 4.2 coefficient list', () => {
  it('has 16 entries and is a palindrome apart from the closing 1', () => {
    expect(L_COEFFS).toHaveLength(16);
    // a_15..a_1 read the same forwards and backwards; a_0's coefficient is 1.
    const head = L_COEFFS.slice(0, 15);
    expect(head).toEqual([...head].reverse());
    expect(L_COEFFS[15]).toBe(1);
  });

  it('EID 6928: taking the RFC text literally (a_15 twice, no a_14) breaks Section 5', () => {
    // The published text reads "148*delta(a_15) + 32*delta(a_15)". Under that
    // reading a_14 is dropped and a_15 is counted twice, so l becomes:
    const literal = (a: Uint8Array) => {
      let acc = gfMul(148, a[0], POLY_KUZNYECHIK) ^ gfMul(32, a[0], POLY_KUZNYECHIK);
      for (let idx = 2; idx < 16; idx++) acc ^= gfMul(L_COEFFS[idx], a[idx], POLY_KUZNYECHIK);
      return acc;
    };
    // The RFC's own Section 5.3 vector distinguishes them.
    const a = blockFromHex(V.L_CHAIN[0]);
    expect(linearL(a)).not.toBe(literal(a));
  });
});

describe('input validation', () => {
  it('rejects a block of the wrong length', () => {
    expect(() => blockFromHex('00')).toThrow(/16 bytes/);
  });
  it('rejects non-hexadecimal input', () => {
    expect(() => blockFromHex('zz'.repeat(16))).toThrow(/hexadecimal/);
  });
  it('rejects a key of the wrong length', () => {
    expect(() => keyFromHex('00'.repeat(16))).toThrow(/32 bytes/);
  });
});
