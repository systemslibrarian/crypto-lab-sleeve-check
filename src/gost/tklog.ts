/**
 * The TKlog generator -- a line-by-line port of the SAGE script Perrin publishes
 * at https://who.paris.inria.fr/Leo.Perrin/pi.html Section 2.1.1, which is the
 * normative algorithm source for this lab.
 *
 * INV-5. This module must never import `reference.ts`. It reconstructs the table
 * from four constants and field arithmetic alone; if it could see the published
 * bytes the exhibit would prove nothing. `moduleGraph.test.ts` enforces it.
 *
 * PORT NOTES (Python 2 / SAGE -> TypeScript). The brief calls the index
 * arithmetic the easiest thing here to get subtly wrong, and it is:
 *
 *  1. `int(F.fetch_int(x)._log_repr())` is the discrete log of x to the field
 *     generator alpha. Givaro (SAGE's backend) gives the multiplicative identity
 *     the log representative **255, not 0**. Both name the same element -- but
 *     with l = 0 the x = 1 branch computes kappa(16), kappa's argument leaves its
 *     4-bit domain, it aliases to kappa(0), and pi(1) comes out 0xFC instead of
 *     0xEE -- colliding with pi(0) and making the "permutation" not a
 *     permutation. With l = 255 the argument of kappa is exactly 1..15 on this
 *     branch and 0..15 overall, which is the tell that the convention is right.
 *     This is the "log of the identity element" hazard in the brief's 1.6.
 *  2. `floor(l / 17)` is integer division; `xrange` is just `for`.
 *  3. `gf_elmt.integer_representation()` is the plain bit-packed integer for the
 *     field element, which is what `exp[]` already stores.
 *  4. 255 = 17 * 15, so l mod 17 indexes the 17 multiplicative cosets and
 *     floor(l / 17) indexes position within one. On the general branch l <= 254,
 *     so floor(l / 17) <= 14 and `s` (15 entries) is never indexed out of range.
 *
 * Acceptance is not this prose. It is INV-2: byte equality on all 256 entries
 * against the published table, Hamming distance strictly 0.
 */

import { buildLogTables, gfPow, POLY_TKLOG, type LogTables } from './field';

/** The four recovered constants. Perrin's naming is kept so the port reads against the script. */
export interface TklogParams {
  /** `s` -- a permutation of 0..14, selecting which subgroup element each coset lands on. */
  readonly s: readonly number[];
  /** `lambda_vectors` -- four bytes spanning a 4-dimensional GF(2) subspace. */
  readonly lambda: readonly number[];
  /** `cstt` -- the additive constant. It is also pi(0), because kappa(0) = cstt. */
  readonly cstt: number;
}

/** The constants Perrin recovered, exactly as the SAGE script sets them. */
export const PI_PARAMS: TklogParams = {
  s: [0, 12, 9, 8, 7, 4, 14, 6, 5, 10, 2, 11, 1, 3, 13],
  lambda: [0x12, 0x26, 0x24, 0x30],
  cstt: 0xfc,
};

/** The log/antilog tables for Perrin's representation field, built once. */
export const TKLOG_FIELD: LogTables = buildLogTables(POLY_TKLOG, /* alpha = X */ 0x02);

/**
 * kappa(x) = XOR of lambda[j] over the set bits j = 0..3 of x, then XOR cstt.
 *
 * Affine over GF(2), and its domain is the four low bits: kappa only ever reads
 * bits 0..3, so anything above 15 silently aliases. The generator never hands it
 * such a value -- see PORT NOTE 1.
 */
export function kappa(x: number, params: TklogParams): number {
  let result = 0;
  for (let j = 0; j < 4; j++) {
    if (((x >> j) & 1) === 1) result ^= params.lambda[j] ?? 0;
  }
  return (result ^ params.cstt) & 0xff;
}

/** Which of this generator's two branches produced a given entry. */
export type TklogBranch = 'zero' | 'subgroup' | 'general';

export interface TklogStep {
  readonly x: number;
  readonly value: number;
  /** log_alpha(x), with the identity taking 255. -1 for x = 0, which has no log. */
  readonly log: number;
  /** l mod 17 -- the index of x's multiplicative coset. -1 for x = 0. */
  readonly i: number;
  /** floor(l / 17) -- position within the coset. -1 for x = 0. */
  readonly j: number;
  readonly branch: TklogBranch;
}

/**
 * Generate one entry, keeping the intermediate indices so the UI can show the
 * branch arithmetic instead of asserting it.
 *
 * Tolerates broken parameters on purpose (edge case, brief 1.6): a visitor who
 * edits `s` into a non-permutation must still get output that fails the diff,
 * never a throw. An out-of-range `s[j]` reads as 0 rather than undefined.
 */
export function tklogStep(x: number, params: TklogParams, field: LogTables = TKLOG_FIELD): TklogStep {
  if (x === 0) {
    return { x, value: kappa(0, params), log: -1, i: -1, j: -1, branch: 'zero' };
  }
  const l = field.log[x];
  const i = l % 17;
  const j = Math.floor(l / 17);
  if (i === 0) {
    // x lies in the order-15 subgroup <alpha^17>. 16 - j is in 1..15 here.
    return { x, value: kappa(16 - j, params), log: l, i, j, branch: 'subgroup' };
  }
  const sj = params.s[j] ?? 0;
  const gfElement = gfPow(field, 17 * sj);
  return { x, value: (kappa(16 - i, params) ^ gfElement) & 0xff, log: l, i, j, branch: 'general' };
}

/** Generate all 256 entries. Build the log tables once at load, never per entry. */
export function generateTklog(
  params: TklogParams = PI_PARAMS,
  field: LogTables = TKLOG_FIELD,
): number[] {
  const out: number[] = [];
  for (let x = 0; x < 256; x++) out.push(tklogStep(x, params, field).value);
  return out;
}
