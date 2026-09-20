/**
 * The coset partition -- the headline mechanism.
 *
 * F_2^8 contains the subfield F_16 = {0} u <alpha^17>. Because 255 = 17 * 15,
 * the 255 non-zero elements split into 17 multiplicative cosets of that
 * order-15 subgroup, and x's coset index is exactly log_alpha(x) mod 17 -- the
 * same `i` the TKlog branch arithmetic computes.
 *
 * Perrin's result is about where those cosets LAND. For pi, sixteen of the
 * seventeen land on additive cosets of one and the same 4-dimensional space:
 * the subfield F_16 itself. So pi carries a simple partition of its input onto
 * a simple partition of its output.
 *
 * WHAT THE NAIVE TEST DOES NOT SHOW. "Each coset lands on an additive coset of
 * some 4-dimensional space" is true of the AES S-box too, and for a dull reason:
 * a multiplicative coset a (*) F*_16 already IS a 4-dimensional subspace minus
 * zero, inversion maps it to another one, and AES's affine layer is GF(2)-linear.
 * All 17 of AES's cosets pass that test. What separates the two boxes is how
 * many DISTINCT spaces they land on: pi uses 2, AES uses 17. Only the first is a
 * partition. `spaceId` below is what the UI counts.
 */

import { isSubspace, subfield16, type LogTables } from './field';

export interface CosetView {
  /** i = log(x) mod 17, the coset index. */
  readonly index: number;
  /** The 15 inputs in this multiplicative coset, ascending. */
  readonly inputs: number[];
  /** Where those 15 inputs land, ascending. */
  readonly outputs: number[];
  /**
   * b, where outputs = { b XOR w : w in space, w != 0 }. Null when the landing
   * set is not an additive coset at all -- which is what a visitor's broken
   * constants produce.
   */
  readonly offset: number | null;
  /** The 4-dimensional space W (16 entries including 0), or null. */
  readonly space: number[] | null;
  /** True when that space is the subfield F_16 itself. */
  readonly spaceIsSubfield: boolean;
  /** A stable key for the space, so the UI can count distinct ones. */
  readonly spaceId: string | null;
}

/**
 * Recover the space a landing set is an additive coset of, if there is one.
 *
 * If outputs = b XOR (W \ {0}) then the pairwise XORs of outputs are exactly W,
 * which gives W without searching. b is then the one element of outputs[0] XOR W
 * that is missing from outputs. Both steps are re-checked against the definition
 * before the result is returned, so a wrong derivation cannot pass silently.
 */
export function additiveCosetOf(outputs: readonly number[]): { offset: number; space: number[] } | null {
  if (outputs.length !== 15) return null;
  const diffs = new Set<number>();
  for (const y1 of outputs) for (const y2 of outputs) diffs.add(y1 ^ y2);
  const space = [...diffs].sort((a, b) => a - b);
  // No `diffs.size === 16` test here, deliberately. Mutation testing showed one
  // to be unreachable: a GF(2) subspace has 2^k elements, so `isSubspace`
  // already rejects every size but 1, 2, 4, 8, 16, 32...; and the definition
  // check at the end requires |space| - 1 === 15, which rejects the rest. A
  // branch no input can reach is dead code, not a guard.
  if (!isSubspace(space)) return null;

  const members = new Set(outputs);
  const candidates = space.map((w) => outputs[0] ^ w).filter((v) => !members.has(v));
  if (candidates.length !== 1) return null;
  const offset = candidates[0];

  // Check the definition directly rather than trusting the derivation above.
  const rebuilt = space.filter((w) => w !== 0).map((w) => offset ^ w).sort((a, b) => a - b);
  const wanted = [...outputs].sort((a, b) => a - b);
  if (rebuilt.length !== wanted.length || rebuilt.some((v, idx) => v !== wanted[idx])) return null;
  return { offset, space };
}

const key = (space: readonly number[]) => space.join(',');

/** The 17 multiplicative cosets and where `box` sends each of them. */
export function cosetViews(box: readonly number[], field: LogTables): CosetView[] {
  const subfield = key(subfield16(field));
  const buckets: number[][] = Array.from({ length: 17 }, () => []);
  for (let x = 1; x < 256; x++) buckets[field.log[x] % 17].push(x);

  return buckets.map((inputs, index) => {
    const sorted = [...inputs].sort((a, b) => a - b);
    const outputs = [...new Set(sorted.map((x) => box[x]))].sort((a, b) => a - b);
    const found = outputs.length === 15 ? additiveCosetOf(outputs) : null;
    return {
      index,
      inputs: sorted,
      outputs,
      offset: found ? found.offset : null,
      space: found ? found.space : null,
      spaceIsSubfield: found ? key(found.space) === subfield : false,
      spaceId: found ? key(found.space) : null,
    };
  });
}

/** How many distinct landing spaces the 17 cosets use. 2 for pi; 17 for AES. */
export function distinctSpaceCount(views: readonly CosetView[]): number {
  return new Set(views.map((v) => v.spaceId).filter((v): v is string => v !== null)).size;
}

/**
 * Do the landing sets, plus box[0], tile all 256 outputs exactly once? That is
 * what makes pi's output structure a partition rather than a coincidence.
 */
export function tilesOutputSpace(views: readonly CosetView[], box: readonly number[]): boolean {
  const seen = new Set<number>([box[0]]);
  let total = 1;
  for (const v of views) {
    for (const y of v.outputs) {
      seen.add(y);
      total++;
    }
  }
  return total === 256 && seen.size === 256;
}
