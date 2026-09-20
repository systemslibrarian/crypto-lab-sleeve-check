/**
 * Kuznyechik -- GOST R 34.12-2015, as specified by RFC 7801.
 *
 * INV-5. The verifier side of the lab. It uses the published table from
 * `reference.ts` and never imports `tklog.ts`: the cipher has to be demonstrably
 * standard-compliant *before* the exhibit takes its S-box apart.
 *
 * INV-7. The linear transformation lives in the field Q of RFC 7801 Section 3.2,
 * p(x) = x^8 + x^7 + x^6 + x + 1 (0x1C3). That is NOT the field pi is a TKlog
 * over. Both are named explicitly in field.ts; neither has a default.
 *
 * Byte order. The RFC writes a 128-bit vector as a_15||...||a_0, so the leftmost
 * hex byte is a_15. Blocks here are Uint8Array(16) in that same printed order:
 * `block[0]` is a_15. Section 4.3's R shifts a_15 out and l(...) in at the left,
 * which in this indexing is a shift toward higher indices.
 */

import { gfMul, POLY_KUZNYECHIK } from './field';
import { PI_RFC7801, PI_INV_RFC7801 } from './reference';

/**
 * The 16 coefficients of l, RFC 7801 Section 4.2, ordered a_15 down to a_0.
 *
 * The RFC as published prints `148*delta(a_15) + 32*delta(a_15)` -- a_15 twice,
 * a_14 never. That is a typo, reported as erratum EID 6928 (Technical, status
 * Reported as of this writing, not Verified). The coefficient below is the
 * corrected 32*delta(a_14); with the text taken literally, Section 5's own
 * vectors do not reproduce, which is what `kuznyechik.test.ts` demonstrates.
 *
 * (The RFC's one *Verified* erratum, EID 4660, is editorial and unrelated: it
 * fixes "belonging to Z" to "belonging to Q" in the Section 3.2 definition of
 * delta. It changes no value in this file.)
 */
export const L_COEFFS: readonly number[] = [
  148, 32, 133, 16, 194, 192, 1, 251, 1, 192, 194, 16, 133, 32, 148, 1,
];

export type Block = Uint8Array;

export function blockFromHex(hex: string): Block {
  const clean = hex.replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error('block must be hexadecimal');
  if (clean.length !== 32) throw new Error(`block must be 16 bytes (32 hex digits), got ${clean.length}`);
  const out = new Uint8Array(16);
  for (let k = 0; k < 16; k++) out[k] = parseInt(clean.slice(k * 2, k * 2 + 2), 16);
  return out;
}

export function blockToHex(b: Block): string {
  return Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
}

export function keyFromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error('key must be hexadecimal');
  if (clean.length !== 64) throw new Error(`key must be 32 bytes (64 hex digits), got ${clean.length}`);
  const out = new Uint8Array(32);
  for (let k = 0; k < 32; k++) out[k] = parseInt(clean.slice(k * 2, k * 2 + 2), 16);
  return out;
}

/** X[k](a) = k XOR a. */
export function transformX(k: Block, a: Block): Block {
  const out = new Uint8Array(16);
  for (let idx = 0; idx < 16; idx++) out[idx] = k[idx] ^ a[idx];
  return out;
}

/** S -- pi applied bytewise. RFC 7801 Section 4.3. */
export function transformS(a: Block): Block {
  const out = new Uint8Array(16);
  for (let idx = 0; idx < 16; idx++) out[idx] = PI_RFC7801[a[idx]];
  return out;
}

/** S^-1 -- pi^-1 applied bytewise. */
export function transformSInv(a: Block): Block {
  const out = new Uint8Array(16);
  for (let idx = 0; idx < 16; idx++) out[idx] = PI_INV_RFC7801[a[idx]];
  return out;
}

/** l(a_15,...,a_0) -- the field-Q dot product of Section 4.2. */
export function linearL(a: Block): number {
  let acc = 0;
  for (let idx = 0; idx < 16; idx++) acc ^= gfMul(L_COEFFS[idx], a[idx], POLY_KUZNYECHIK);
  return acc;
}

/** R(a_15||...||a_0) = l(a)||a_15||...||a_1. */
export function transformR(a: Block): Block {
  const out = new Uint8Array(16);
  out[0] = linearL(a);
  for (let idx = 0; idx < 15; idx++) out[idx + 1] = a[idx];
  return out;
}

