/**
 * The AES S-box, built from its published definition -- the nothing-up-my-sleeve
 * control.
 *
 * FIPS 197 gives the whole box in two lines of mathematics with no unexplained
 * constants: invert in F_2^8, then apply one fixed GF(2)-affine map. Both halves
 * are written out below. That is the contrast the exhibit rests on -- not that
 * AES is structureless, but that its structure was published by its designers
 * rather than recovered from the table twenty years later.
 *
 * INV-7 again: AES's field is x^8+x^4+x^3+x+1 (0x11B), a third polynomial,
 * distinct from both of the GOST ones.
 */

import { buildLogTables, gfInv, POLY_AES, type LogTables } from './field';

/** FIPS 197 Section 5.1.1: the additive constant of the affine map. */
export const AES_AFFINE_CONSTANT = 0x63;

/** X is not primitive modulo 0x11B; x+1 (0x03) is the conventional generator. */
export const AES_FIELD: LogTables = buildLogTables(POLY_AES, 0x03);

function rotl8(x: number, shift: number): number {
  return ((x << shift) | (x >> (8 - shift))) & 0xff;
}

/**
 * The affine half: b'_i = b_i XOR b_(i+4) XOR b_(i+5) XOR b_(i+6) XOR b_(i+7) XOR c_i,
 * indices modulo 8. Written as rotations, that is y XOR rotl(y,1..4) XOR 0x63.
 */
export function aesAffine(y: number): number {
  return (y ^ rotl8(y, 1) ^ rotl8(y, 2) ^ rotl8(y, 3) ^ rotl8(y, 4) ^ AES_AFFINE_CONSTANT) & 0xff;
}

/** The inversion half. FIPS 197 maps 0 to itself, which is why S(0) is just the constant. */
export function aesInverse(x: number): number {
  return gfInv(x, POLY_AES);
}

/** S(0) = b; S(x) = A . x^-1 XOR b for x != 0. */
export function aesSbox(x: number): number {
  return aesAffine(aesInverse(x));
}

export function generateAesSbox(): number[] {
  const out: number[] = [];
  for (let x = 0; x < 256; x++) out.push(aesSbox(x));
  return out;
}

/**
 * Three entries from the FIPS 197 Figure 7 lookup table, as an independent
 * check that the two halves above were assembled correctly.
 */
export const AES_SBOX_SPOT_CHECKS: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x63],
  [0x01, 0x7c],
  [0x53, 0xed],
  [0xff, 0x16],
];
