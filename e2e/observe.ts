import { test as base, expect } from '@playwright/test';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What actually ran, written down while it runs.
 *
 * WHY THIS EXISTS
 * ---------------
 * The coverage rule this lab shipped required that a ledger entry's marker be
 * asserted through `expectVerdict` / `expectClaim` -- and it checked that by
 * searching the SPEC SOURCE for the call. A source-text scan enforces a
 * MENTION, not an execution, and three independent auditors defeated the same
 * mechanism in sibling labs three different ways: comment the call out and the
 * text survives inside the comment; keep the call and feed it values read off
 * the page in the same test, so it cannot fail; or leave an unrelated call to
 * the same helper elsewhere in the file, because the scan is file-granular and
 * cannot tell which test made it.
 *
 * Each of those ships a live defect with the gate green. The fix is the same
 * correction this repo makes everywhere else: the denominator has to come from
 * what RAN, not from what the source says ran. So the helpers record the
 * `(test title, marker id)` pairs they actually execute, and
 * `e2e/coverage.spec.ts` asserts that every ledger entry's pair was observed.
 *
 * WHY A FILE RATHER THAN A MODULE-LEVEL SET
 * -----------------------------------------
 * Playwright runs tests in separate WORKER PROCESSES. A `Set` in this module
 * aggregates nothing across them -- each worker would see its own fragment and
 * the check would pass or fail depending on how the run happened to shard. So
 * every observation is appended as one NDJSON line under `test-results/`, one
 * file per worker process, and the whole run's observations are read back after
 * every test has finished.
 *
 * `clearObservations()` runs from `globalSetup`, so a stale file from an
 * earlier run cannot satisfy the check. That matters more than it sounds: the
 * failure mode this whole file exists to end is a gate that is green because it
 * could not see, and a leftover sink is exactly that shape.
 *
 * THE SECOND HALF: READING A MARKER OUTSIDE THE HELPER
 * ---------------------------------------------------
 * Recording the pair kills the commented-out call and the call made by some
 * other test. It does NOT kill the tautology -- a call that executes, with
 * expected values read off the page in the same test, records its pair like any
 * other.
 *
 * What a tautology needs is a READ of the marker it is about to judge. So the
 * read is what is caught: the `Locator` value-extraction methods are wrapped
 * once per worker, and any extraction from a ledger marker made OUTSIDE
 * `expectVerdict` / `expectClaim` is recorded as a raw read. The rule the audit
 * then applies is that a ledger marker is read through the helper or not at all
 * -- which is the same sentence as "make the helper's reading the thing
 * asserted", enforced rather than asked for.
 *
 * Web-first assertions (`expect(locator).toHaveAttribute(...)`) are NOT
 * extractions and are not recorded: they compare inside the assertion and hand
 * the test no value to build an expectation out of. That distinction is the
 * whole point -- `reachTableDiffed` waits on `#diff-verdict` in almost every
 * test in this repo and none of those waits is a tautology risk.
 *
 * ITS LIMIT, STATED
 * -----------------
 * `page.evaluate` and `page.$eval` are wrapped too, by looking for a ledger
 * marker id in the function source or its argument, which is a text scan of
 * something that really did run. A read that reaches a marker without naming it
 * -- walking up from a sibling, or reading a second element that mirrors the
 * same value -- is not caught. That is a narrower hole than the one this
 * replaces, and it is written here rather than left to be discovered.
 */

interface LedgerEntry {
  id: string;
  kind: string;
  marker?: string | null;
  claim?: string | null;
  command?: string;
  names?: string;
}

export const LEDGER: LedgerEntry[] = JSON.parse(
  readFileSync(new URL('../scripts/mutation-ledger.json', import.meta.url), 'utf8'),
);

/** Every marker id the ledger covers, of either family. */
export const LEDGER_MARKERS = new Map<string, 'verdict' | 'claim'>([
  ...LEDGER.filter((e) => e.marker).map((e) => [e.marker as string, 'verdict'] as const),
  ...LEDGER.filter((e) => e.claim).map((e) => [e.claim as string, 'claim'] as const),
]);

export const OBSERVATION_DIR = fileURLToPath(
  new URL('../test-results/marker-observations/', import.meta.url),
);

export interface Observation {
  /** The Playwright project the observing test ran in. */
  project: string;
  /** The test's own title, which is what the ledger's `--grep` names. */
  test: string;
  marker: string;
  family: 'verdict' | 'claim';
  /** `helper` is a call through verdict-assert.ts; `raw` is a read that went round it. */
  kind: 'helper' | 'raw';
  /** The finding the helper call was making -- the ledger's `names` field, when it matches. */
  because?: string;
  /** The state asserted, serialised. A list means "one of these", which is not a kill. */
  state?: string;
  /** For a raw read: which extraction method reached the marker. */
  via?: string;
}

