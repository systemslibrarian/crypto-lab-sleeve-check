import { expect, test } from '@playwright/test';
import { auditRuntimeCoverage, requiredProjects, type LedgerEntry } from './coverage-audit';
import { LEDGER, readObservations, type Observation } from './observe';

/**
 * Did the assertions the ledger relies on actually RUN?
 *
 * This is the project the rest of the harness answers to, and it exists
 * because the rule it replaces could be satisfied by text. `verdicts.spec.ts`
 * used to require that a ledger entry's marker appear in a spec file as
 * `expectVerdict(page, '<id>'` -- and a substring match is satisfied by a call
 * inside a `//` comment, by a call in an unrelated test in the same file, and
 * by a call whose arguments were read off the page so it cannot fail. Sibling
 * labs in this fleet shipped all three: one serving `FOLDED 8 -> 1, VALID`
 * with `data-result="fail"`, one reporting a tampered proof as ADMITTED, both
 * with every gate green and the mutation record asserting that exact case was
 * covered.
 *
 * So coverage is taken from what ran. `e2e/verdict-assert.ts` records the
 * `(test title, marker)` pair of every call it EXECUTES, plus the finding that
 * call was making; `e2e/observe.ts` records any value read off a ledger marker
 * that went round the helper; and the audit below requires, for every ledger
 * entry, that the test the ledger names executed a call on that marker making
 * that finding -- and that nothing read the marker outside the helper.
 *
 * WHY ITS OWN PROJECT
 * -------------------
 * The assertion has to run AFTER every test that could contribute an
 * observation, and "later in the file" is not an ordering guarantee when
 * Playwright shards tests across worker processes. A project with
 * `dependencies: ['claims', 'verdicts']` is one: Playwright runs both to
 * completion first, and running THIS project pulls both in even when it is
 * named alone. `npm run test:verdicts` -- the command the CI job that branch
 * protection can require runs -- names this project for exactly that reason.
 *
 * The other half of that guarantee is `PROJECT-NOT-OBSERVED`: the ledger says
 * which project owns each kill, so a run that produced observations from only
 * one of them is reported rather than passing on a thin set. A check that
 * cannot see must not call the fleet clean; that is the defect this whole lane
 * is about.
 */

test('every ledger marker was asserted through the helper, by the test the ledger names', () => {
  const observations = readObservations();
  const findings = auditRuntimeCoverage(LEDGER as LedgerEntry[], observations);

  expect(
    findings.map((f) => `${f.code}: ${f.detail}`),
    'a mutation record whose assertion did not RUN the way the record says it does. A call that ' +
      'is only in the source -- commented out, made by another test, or fed values read off the ' +
      'page -- is not evidence that anything was checked',
  ).toEqual([]);

  // And the audit must have had something to judge: an empty run passing is
  // the exact shape this file exists to make impossible.
  expect(
    observations.filter((o) => o.kind === 'helper').length,
    'the run recorded no helper calls at all',
  ).toBeGreaterThan(LEDGER.filter((e) => e.marker || e.claim).length);
});

// ── the audit, watched failing ─────────────────────────────────────────────
//
// Synthetic input on purpose: the rules below have to be seen reporting each
// offence, and the only way to see that without breaking the real suite is to
// hand the audit a run that contains the offence.

const LEDGER_FIXTURE: LedgerEntry[] = [
  {
    id: 'diff-verdict-canned',
    kind: 'browser',
    marker: 'diff-verdict',
    command: 'npx playwright test --project=verdicts --grep "diff-verdict follows the distance"',
    names: 'diff-verdict must go red when the rebuild stops matching',
  },
  {
    id: 'verdict-retirement',
    kind: 'browser',
    marker: 'standing-verdict',
    command: 'npx playwright test --project=claims --grep "retires the standing verdict"',
    names: 'a broken constant must retire the standing verdict',
  },
];

const DIFF_KILL: Observation = {
  project: 'verdicts',
  test: 'diff-verdict follows the distance rather than reporting a fixed tone',
  marker: 'diff-verdict',
  family: 'verdict',
  kind: 'helper',
  because: 'diff-verdict must go red when the rebuild stops matching',
  state: 'fail',
};

