/**
 * Binary-field arithmetic over F_2^8.
 *
 * INV-7. Two *different* irreducible polynomials appear in this lab and a third
 * belongs to the AES control. Nothing here defaults: every entry point takes its
 * modulus explicitly, so one polynomial can never silently serve another field.
 *
 *   POLY_TKLOG        X^8 + X^4 + X^3 + X^2 + 1   (0x11D)
 *     Perrin's representation field for pi. This is a *choice made by Perrin*
 *     when he reverse-engineered the table -- GOST published a lookup table and
 *     named no field at all (INV-8).
 *
 *   POLY_KUZNYECHIK   x^8 + x^7 + x^6 + x + 1     (0x1C3)
 *     The field Q of RFC 7801 Section 3.2, over which the linear transformation
 *     l of Section 4.2 is defined. Read out of the RFC, not assumed.
 *
 *   POLY_AES          x^8 + x^4 + x^3 + x + 1     (0x11B)
 *     FIPS 197 Section 4.2, for the nothing-up-my-sleeve control only.
 */

/** X^8 + X^4 + X^3 + X^2 + 1 -- the field pi is a TKlog over, per Perrin 2019. */
export const POLY_TKLOG = 0x11d;

/** x^8 + x^7 + x^6 + x + 1 -- field Q, RFC 7801 Section 3.2. */
export const POLY_KUZNYECHIK = 0x1c3;

/** x^8 + x^4 + x^3 + x + 1 -- AES's field, FIPS 197 Section 4.2. */
export const POLY_AES = 0x11b;

/**
 * Carry-less multiply of two field elements, reduced modulo `modulus`.
 * Both operands are byte-sized; the modulus is the 9-bit irreducible polynomial.
 */
export function gfMul(a: number, b: number, modulus: number): number {
  let result = 0;
  let x = a & 0xff;
  let y = b & 0xff;
  while (y !== 0) {
    if ((y & 1) === 1) result ^= x;
    y >>= 1;
    x <<= 1;
    if ((x & 0x100) !== 0) x ^= modulus;
  }
  return result & 0xff;
}

export interface LogTables {
  readonly modulus: number;
  /** The field generator these logs are taken to. */
  readonly generator: number;
  /** exp[k] = generator^k for k = 0..254. */
  readonly exp: Uint8Array;
  /**
   * log[x] = the discrete logarithm of x, for x != 0. log[0] is -1 (undefined).
   *
   * The identity takes the representative 255, NOT 0 -- see PORT NOTE in tklog.ts.
   * Both are the same field element (generator^0 = generator^255 = 1); which
   * representative you hand to the TKlog branch arithmetic changes pi(1), and
   * only 255 reproduces the published table.
   */
  readonly log: Int16Array;
}

/**
 * Build exp/antilog tables once. Throws if `generator` does not actually
 * generate F*_2^8 under `modulus` -- a silent non-generator would produce a
 * table with duplicate entries and a quietly wrong discrete log.
 */
export function buildLogTables(modulus: number, generator: number): LogTables {
  const exp = new Uint8Array(255);
  const log = new Int16Array(256).fill(-1);
  let v = 1;
  for (let k = 0; k < 255; k++) {
    exp[k] = v;
    // The identity is reached at k = 0 and again at k = 255. Record 255.
    log[v] = k === 0 ? 255 : k;
    v = gfMul(v, generator, modulus);
  }
  if (v !== 1) {
    throw new Error(
      `0x${generator.toString(16)} is not a generator of F*_2^8 modulo 0x${modulus.toString(16)}`,
    );
  }
  // A generator visits all 255 non-zero elements exactly once.
  for (let x = 1; x < 256; x++) {
    if (log[x] === -1) {
      throw new Error(
        `0x${generator.toString(16)} does not generate F*_2^8 modulo 0x${modulus.toString(16)}: ` +
          `0x${x.toString(16)} is unreachable`,
      );
    }
  }
  return { modulus, generator, exp, log };
}

/** generator^k, for any non-negative k. */
export function gfPow(tables: LogTables, k: number): number {
  return tables.exp[((k % 255) + 255) % 255];
}

/** Multiplicative inverse in F_2^8. inverse(0) is defined as 0, as FIPS 197 defines it. */
export function gfInv(a: number, modulus: number): number {
  if (a === 0) return 0;
  for (let x = 1; x < 256; x++) {
    if (gfMul(a, x, modulus) === 1) return x;
  }
  /* c8 ignore next -- unreachable: every non-zero element of a field is invertible */
  throw new Error(`0x${a.toString(16)} has no inverse modulo 0x${modulus.toString(16)}`);
}

/**
 * The subfield F_16 sitting inside F_2^8: {0} together with the order-15
 * multiplicative subgroup <generator^17>. 255 = 17 * 15, so the subgroup has
 * order 15 and, because F_16 is a subfield, it is closed under XOR once 0 joins
 * it -- which is exactly why this set is also a 4-dimensional GF(2) subspace.
 */
export function subfield16(tables: LogTables): number[] {
  const out: number[] = [0];
  for (let k = 0; k < 15; k++) out.push(tables.exp[(17 * k) % 255]);
  // Ascending, so callers can compare two spaces by value without re-sorting.
  return out.sort((a, b) => a - b);
}

/** Is `set` a GF(2)-subspace of F_2^8 (closed under XOR, contains 0)? */
export function isSubspace(set: readonly number[]): boolean {
  const s = new Set(set);
  if (!s.has(0)) return false;
  for (const a of s) for (const b of s) if (!s.has(a ^ b)) return false;
  return true;
}
