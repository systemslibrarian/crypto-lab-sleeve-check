import type { Observation } from './observe';

/**
 * The runtime coverage rule, as a pure function.
 *
 * It is pure so it can be WATCHED FAILING with synthetic input -- the same
 * standard the three page-walking detectors in `e2e/verdicts.spec.ts` are held
 * to. A rule nobody has seen report an offence is in the same category as a
 * verdict nobody has seen go red.
 *
 * What it judges is a run's OBSERVATIONS: the `(test title, marker)` pairs the
 * helpers recorded while they executed. What it judges them against is
 * `scripts/mutation-ledger.json`, which already names, for every mutation, the
 * marker it covers, the test that owns it (`--grep`), the project that test
 * runs in (`--project`) and the finding the failure must name (`names`). All
 * four are data this repo already keeps; none of them is a second list written
 * down for this check.
 */

export interface LedgerEntry {
  id: string;
  kind: string;
  marker?: string | null;
  claim?: string | null;
  command?: string;
  names?: string;
}

export interface Finding {
  code: 'NO-OBSERVATIONS' | 'PROJECT-NOT-OBSERVED' | 'NOT-EXECUTED' | 'RAW-READ';
  detail: string;
}

/** The marker a ledger entry covers, with which family it belongs to. */
export function coveredMarker(entry: LedgerEntry): { id: string; family: 'verdict' | 'claim' } | null {
  if (entry.marker) return { id: entry.marker, family: 'verdict' };
  if (entry.claim) return { id: entry.claim, family: 'claim' };
  return null;
}

const grepOf = (command: string | undefined): string | null =>
  /--grep\s+"([^"]+)"/.exec(command ?? '')?.[1] ?? null;

const projectOf = (command: string | undefined): string | null =>
  /--project=([\w-]+)/.exec(command ?? '')?.[1] ?? null;

/**
 * Every project the ledger relies on for a marker's kill.
 *
 * This is what stops the check being defeated by running one project. The
 * ledger's own entries say that `standing-verdict` is killed in `claims` and
 * the other twelve in `verdicts`; a run that produced observations from only
 * one of those has not judged the other, and saying so is the difference
 * between a gate and a decoration.
 */
export function requiredProjects(ledger: LedgerEntry[]): string[] {
  const names = new Set<string>();
  for (const entry of ledger) {
    if (entry.kind !== 'browser' || !coveredMarker(entry)) continue;
    const project = projectOf(entry.command);
    if (project) names.add(project);
  }
  return [...names].sort();
}

export function auditRuntimeCoverage(ledger: LedgerEntry[], observations: Observation[]): Finding[] {
  const findings: Finding[] = [];

  if (observations.length === 0) {
    findings.push({
      code: 'NO-OBSERVATIONS',
      detail:
        'no marker was asserted anywhere in this run. Either nothing ran, or the sink under ' +
        'test-results/marker-observations/ was never written -- both of which are a check that ' +
        'could not see rather than a run that was clean.',
    });
    return findings;
  }

  const projectsSeen = new Set(observations.map((o) => o.project));
  for (const project of requiredProjects(ledger)) {
    if (!projectsSeen.has(project)) {
      findings.push({
        code: 'PROJECT-NOT-OBSERVED',
        detail:
          `the ledger owns a kill in the "${project}" project, and no test in it recorded an ` +
          `assertion in this run. Run the coverage project (which depends on the others) rather ` +
          `than one project on its own.`,
      });
    }
  }

  for (const entry of ledger) {
    const covered = coveredMarker(entry);
    if (entry.kind !== 'browser' || !covered) continue;
    const grep = grepOf(entry.command);
    if (!grep) {
      findings.push({
        code: 'NOT-EXECUTED',
        detail: `${entry.id}: its command names no --grep, so there is no owning test to look for`,
      });
      continue;
    }

    const byOwner = observations.filter(
      (o) => o.kind === 'helper' && o.marker === covered.id && o.test.includes(grep),
    );
    const satisfying = byOwner.filter(
      (o) => o.because === entry.names && (covered.family === 'claim' || !(o.state ?? '').includes('|')),
    );
    if (satisfying.length === 0) {
      findings.push({
        code: 'NOT-EXECUTED',
        detail:
          `${entry.id}: no ${covered.family === 'claim' ? 'expectClaim' : 'expectVerdict'}(page, ` +
          `'${covered.id}', …) making the finding "${entry.names}" was EXECUTED by the test the ` +
          `ledger names ("${grep}"). ` +
          (byOwner.length === 0
            ? 'That test asserted this marker through the helper zero times in this run.'
            : `It called the helper on this marker ${byOwner.length} time(s), with ` +
              `${JSON.stringify(byOwner.map((o) => o.because ?? null))} and state(s) ` +
              `${JSON.stringify(byOwner.map((o) => o.state ?? null))}.`),
      });
    }
  }

  const ledgerProjects = new Set(requiredProjects(ledger));
  for (const raw of observations) {
    if (raw.kind !== 'raw' || !ledgerProjects.has(raw.project)) continue;
    findings.push({
      code: 'RAW-READ',
      detail:
        `"${raw.test}" (${raw.project}) read ${raw.marker} through ${raw.via} instead of through ` +
        `expectVerdict / expectClaim. A value taken off a marker is a value an expectation about ` +
        `that marker can be built from, and an expectation built that way cannot fail.`,
    });
  }

  return findings;
}