const STANDING_KILL: Observation = {
  project: 'claims',
  test: 'editing a constant retires the standing verdict, and the page says so',
  marker: 'standing-verdict',
  family: 'verdict',
  kind: 'helper',
  because: 'a broken constant must retire the standing verdict',
  state: 'fail',
};

/**
 * A call on a marker the fixture ledger does not cover.
 *
 * It is here so that removing `DIFF_KILL` below removes the KILL without also
 * removing the last sign of life from the `verdicts` project -- otherwise the
 * project rule fires too and the test would be watching two rules at once
 * without being able to say which one bit.
 */
const UNRELATED: Observation = {
  project: 'verdicts',
  test: 'space-tally calls seventeen spaces what it is: not a partition',
  marker: 'space-tally',
  family: 'verdict',
  kind: 'helper',
  because: 'space-tally must deny a partition at seventeen spaces',
  state: 'none',
};

const HELD: Observation[] = [DIFF_KILL, STANDING_KILL, UNRELATED];

const codes = (ledger: LedgerEntry[], observations: Observation[]): string[] =>
  auditRuntimeCoverage(ledger, observations).map((f) => f.code);

test('the audit passes a run in which both owning tests made their call', () => {
  expect(auditRuntimeCoverage(LEDGER_FIXTURE, HELD)).toEqual([]);
});

test('the audit catches a helper call that never executed', () => {
  // Escape 1: comment the call out. The text survives in the source and the
  // old rule went on matching it; nothing at all reaches the sink.
  const withoutTheCall = HELD.filter((o) => o !== DIFF_KILL);
  expect(codes(LEDGER_FIXTURE, withoutTheCall)).toEqual(['NOT-EXECUTED']);
});

test('the audit catches a call made by some other test in the same file', () => {
  // Escape 3: the old rule was FILE-granular, so an unrelated call anywhere in
  // the file satisfied it while the killing assertion was rewritten away.
  const elsewhere: Observation[] = [
    STANDING_KILL,
    UNRELATED,
    { ...DIFF_KILL, test: 'the outside-a-marker detector catches a raw banner bolted onto the page' },
  ];
  expect(codes(LEDGER_FIXTURE, elsewhere)).toEqual(['NOT-EXECUTED']);
});

test('the audit catches a call that is not making the finding the ledger records', () => {
  // The same call, on the same marker, in the right test -- but asserting the
  // green state rather than the red one the mutation produces. The ledger's
  // `names` is what ties a kill to the claim it is a kill of.
  const wrongFinding: Observation[] = [
    STANDING_KILL,
    UNRELATED,
    { ...DIFF_KILL, because: 'diff-verdict must report a match on the unedited constants', state: 'pass' },
  ];
  expect(codes(LEDGER_FIXTURE, wrongFinding)).toEqual(['NOT-EXECUTED']);
});

test('the audit refuses a list of states as a kill', () => {
  // `state: ['pass','fail']` is a coherence check, not a claim about which
  // state the marker is in, so it cannot be the evidence for a mutation.
  const searched: Observation[] = [STANDING_KILL, UNRELATED, { ...DIFF_KILL, state: 'pass|fail' }];
  expect(codes(LEDGER_FIXTURE, searched)).toEqual(['NOT-EXECUTED']);
});

test('the audit catches a value read off a marker outside the helper', () => {
  // Escape 2: keep the call, feed it what the page already says. The pair is
  // recorded like any other -- what gives it away is the read.
  const tautology: Observation[] = [
    ...HELD,
    {
      project: 'verdicts',
      test: 'diff-verdict follows the distance rather than reporting a fixed tone',
      marker: 'diff-verdict',
      family: 'verdict',
      kind: 'raw',
      via: 'locator.textContent',
    },
  ];
  expect(codes(LEDGER_FIXTURE, tautology)).toEqual(['RAW-READ']);
});

test('the audit catches a run that judged only one of the projects the ledger names', () => {
  expect(requiredProjects(LEDGER_FIXTURE)).toEqual(['claims', 'verdicts']);
  const verdictsOnly = HELD.filter((o) => o.project === 'verdicts');
  expect(codes(LEDGER_FIXTURE, verdictsOnly)).toEqual(['PROJECT-NOT-OBSERVED', 'NOT-EXECUTED']);
});

test('the audit reports an empty sink rather than treating it as a clean run', () => {
  expect(codes(LEDGER_FIXTURE, [])).toEqual(['NO-OBSERVATIONS']);
});