/** R^-1(a_15||...||a_0) = a_14||...||a_0||l(a_14,...,a_0,a_15). */
export function transformRInv(a: Block): Block {
  const shifted = new Uint8Array(16);
  for (let idx = 0; idx < 15; idx++) shifted[idx] = a[idx + 1];
  shifted[15] = a[0];
  const out = new Uint8Array(16);
  for (let idx = 0; idx < 15; idx++) out[idx] = shifted[idx];
  out[15] = linearL(shifted);
  return out;
}

/** L = R^16. */
export function transformL(a: Block): Block {
  let v = a;
  for (let n = 0; n < 16; n++) v = transformR(v);
  return v;
}

/** L^-1 = (R^-1)^16. */
export function transformLInv(a: Block): Block {
  let v = a;
  for (let n = 0; n < 16; n++) v = transformRInv(v);
  return v;
}

/** LSX[k](a) = L(S(X[k](a))). One full round of the cipher. */
export function lsx(k: Block, a: Block): Block {
  return transformL(transformS(transformX(k, a)));
}

/** The intermediate states of one LSX round, for the step control in pane 1. */
export interface RoundTrace {
  readonly input: Block;
  readonly roundKey: Block;
  readonly afterX: Block;
  readonly afterS: Block;
  readonly afterL: Block;
}

export function traceRound(k: Block, a: Block): RoundTrace {
  const afterX = transformX(k, a);
  const afterS = transformS(afterX);
  return { input: a, roundKey: k, afterX, afterS, afterL: transformL(afterS) };
}

/** C_i = L(Vec_128(i)), i = 1..32. RFC 7801 Section 4.4. */
export function roundConstants(): Block[] {
  const out: Block[] = [];
  for (let i = 1; i <= 32; i++) {
    const v = new Uint8Array(16);
    v[15] = i; // Vec_128(i): i as a 128-bit integer, so it sits in the a_0 byte
    out.push(transformL(v));
  }
  return out;
}

/** F[k](a_1, a_0) = (LSX[k](a_1) XOR a_0, a_1). */
function feistel(k: Block, a1: Block, a0: Block): [Block, Block] {
  return [transformX(lsx(k, a1), a0), a1];
}

/** The ten round keys K_1..K_10. RFC 7801 Section 4.4. */
export function keySchedule(key: Uint8Array): Block[] {
  if (key.length !== 32) throw new Error('Kuznyechik takes a 256-bit key');
  const constants = roundConstants();
  let a1: Block = key.slice(0, 16); // K_1 = k_255||...||k_128, the high half
  let a0: Block = key.slice(16, 32); // K_2 = k_127||...||k_0
  const keys: Block[] = [a1, a0];
  for (let i = 1; i <= 4; i++) {
    for (let n = 1; n <= 8; n++) {
      [a1, a0] = feistel(constants[8 * (i - 1) + n - 1], a1, a0);
    }
    keys.push(a1, a0);
  }
  return keys;
}

/** E(a) = X[K_10] LSX[K_9] ... LSX[K_1](a). Nine LSX rounds, then a final key XOR. */
export function encryptBlock(key: Uint8Array, plaintext: Block): Block {
  const rk = keySchedule(key);
  let state = plaintext;
  for (let r = 0; r < 9; r++) state = lsx(rk[r], state);
  return transformX(rk[9], state);
}

/** D(b) = X[K_1] L^-1 S^-1 X[K_2] ... L^-1 S^-1 X[K_10](b). */
export function decryptBlock(key: Uint8Array, ciphertext: Block): Block {
  const rk = keySchedule(key);
  let state = transformX(rk[9], ciphertext);
  for (let r = 8; r >= 0; r--) {
    state = transformSInv(transformLInv(state));
    if (r > 0) state = transformX(rk[r], state);
  }
  return transformX(rk[0], state);
}

/** The nine intermediate LSX states plus the final X, for the full-vector run. */
export function encryptTrace(key: Uint8Array, plaintext: Block): { labels: string[]; states: Block[] } {
  const rk = keySchedule(key);
  const labels: string[] = [];
  const states: Block[] = [];
  let state = plaintext;
  for (let r = 0; r < 9; r++) {
    state = lsx(rk[r], state);
    labels.push(`LSX[K_${r + 1}]`);
    states.push(state);
  }
  state = transformX(rk[9], state);
  labels.push('X[K_10]');
  states.push(state);
  return { labels, states };
}
