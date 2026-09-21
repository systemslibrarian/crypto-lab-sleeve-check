#!/usr/bin/env node
/**
 * The mutation ledger -- template §4.1c, made reproducible.
 *
 * A green suite is not evidence until you have watched it fail. This script is
 * the documented form of that check: for each entry below it inverts one thing
 * in the SOURCE, proves the mutation actually reached the browser, runs the
 * test that owns it, and requires that test to fail NAMING the finding.
 *
 * The six rules it enforces, each learned the hard way:
 *
 *  0. The owning test must PASS on the UNMUTATED tree, in this same run. A
 *     mutation "caught" by a test that was already red is not caught by
 *     anything; the run has to record the green baseline beside the red one.
 *  1. The build must SUCCEED under the mutation. A mutation that breaks `tsc`
 *     proves nothing: the suite would run against the last good bundle and pass.
 *  2. The bundle hash must CHANGE, which is what proves the mutation reached the
 *     browser rather than being tree-shaken or shadowed.
 *  3. The owning test must FAIL, and its output must match `names` -- a test
 *     that fails for an unrelated reason is not evidence about this branch.
 *  4. The mutation is restored immediately and the hash must return to its
 *     pre-mutation value.
 *  5. It refuses to start on a dirty tree, so a crash mid-run cannot strand an
 *     inverted condition in a file that also holds real work. A session that
 *     died mid-check did exactly that four times in one day elsewhere in this
 *     fleet, and two of those did not break `tsc`.
 *
 * A mutation that leaves every test green is reported as a DEAD ORACLE, and it
 * is evidence about the source, not the tests: it may mean the branch is
 * unreachable. That is not hypothetical here -- the first run of this ledger
 * found `diffs.size !== 16` in `additiveCosetOf` to be unreachable, and it was
 * deleted in d2ff0ff rather than given a test that could not fail.
 *
 * Usage:  npm run test:mutation            (all entries)
 *         npm run test:mutation -- unit    (only the fast Vitest-owned ones)
 *         npm run test:mutation -- <id>    (one entry)
 */

import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist', 'assets');

/**
 * The ledger itself is DATA, in scripts/mutation-ledger.json, because two
 * different things have to read it:
 *
 *   - this runner, which applies each mutation and requires the owning test to
 *     go red naming the finding;
 *   - e2e/verdicts.spec.ts, which walks the RENDERED page for `data-verdict`
 *     markers and fails on any marker the ledger does not cover.
 *
 * Keeping it as a literal in this file would have meant the coverage check
 * carrying its own copy of the list, and two copies of a list is how a verdict
 * ends up covered on paper and uncovered in fact.
 *
 * Fields:
 *   id       short name, also the CLI selector
 *   kind     `unit` (Vitest) or `browser` (Playwright)
 *   marker   the `data-verdict` id this mutation covers, or null when the
 *            mutation guards something that is not a rendered verdict
 *   why      the branch it protects, in one line
 *   file     the source file to edit
 *   from/to  the exact text to swap, unique in BOTH directions
 *   command  the test that owns it -- ONE test where possible, so the failure
 *            is that verdict's own assertion and not the suite going red
 *   names    the string the failing output must contain
 */
const LEDGER = JSON.parse(readFileSync(new URL('./mutation-ledger.json', import.meta.url), 'utf8'));

const only = process.argv[2];
const entries = LEDGER.filter((e) => !only || e.id === only || e.kind === only);
if (entries.length === 0) {
  console.error(`No ledger entry matches "${only}". Ids: ${LEDGER.map((e) => e.id).join(', ')}`);
  process.exit(2);
}

// CI=1 on purpose. It flips playwright.config.ts's `reuseExistingServer:
// !process.env.CI` to FALSE, so a browser mutation cannot be judged against a
// server left listening by an earlier, UNMUTATED run -- which reports a real
// kill as a survivor and sends someone to fix a check that already works.
const sh = (cmd) =>
  execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, CI: '1' } });

function bundleHash() {
  const files = readdirSync(DIST).sort();
  const h = createHash('sha256');
  for (const f of files) h.update(f).update(readFileSync(join(DIST, f)));
  return h.digest('hex').slice(0, 12);
}

function build() {
  try {
    sh('npm run build');
    return true;
  } catch {
    return false;
  }
}

