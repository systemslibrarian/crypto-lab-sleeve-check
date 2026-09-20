#!/usr/bin/env node
/**
 * The mutation ledger -- template §4.1c, made reproducible.
 *
 * A green suite is not evidence until you have watched it fail. This script is
 * the documented form of that check: for each entry below it inverts one thing
 * in the SOURCE, proves the mutation actually reached the browser, runs the
 * test that owns it, and requires that test to fail NAMING the finding.
 *
 * The five rules it enforces, each learned the hard way:
 *
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
 * Each entry names the highest-risk branch it protects. `names` is the string
 * the failing test must print: without it, a test that fails for some unrelated
 * reason would read as proof.
 */
const LEDGER = [
  {
    id: 'identity-log',
    kind: 'unit',
    why: 'log_alpha(1) must be 255, not 0 -- the single easiest thing in this lab to get subtly wrong',
    file: 'src/gost/field.ts',
    from: 'log[v] = k === 0 ? 255 : k;',
    to: 'log[v] = k;',
    command: 'npx vitest run src/gost/tklog.test.ts',
    names: 'tklog(i) === pi[i] for all 256 i',
  },
  {
    id: 'subgroup-branch',
    kind: 'unit',
    why: 'the 17 | l branch of the TKlog, which the brief calls the highest off-by-one risk here',
    file: 'src/gost/tklog.ts',
    from: '  if (i === 0) {',
    to: '  if (i === 1) {',
    command: 'npx vitest run src/gost/tklog.test.ts',
    names: 'Hamming distance is strictly 0',
  },
  {
    id: 'l-coefficient',
    kind: 'unit',
    why: 'the RFC 7801 §4.2 coefficient corrected by erratum EID 6928',
    file: 'src/gost/kuznyechik.ts',
    from: '148, 32, 133,',
    to: '148, 33, 133,',
    command: 'npx vitest run src/gost/kuznyechik.test.ts',
    names: '5.5: encrypt reaches the published ciphertext',
  },
  {
    id: 'kuznyechik-field',
    kind: 'unit',
    why: 'INV-7 -- the L transformation must use field Q (0x1C3), not the TKlog field',
    file: 'src/gost/field.ts',
    from: 'export const POLY_KUZNYECHIK = 0x1c3;',
    to: 'export const POLY_KUZNYECHIK = 0x11d;',
    command: 'npx vitest run src/gost/kuznyechik.test.ts',
    names: 'Section 5 known-answer tests',
  },
  {
    id: 'decrypt-round-order',
    kind: 'unit',
    why: 'the inverse round order, where §4.5.2 prints its composition differently from §5.6',
    file: 'src/gost/kuznyechik.ts',
    from: '    state = transformSInv(transformLInv(state));',
    to: '    state = transformLInv(transformSInv(state));',
    command: 'npx vitest run src/gost/kuznyechik.test.ts',
    names: '5.6: decrypt recovers the published plaintext',
  },
  {
    id: 'aes-affine',
    kind: 'unit',
    why: 'the FIPS 197 affine constant, which is what makes AES the control it is',
    file: 'src/gost/aes.ts',
    from: 'AES_AFFINE_CONSTANT) & 0xff;',
    to: 'AES_AFFINE_CONSTANT ^ 1) & 0xff;',
    command: 'npx vitest run src/gost/aes.test.ts',
    names: 'matches the published lookup table at the spot checks',
  },
  {
    id: 'subspace-closure',
    kind: 'unit',
    why: 'the closure test that is the real gate on "is this landing set a coset?"',
    file: 'src/gost/field.ts',
    from: 'for (const a of s) for (const b of s) if (!s.has(a ^ b)) return false;',
    to: 'for (const a of s) for (const b of s) if (!s.has(a ^ b)) return true;',
    command: 'npx vitest run src/gost/cosets.test.ts src/gost/field.test.ts',
    names: 'isSubspace rejects a set missing 0',
  },
  {
    id: 'source-path-isolation',
    kind: 'unit',
    why: 'INV-5 -- the generator must not be able to see the published table',
    file: 'src/gost/tklog.ts',
    from: "import { buildLogTables, gfPow, POLY_TKLOG, type LogTables } from './field';",
    to:
      "import { buildLogTables, gfPow, POLY_TKLOG, type LogTables } from './field';\n" +
      "import { PI_RFC7801 } from './reference';\n" +
      'export const MUTATION_PROBE = PI_RFC7801.length;',
    command: 'npx vitest run src/gost/moduleGraph.test.ts',
    names: 'tklog.ts does not import the published table',
  },
  {
    id: 'verdict-retirement',
    kind: 'browser',
    why: 'a broken constant must retire the green verdict, not leave a stale one on screen',
    file: 'src/ui/tablePane.ts',
    from: '      onDiffed(diffTables(generated, PI).distance);\n    }',
    to: '      onDiffed(0);\n    }',
    // Pointed at the retirement test, not the 4.1d fixture: the fixture never
    // edits a constant, so it never reaches this call site. The first run of
    // this ledger reported a DEAD ORACLE here, and it was right -- the source
    // was correct and the coverage was missing.
    command: 'npx playwright test --project=claims --grep "retires the standing verdict"',
    names: 'the two panes must report the same distance',
  },
  {
    id: 'negative-claim',
    kind: 'browser',
    why: '§4.1d -- the limitation must be on screen in the all-green fixture state',
    file: 'src/ui/claimPane.ts',
    // Replaced rather than deleted. An empty `to` matches at every position in
    // the file, so the reverse direction cannot be checked for uniqueness --
    // the first run of this ledger found 16192 occurrences of '' and stranded
    // the mutation. A mutation must be unique in BOTH directions.
    from: 'It is not an attack, and it does not become one by being exact. ',
    to: 'It is an attack. ',
    command: 'npx playwright test --project=claims --grep "4.1d"',
    names: 'It is not an attack',
  },
  {
    id: 'scroller-keyboard-route',
    kind: 'browser',
    why: 'WCAG 2.1.1 -- four lookup tables scroll, and axe alone does not catch a missing route',
    file: 'src/ui/dom.ts',
    from: "return el('div', { class: 'scroll-x', tabindex: '0', role: 'group', 'aria-label': label }, [child]);",
    to: "return el('div', { class: 'scroll-x', role: 'group', 'aria-label': label }, [child]);",
    command: 'npx playwright test --project=a11y --grep 380',
    names: 'scroll-x',
  },
  {
    id: 'mobile-hero-basis',
    kind: 'browser',
    why: 'the flex-basis that leaked into the cross axis and left 190px of dead space on a phone',
    file: 'src/styles.css',
    from: '  .cl-hero-main { flex: 0 1 auto; width: 100%; min-width: 0; }',
    to: '  .cl-hero-main { width: 100%; min-width: 0; }',
    command: 'npx playwright test --project=flows-chromium --grep "dead space"',
    names: 'hero dead space at 380px',
  },
];

const only = process.argv[2];
const entries = LEDGER.filter((e) => !only || e.id === only || e.kind === only);
if (entries.length === 0) {
  console.error(`No ledger entry matches "${only}". Ids: ${LEDGER.map((e) => e.id).join(', ')}`);
  process.exit(2);
}

const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });

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

const results = [];
for (const entry of entries) {
  process.stdout.write(`${entry.id.padEnd(26)} `);
  let restored = false;
  try {
    apply(entry, true);
    const built = build();
    const mutated = built ? bundleHash() : null;
    const owner = built ? runOwner(entry.command) : { failed: false, output: '' };
    apply(entry, false);
    restored = true;
    build();
    const back = bundleHash();

    const verdict = !built
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
    console.log(
      verdict === 'OK'
        ? `ok    ${baseline} -> ${mutated} -> ${back}   caught by: ${entry.names}`
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
process.exit(bad.length ? 1 : 0);
