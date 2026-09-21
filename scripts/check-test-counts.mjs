#!/usr/bin/env node
/**
 * Keep the README's test counts honest.
 *
 * A README that advertises "117 tests" is a claim like any other, and it is the
 * one most likely to rot: tests get added, the sentence does not, and the
 * document quietly starts overstating what runs. This asks the runners how many
 * tests they actually have and compares.
 *
 * It is wired into `npm run verify` AND into the CI gate, as a step in the one
 * `build` job of deploy.yml.
 *
 * It used to be local-only, on the argument that a drifted count is a
 * documentation defect rather than a reason to block a deploy of correct code,
 * and that two test listers are too slow for a gate. The second half was simply
 * wrong: listing executes nothing and needs no browser binaries, and the whole
 * check is 1.2s. The first half was the more expensive mistake -- it left the
 * README's count sentence as the one claim in this lab protected only by a
 * human remembering to run `verify`, which is precisely the drift the rest of
 * this repo exists to make impossible.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** Vitest reports one entry per test case. */
function vitestCount() {
  return JSON.parse(sh('npx vitest list --json')).length;
}

/**
 * Playwright lists every test once per PROJECT, which is the number that
 * matters: a flow spec running in four engines really is four runs, and the
 * README should say what CI executes rather than how many `test()` calls exist.
 */
function playwrightCounts() {
  const listed = JSON.parse(sh('npx playwright test --list --reporter=json'));
  const perProject = new Map();
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        perProject.set(t.projectName, (perProject.get(t.projectName) ?? 0) + 1);
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of listed.suites ?? []) walk(suite);
  return perProject;
}

const vitest = vitestCount();
const pw = playwrightCounts();
const a11y = pw.get('a11y') ?? 0;
const claims = pw.get('claims') ?? 0;
const flows = [...pw].filter(([name]) => name.startsWith('flows-')).reduce((n, [, c]) => n + c, 0);
const total = vitest + a11y + claims + flows;

const actual = { vitest, claims, flows, a11y, total };
console.log(
  `Counted: ${vitest} Vitest + ${claims} claims + ${flows} cross-browser flows + ${a11y} axe gates = ${total}`,
);

const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const line = /\*\*(\d+) tests,[^*]*?(\d+) Vitest \+ (\d+) Playwright claims \+ (\d+) cross-browser flow runs \+ (\d+) axe gates\.\*\*/.exec(
  readme,
);
if (!line) {
  console.error(
    '\nFAIL: could not find the counts sentence in README.md.\nExpected the shape:\n' +
      `  **${total} tests, all executed in CI: ${vitest} Vitest + ${claims} Playwright claims + ${flows} cross-browser flow runs + ${a11y} axe gates.**`,
  );
  process.exit(1);
}

const claimed = {
  total: +line[1],
  vitest: +line[2],
  claims: +line[3],
  flows: +line[4],
  a11y: +line[5],
};
const wrong = Object.keys(actual).filter((k) => actual[k] !== claimed[k]);
if (wrong.length) {
  console.error('\nFAIL: the README disagrees with the runners.');
  for (const k of wrong) console.error(`  ${k}: README says ${claimed[k]}, actually ${actual[k]}`);
  console.error(
    `\nFix the sentence to read:\n` +
      `  **${total} tests, all executed in CI: ${vitest} Vitest + ${claims} Playwright claims + ${flows} cross-browser flow runs + ${a11y} axe gates.**`,
  );
  process.exit(1);
}
if (claimed.vitest + claimed.claims + claimed.flows + claimed.a11y !== claimed.total) {
  console.error('\nFAIL: the README total does not equal the sum of its own parts.');
  process.exit(1);
}
console.log('README test counts agree with the runners, and sum to their own total.');