/** Runs the owning test. Returns {failed, output}. */
function runOwner(command) {
  try {
    return { failed: false, output: sh(command) };
  } catch (err) {
    return { failed: true, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const write = (rel, text) => writeFileSync(join(ROOT, rel), text);

function apply(entry, forward) {
  const [from, to] = forward ? [entry.from, entry.to] : [entry.to, entry.from];
  const text = read(entry.file);
  const count = text.split(from).length - 1;
  if (count !== 1) {
    throw new Error(
      `${entry.id}: expected exactly one occurrence of the ${forward ? 'original' : 'mutated'} text ` +
        `in ${entry.file}, found ${count}. The ledger has drifted from the source.`,
    );
  }
  write(entry.file, text.replace(from, to));
}

// Rule 5: refuse to start with uncommitted changes to TRACKED files.
//
// Untracked files are excluded deliberately. The risk this guards against is a
// run dying with an inverted condition stranded in a file that also holds real
// work -- which can only happen to a file the ledger edits, and every one of
// those is tracked. Blocking on an untracked scratch file would just teach
// people to pass the override.
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  cwd: ROOT,
  encoding: 'utf8',
}).trim();
if (dirty && !process.env.MUTATION_ALLOW_DIRTY) {
  console.error('Refusing to run: there are uncommitted changes to tracked files.\n');
  console.error(dirty);
  console.error(
    '\nCommit first. A run that dies mid-check otherwise strands an inverted condition in a file\n' +
      'that also holds real work, and not every such mutation breaks the typecheck.\n' +
      'Set MUTATION_ALLOW_DIRTY=1 to override, knowing that.',
  );
  process.exit(2);
}

console.log('Building the baseline...');
if (!build()) {
  console.error('The baseline build fails. Fix that before mutating anything.');
  process.exit(2);
}
const baseline = bundleHash();
console.log(`Baseline bundle ${baseline}\n`);

/**
 * The excerpt of a run's output that is worth quoting as evidence: the lines
 * around the assertion message, not the whole reporter transcript.
 */
function excerpt(output, needle) {
  const lines = output.split('\n');
  const at = lines.findIndex((l) => l.includes(needle));
  if (at < 0) return lines.slice(-12).join('\n');
  return lines.slice(Math.max(0, at - 2), at + 10).join('\n');
}

const evidence = [];
const results = [];
for (const entry of entries) {
  process.stdout.write(`${entry.id.padEnd(26)} `);
  let restored = false;
  try {
    // Rule 0, and the one this ledger was missing: run the owning test on the
    // UNMUTATED tree first and require it to PASS. Without that, a red suite
    // makes every mutation look caught -- the failure was there before the
    // mutation arrived, and "the test went red" stops being evidence about the
    // branch. A baseline that is already red is reported, not worked around.
    const baselineRun = runOwner(entry.command);

    apply(entry, true);
    const built = build();
    const mutated = built ? bundleHash() : null;
    const owner = built ? runOwner(entry.command) : { failed: false, output: '' };
    apply(entry, false);
    restored = true;
    build();
    const back = bundleHash();

    const verdict = baselineRun.failed
      ? 'BASELINE ALREADY RED'
      : !built
        ? 'BUILD BROKE'
        : mutated === baseline
          ? 'HASH UNCHANGED'
          : !owner.failed
            ? 'DEAD ORACLE'
            : !owner.output.includes(entry.names)
              ? 'FAILED FOR THE WRONG REASON'
              : back !== baseline
                ? 'NOT RESTORED'
                : 'OK';
    results.push({ entry, verdict, mutated, back });
    evidence.push(
      [
        `=== ${entry.id}${entry.marker ? `   marker: ${entry.marker}` : ''}`,
        `    ${entry.why}`,
        `    mutation: ${entry.file}`,
        `      -  ${entry.from.split('\n').join('\n      -  ')}`,
        `      +  ${entry.to.split('\n').join('\n      +  ')}`,
        `    owning test: ${entry.command}`,
        `    BASELINE (unmutated, same run): ${baselineRun.failed ? 'FAILED' : 'PASSED'}`,
        `      ${excerpt(baselineRun.output, 'passed').split('\n').join('\n      ')}`,
        `    MUTATED: bundle ${baseline} -> ${mutated}`,
        `      ${excerpt(owner.output, entry.names).split('\n').join('\n      ')}`,
        `    RESTORED: bundle ${back}${back === baseline ? ' (back to baseline)' : ' (NOT BACK)'}`,
        `    VERDICT: ${verdict}`,
        '',
      ].join('\n'),
    );
    console.log(
      verdict === 'OK'
        ? `ok    baseline PASS   ${baseline} -> ${mutated} -> ${back}   caught by: ${entry.names}`
        : `${verdict}`,
    );
    if (verdict !== 'OK') console.log(`    ${entry.why}`);
  } catch (err) {
    if (!restored) {
      try {
        apply(entry, false);
        build();
      } catch {
        console.error(`\n!! Could not restore ${entry.file}. Run: git checkout -- ${entry.file}`);
      }
    }
    results.push({ entry, verdict: `ERROR: ${err.message}` });
    console.log(`ERROR  ${err.message}`);
  }
}

const bad = results.filter((r) => r.verdict !== 'OK');
console.log(
  `\n${results.length - bad.length}/${results.length} mutations were caught by the test that owns them.`,
);
if (bad.length) {
  console.log('\nNot caught:');
  for (const r of bad) console.log(`  ${r.entry.id}: ${r.verdict}\n    ${r.entry.why}`);
  console.log(
    '\nA DEAD ORACLE is evidence about the SOURCE, not only the tests: the branch may be\n' +
      'unreachable, in which case the right fix is deleting it rather than adding a test\n' +
      'that cannot fail.',
  );
}
// The transcript, for the commit body. A mutation quoted without the baseline
// that passed beside it is not evidence of a kill -- it is evidence that
// something was red.
if (process.env.MUTATION_EVIDENCE) {
  writeFileSync(process.env.MUTATION_EVIDENCE, evidence.join('\n'));
  console.log(`\nEvidence written to ${process.env.MUTATION_EVIDENCE}`);
}

process.exit(bad.length ? 1 : 0);
