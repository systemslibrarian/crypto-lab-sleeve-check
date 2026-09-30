import { clearObservations } from './observe';

/**
 * Clear the marker-observation sink before anything runs.
 *
 * `e2e/coverage.spec.ts` asserts that every ledger entry's assertion actually
 * executed IN THIS RUN. A sink left behind by an earlier run would satisfy it
 * without anything having run at all -- a gate that is green because it is
 * reading yesterday's evidence, which is the same defect as a gate that is
 * green because it could not look.
 */
export default function globalSetup(): void {
  clearObservations();
}
