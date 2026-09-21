#!/usr/bin/env node
/**
 * Is the mutation ledger still attached to the source?
 *
 * `npm run test:mutation` is the real proof, and it takes minutes and a clean
 * tree, so it is not a CI step. But a ledger entry rots silently: someone
 * reformats a line, the `from` text stops matching, and the entry becomes a
 * mutation that can never be applied. Nothing goes red — the ledger only fails
 * when somebody runs it, which is exactly the shape of failure this repo exists
 * to make impossible.
 *
 * So this runs in CI, in the `verdict-coverage` job, and it is cheap: it reads
 * source text, executes nothing, and needs no browser.
 *
 * What it refuses to let through:
 *   - a `from` string that is not in its file EXACTLY once (a mutation that
 *     cannot be applied, or one that would be applied in the wrong place);
 *   - a `to` string already present in the file (the mutation would not be
 *     reversible, and `apply(entry, false)` would strand it);
 *   - a duplicate id, or two entries claiming the same `data-verdict` marker or
 *     the same `data-claim` measurement;
 *   - one entry claiming both families at once, which would make the coverage
 *     loop in e2e/verdicts.spec.ts count it twice and leave one of the two
 *     unowned;
 *   - a browser entry whose `--grep` matches no test name in e2e/, which is how
 *     a renamed test turns a mutation into a no-op that reports DEAD ORACLE.
 *
 * It does NOT check that a mutation is still CAUGHT. Only running it does that.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const LEDGER = JSON.parse(read('scripts/mutation-ledger.json'));

const e2e = readdirSync(join(ROOT, 'e2e'))
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => read(join('e2e', f)))
  .join('\n');

const problems = [];
const seenIds = new Set();
const seenMarkers = new Map();

for (const entry of LEDGER) {
  const { id, file, from, to, marker, claim, command, names, kind } = entry;

  if (seenIds.has(id)) problems.push(`${id}: duplicate ledger id`);
  seenIds.add(id);

  // Two marker families, judged on the same terms: `data-verdict` is a rendered
  // OUTCOME, `data-claim` a rendered MEASUREMENT. A number on the page is as
  // much a claim as a word, and it is the easier one to ship unchecked -- so a
  // measurement gets a mutation record exactly like a verdict does.
  if (marker && claim) {
    problems.push(
      `${id}: claims both a verdict marker ("${marker}") and a measurement ("${claim}"). One ` +
        `entry owns one rendered claim, or the coverage loop counts it twice and leaves one ` +
        `of the two unowned.`,
    );
  }
  for (const [family, value] of [
    ['verdict marker', marker],
    ['measurement', claim],
  ]) {
    if (!value) continue;
    if (seenMarkers.has(value)) {
      problems.push(`${id}: ${family} "${value}" is already claimed by ${seenMarkers.get(value)}`);
    }
    seenMarkers.set(value, id);
  }

  let text;
  try {
    text = read(file);
  } catch {
    problems.push(`${id}: ${file} does not exist`);
    continue;
  }

  const nFrom = text.split(from).length - 1;
  if (nFrom !== 1) {
    problems.push(
      `${id}: the "from" text appears ${nFrom} times in ${file}, not once — the ledger has drifted ` +
        `from the source and this mutation can no longer be applied.`,
    );
  }
  const nTo = text.split(to).length - 1;
  if (nTo !== 0) {
    problems.push(`${id}: the "to" text is already present in ${file}; the mutation is not reversible.`);
  }
  if (!names) problems.push(`${id}: no "names" string, so a failure for any reason would read as proof.`);

  // A browser entry points at a test by name. If that name no longer exists the
  // mutation applies, nothing runs, and the runner reports a DEAD ORACLE that
  // is really a typo.
  if (kind === 'browser') {
    const grep = /--grep\s+"([^"]+)"|--grep\s+(\S+)/.exec(command ?? '');
    const needle = grep ? (grep[1] ?? grep[2]) : null;
    if (!needle) {
      problems.push(`${id}: a browser entry must target one test with --grep, not a whole project.`);
    } else if (!new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(e2e)) {
      problems.push(`${id}: --grep "${needle}" matches no test name in e2e/.`);
    }
  }
}

const verdictMarkers = LEDGER.map((e) => e.marker).filter(Boolean).sort();
const claimMarkers = LEDGER.map((e) => e.claim).filter(Boolean).sort();
console.log(
  `Ledger: ${LEDGER.length} entries, ${verdictMarkers.length} covering a rendered verdict ` +
    `(${verdictMarkers.join(', ')}) and ${claimMarkers.length} covering a rendered measurement ` +
    `(${claimMarkers.join(', ')}).`,
);

if (problems.length) {
  console.error(`\nFAIL: ${problems.length} problem(s) with scripts/mutation-ledger.json\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('Every ledger entry still matches its source exactly once and names a test that exists.');