export function clearObservations(): void {
  rmSync(OBSERVATION_DIR, { recursive: true, force: true });
}

export function record(observation: Observation): void {
  mkdirSync(OBSERVATION_DIR, { recursive: true });
  // One file per worker process. Appending short lines to a shared file would
  // usually be atomic and occasionally would not; a file per pid cannot
  // interleave at all, and the reader concatenates them.
  appendFileSync(join(OBSERVATION_DIR, `${process.pid}.ndjson`), `${JSON.stringify(observation)}\n`);
}

export function readObservations(): Observation[] {
  let files: string[];
  try {
    files = readdirSync(OBSERVATION_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith('.ndjson'))
    .flatMap((f) =>
      readFileSync(join(OBSERVATION_DIR, f), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Observation),
    );
}

// ── the helper-depth flag ───────────────────────────────────────────────────
//
// Playwright runs one test at a time inside a worker, so a module-level counter
// is enough to tell "this read came from inside verdict-assert.ts" from "this
// read came from a test". It is a counter rather than a boolean because the
// helpers are allowed to call one another.

let depth = 0;
export const enterHelper = (): void => {
  depth += 1;
};
export const exitHelper = (): void => {
  depth -= 1;
};

/** The ledger marker a selector (or an evaluated function's text) names, if any. */
export function markerNamedBy(text: string): string | null {
  for (const id of LEDGER_MARKERS.keys()) {
    if (
      text.includes(`data-verdict="${id}"`) ||
      text.includes(`data-claim="${id}"`) ||
      new RegExp(`#${id}(?![\\w-])`).test(text)
    ) {
      return id;
    }
  }
  return null;
}

function noteRawRead(marker: string, via: string): void {
  let info: { title: string; project: { name: string } };
  try {
    info = base.info();
  } catch {
    return; // outside a test: a fixture or a teardown, not a claim about a marker
  }
  record({
    project: info.project.name,
    test: info.title,
    marker,
    family: LEDGER_MARKERS.get(marker) ?? 'verdict',
    kind: 'raw',
    via,
  });
}

/**
 * The `Locator` methods that hand a VALUE back to the test. Anything on this
 * list can be used to build an expectation; nothing off it can.
 */
const LOCATOR_EXTRACTORS = [
  'textContent',
  'innerText',
  'innerHTML',
  'getAttribute',
  'inputValue',
  'allTextContents',
  'allInnerTexts',
  'evaluate',
  'evaluateAll',
  'evaluateHandle',
  'elementHandle',
  'elementHandles',
];

/** The `Page` methods that run script against the document. */
const PAGE_EVALUATORS = ['evaluate', 'evaluateHandle', '$eval', '$$eval'];

let installed = false;

function installMarkerReadTripwire(page: unknown): void {
  if (installed) return;
  installed = true;

  const anyPage = page as any;
  const locatorProto = Object.getPrototypeOf(anyPage.locator('html'));
  for (const name of LOCATOR_EXTRACTORS) {
    const original = locatorProto[name];
    if (typeof original !== 'function') continue;
    locatorProto[name] = function (this: unknown, ...args: unknown[]) {
      if (depth === 0) {
        const marker = markerNamedBy(String(this));
        if (marker) noteRawRead(marker, `locator.${name}`);
      }
      return original.apply(this, args);
    };
  }

  const pageProto = Object.getPrototypeOf(anyPage);
  for (const name of PAGE_EVALUATORS) {
    const original = pageProto[name];
    if (typeof original !== 'function') continue;
    pageProto[name] = function (this: unknown, ...args: unknown[]) {
      if (depth === 0) {
        const marker = markerNamedBy(args.map((a) => stringifyArg(a)).join(' '));
        if (marker) noteRawRead(marker, `page.${name}`);
      }
      return original.apply(this, args);
    };
  }
}

function stringifyArg(value: unknown): string {
  if (typeof value === 'function' || typeof value === 'string') return String(value);
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

/**
 * The `test` the marker-bearing specs import.
 *
 * It is the stock one with a `page` fixture that arms the tripwire before the
 * test body runs -- before, deliberately, so a read made in the first line of a
 * test is seen. The patch is on the shared prototype, so one worker arms it
 * once.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    installMarkerReadTripwire(page);
    await use(page);
  },
});

export { expect };
