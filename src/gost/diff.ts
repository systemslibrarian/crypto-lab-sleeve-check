/**
 * The comparison site.
 *
 * INV-5 puts the generator and the published table in separate modules that do
 * not see each other. This is the one module allowed to hold both, because
 * comparing them is its entire job.
 */

export interface DiffResult {
  /** Indices where the two arrays differ. Empty means byte-for-byte equality. */
  readonly mismatches: number[];
  /** Number of differing entries. INV-2 requires this to be strictly 0. */
  readonly distance: number;
  readonly equal: boolean;
}

export function diffTables(generated: readonly number[], reference: readonly number[]): DiffResult {
  if (generated.length !== reference.length) {
    throw new Error(`length mismatch: ${generated.length} vs ${reference.length}`);
  }
  const mismatches: number[] = [];
  for (let idx = 0; idx < reference.length; idx++) {
    if (generated[idx] !== reference[idx]) mismatches.push(idx);
  }
  return { mismatches, distance: mismatches.length, equal: mismatches.length === 0 };
}

/** Is this 256-entry array a permutation of 0..255? */
export function isPermutation(table: readonly number[]): boolean {
  if (table.length !== 256) return false;
  const seen = new Uint8Array(256);
  for (const v of table) {
    if (v < 0 || v > 255 || seen[v]) return false;
    seen[v] = 1;
  }
  return true;
}
