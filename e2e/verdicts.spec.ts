import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectClaim, expectVerdict } from './verdict-assert';

/**
 * Verdict and measurement coverage, derived from the RENDERED PAGE.
 *
 * Why this file exists, and why it is not a list.
 * ----------------------------------------------
 * An agent's own enumeration of "the verdicts this lab shows" is a self-report,
 * and a self-report is exactly what let sibling labs in this fleet ship a
 * headline claim that was a literal (`checksGreen: true`) and a browser suite
 * that stayed 5/5 green while the thing it reported on was forced false. So the
 * inventory here is taken by WALKING THE LIVE PAGE:
 *
 *   1. every element that reports an outcome carries `data-verdict="<id>"`, and
 *      every rendered MEASUREMENT carries `data-claim="<id>"`;
 *   2. `covers every rendered verdict` fails if a marker of either family found
 *      on the page has no mutation in scripts/mutation-ledger.json — so a new
 *      verdict, or a new number, cannot be added without a mutation that proves
 *      something goes red when it lies;
 *   3. `no verdict outside a marker` fails if verdict WORDING, verdict STYLING
 *      or a rendered MEASUREMENT appears anywhere outside a marked subtree — so
 *      the careless fix of bolting a raw banner, or a raw number, onto the page
 *      cannot slip past (2) by simply not carrying a marker;
 *   4. every ledger entry's owning test goes through `expectVerdict` /
 *      `expectClaim`, which assert a marker's text AND its state together. A
 *      kill validated by text alone fails the build instead of being recorded
 *      as evidence — see the header of `e2e/verdict-assert.ts`.
 *
 * All three detectors are self-tested below by injecting the exact defect they
 * exist to catch: an unmarked banner, an unmarked number, and a marker no
 * mutation covers. A detector that has never been watched failing is in the
 * same category as a verdict that has never been forced false.
 *
 * The rest of the file is the §4.1c owning tests: one per marker, each written
 * so that ONE named mutation in the ledger makes THAT assertion fail and leaves
 * the others alone.
 */

interface LedgerEntry {
  id: string;
  kind: string;
  marker?: string | null;
  claim?: string | null;
}

const LEDGER: LedgerEntry[] = JSON.parse(
  readFileSync(new URL('../scripts/mutation-ledger.json', import.meta.url), 'utf8'),
);

/**
 * The owning tests themselves, read as text.
 *
 * Requiring a ledger entry's marker to be MENTIONED in a spec file would be the
 * weak version of this rule — a mention is not an assertion. What is required
 * is a call through the shared helper, which is the only thing in this repo
 * that asserts a marker's text and its state in one go.
 */
const SPEC_SOURCE = ['verdicts.spec.ts', 'claims.spec.ts']
  .map((file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'))
  .join('\n');

/**
 * The vocabulary a verdict is written in.
 *
 * Upper case and whole words on purpose: shipped prose says "mismatch" and
 * "Passing here is what unlocks pane 2" all over this lab, and neither is a
 * verdict. What a careless builder writes is `<strong>PASS</strong>` inside a
 * banner, and that is what this catches. `\bMATCH\b` does not fire inside
 * MISMATCH, which is why both are listed separately.
 */
const VERDICT_WORDS =
  /\b(PASS|PASSED|FAIL|FAILED|MATCH|MISMATCH|VALID|INVALID|VERIFIED|RETIRED|SUCCESS|SECURE|INSECURE|BROKEN|NO COSET|ADDITIVE COSET)\b/;

/**
 * The styling a verdict is drawn in. Deliberately NOT `.match` / `.miss`: those
 * are the 256 per-cell diff marks in the grid, which are evidence the verdict
 * lines summarise rather than verdicts themselves. Marking each of 256 cells
 * would drown the signal this check exists to give.
 */
const VERDICT_STYLE = '[class*="verdict"], .is-pass, .is-fail, [data-tone]';

/**
 * What a rendered MEASUREMENT looks like.
 *
 * A number is neither of the two things above: it carries no verdict word and
 * no verdict styling, so a measurement painted outside a marker was invisible
 * to this file until now — and it is the easier mistake to make, precisely
 * because a number does not look like a claim.
 */
const MEASUREMENT = /\d[\d,.]*\s*(?:B|KB|MB|bits?|bytes?|ops?|operations?|ms|s|×|x)\b/i;

/**
 * Where that rule applies: the regions this page REWRITES in response to what
 * the visitor does. Most of them are the page's own `role="status"` /
 * `aria-live` regions — it declares them itself, because it has to announce
 * what it recomputed — and the other two are named because they are rebuilt on
 * every interaction without being live regions.
 *
 * Static prose in a card is deliberately NOT scanned, and that is a real
 * limitation rather than an oversight: this lab's copy says "a 16-byte block",
 * "256 numbers" and "17 cosets" in explanatory paragraphs, none of which is a
 * claim the run produces, and a rule that fired on all of them would be turned
 * off within a week. The residual risk is a computed number painted into static
 * prose; the mitigation is that every region this page recomputes is either a
 * live region or named here.
 */
const RESULT_REGIONS = '[role="status"], [aria-live], .scale-readout, #coset-detail, #step-caption';

/**
 * Raw data displays inside those regions, excluded for the same reason the 256
 * per-cell diff marks are excluded from the styling rule: they are the
 * enumeration a verdict summarises, every cell is separately `aria-label`led,
 * and marking each of 15 hex chips individually would drown the signal. Two-hex
 * bytes like `1B` also match the measurement pattern by accident, which is a
 * fact about hex rather than about the page.
 */
const DATA_DISPLAYS = 'table.sbox, ul.chips, .block-grid, .mono, code';

interface Offence {
  kind: 'wording' | 'styling' | 'measurement';
  where: string;
  text: string;
}

/**
 * Everything on the page that looks like a claim but sits outside a marker.
 * Scoped to #app -- the hero, the panes and the footer -- rather than to the
 * panes alone, so a banner added anywhere the lab owns is caught. The shared
 * crypto-lab topbar above #app is not this lab's copy and is excluded.
 */
async function offencesOutsideMarkers(page: Page): Promise<Offence[]> {
  return page.evaluate(
    ([wordSource, styleSelector, measureSource, regionSelector, displaySelector]) => {
      const words = new RegExp(wordSource);
      const measurement = new RegExp(measureSource, 'i');
      const out: Offence[] = [];
      const path = (el: Element): string => {
        const bits: string[] = [];
        for (let n: Element | null = el; n && bits.length < 4; n = n.parentElement) {
          bits.unshift(n.id ? `${n.tagName.toLowerCase()}#${n.id}` : n.tagName.toLowerCase());
        }
        return bits.join('>');
      };
      // Both marker families count: a measurement inside `data-claim` and a
      // verdict inside `data-verdict` are each covered by the loop above.
      const marked = (node: Node | null): boolean => {
        for (let n = node instanceof Element ? node : node?.parentElement; n; n = n.parentElement) {
          if (n.hasAttribute('data-verdict') || n.hasAttribute('data-claim')) return true;
        }
        return false;
      };
      // The whole of #app, not just the three exhibit panes: the hero and the
      // footer are as good a place to bolt a banner onto as a pane is, and the
      // first version of this check could not see either. A [hidden] subtree is
      // skipped because a locked pane paints nothing, and <script>/<style> text
      // is skipped because it is source, not rendered copy.
      const root = document.getElementById('app');
      if (!root) return out;
      const live = (el: Element | null): boolean => !!el && !el.closest('[hidden]');
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const parent = n.parentElement;
        if (!live(parent) || parent!.tagName === 'SCRIPT' || parent!.tagName === 'STYLE') continue;
        const text = n.textContent ?? '';
        if (!words.test(text) || marked(n)) continue;
        out.push({ kind: 'wording', where: path(parent!), text: text.trim().slice(0, 120) });
      }
      for (const el of Array.from(root.querySelectorAll(styleSelector))) {
        if (!live(el) || marked(el)) continue;
        out.push({ kind: 'styling', where: path(el), text: (el.textContent ?? '').trim().slice(0, 120) });
      }
      // Measurements, in result regions only. A bare number counts inside the
      // stats grid, where a figure with no unit beside it is still a reported
      // quantity; elsewhere a unit is required, or every "coset 3" heading
      // would be an offence.
      for (const region of Array.from(root.querySelectorAll(regionSelector))) {
        if (!live(region)) continue;
        const inStatsGrid =
          region.classList.contains('scale-readout') || !!region.closest('.scale-readout');
        const regionWalker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT);
        for (let n = regionWalker.nextNode(); n; n = regionWalker.nextNode()) {
          const parent = n.parentElement;
          if (!live(parent) || parent!.closest(displaySelector)) continue;
          const text = n.textContent ?? '';
          const hit = measurement.test(text) || (inStatsGrid && /\d/.test(text));
          if (!hit || marked(n)) continue;
          out.push({ kind: 'measurement', where: path(parent!), text: text.trim().slice(0, 120) });
        }
      }
      return out;
    },
    [VERDICT_WORDS.source, VERDICT_STYLE, MEASUREMENT.source, RESULT_REGIONS, DATA_DISPLAYS] as const,
  );
}

/** The markers of one family the page is rendering right now. */
const markersOn = async (page: Page, attribute: 'data-verdict' | 'data-claim'): Promise<string[]> =>
  page
    .locator(`.pane:not([hidden]) [${attribute}]`)
    .evaluateAll((els, attr) => els.map((e) => e.getAttribute(attr) ?? ''), attribute);

async function reachCipherVerified(page: Page): Promise<void> {
  await page.goto('.');
  await page.locator('#run-kat').click();
  await expect(page.locator('#kat-encrypt')).toHaveAttribute('data-tone', 'pass');
}

async function reachTableDiffed(page: Page): Promise<void> {
  await reachCipherVerified(page);
  await page.getByRole('tab', { name: /The Table/ }).click();
  await page.locator('#generate-diff').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
}

/**
 * Four λ bytes that span a 4-dimensional space INSIDE the subfield F₁₆
 * (`00 01 0A 0B 44 45 4E 4F 92 93 98 99 D6 D7 DC DD` for Perrin's field). They
 * satisfy the first λ precondition and break the second, which is the only way
 * to reach the third branch of `constraint-msg`.
 */
const LAMBDA_INSIDE_SUBFIELD = ['01', '0A', '44', '92'];

/** `s` with every entry collapsed onto 0, so it stops being a permutation. */
const S_COLLAPSED = '0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0';

/**
 * Every state this lab renders anything in, walked in order.
 *
 * THIS IS THE DENOMINATOR, NOT A TEST. The marker-coverage test and the
 * outside-a-marker test both enumerate over whatever this function reaches, so
 * a marker — or an unmarked number — that renders only in a state this walk
 * skips is outside the set those rules judge, no matter how carefully the rules
 * themselves are written. A coverage rule applied to a set that was never fully
 * walked is the defect the rules exist to close, one level up.
 *
 * The rule, fleet-wide: **visit every option of every control that changes what
 * renders, each control on its own, not the full cross-product.** Per-control
 * is what keeps it affordable — selects of 9, 3 and 17 options are 29 visits,
 * not 459 — and interaction coverage is a different question that the marker
 * rules do not ask.
 *
 * This lab's controls, and what each contributes:
 *
 *   the three tabs     3 panes, INCLUDING both lock cards, which render copy of
 *                      their own and were outside the walk until now
 *   #round-select      9 options — every round key, each redrawing the trace
 *   Step / Reset round the four stages of one round
 *   #run-kat           the KAT verdicts, idle → pass
 *   #generate-diff     the empty grid → the filled one
 *   #box-select        3 options — π, the rebuild, the AES control
 *   #coset-select      17 options — the whole partition, one coset at a time
 *   #in-s, #in-lam-*,  free text, so not enumerable: what IS enumerable is the
 *   #in-cstt           three branches of `constraint-msg`, and all three are
 *                      visited (s not a permutation; λ not spanning 4
 *                      dimensions; λ spanning, but inside the subfield, so the
 *                      span no longer complements it)
 *   #break-one-bit     the one-bit divergence
 *   #reset-constants   the way back
 *   #lottery-scale     every one of its 80 positions
 *
 * Option counts are read FROM THE CONTROL rather than written here as literals,
 * so a select that grows an option grows the walk with it.
 *
 * Two deliberate exceptions, stated rather than left to be inferred:
 *
 *  - `<details>` disclosures change visibility only. Their contents are in the
 *    DOM either way and the scans above already read them, so opening each one
 *    would add visits without adding rendered state.
 *  - NO COSET is the one rendered state that needs two controls at once —
 *    broken constants AND the box switched to the rebuild — so the walk pays
 *    for that one intersection on purpose. Leaving it out would put a rendered
 *    verdict state outside the denominator, which is exactly what this function
 *    exists to prevent.
 */
async function driveEveryState(page: Page, visit: () => Promise<void>): Promise<void> {
  const optionValues = async (selector: string): Promise<string[]> => {
    const values = await page
      .locator(`${selector} option`)
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
    expect(values.length, `${selector} must offer options for the walk to visit`).toBeGreaterThan(1);
    return values;
  };

  // ---- pane 1, and the two lock cards -------------------------------------
  await page.goto('.');
  await visit(); // pane 1, nothing run yet

  await page.getByRole('tab', { name: /The Table/ }).click();
  await expect(page.locator('#pane-table')).toContainText('Locked until the cipher checks out');
  await visit(); // pane 2, LOCKED
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await expect(page.locator('#pane-claim')).toContainText('Locked until the table has been rebuilt');
  await visit(); // pane 3, LOCKED
  await page.getByRole('tab', { name: /The Cipher/ }).click();

  for (const round of await optionValues('#round-select')) {
    await page.locator('#round-select').selectOption(round);
    await visit(); // pane 1, one round key per option
  }
  await page.locator('#round-select').selectOption('0');

  for (let stage = 1; stage <= 3; stage++) {
    await page.getByRole('button', { name: 'Step' }).click();
    await visit(); // pane 1, after X, then S, then L
  }
  await page.getByRole('button', { name: 'Reset round' }).click();
  await visit(); // pane 1, back to the arriving block

  await page.locator('#run-kat').click();
  await expect(page.locator('#kat-encrypt')).toHaveAttribute('data-tone', 'pass');
  await visit(); // pane 1, vectors run

  // ---- pane 2 --------------------------------------------------------------
  await page.getByRole('tab', { name: /The Table/ }).click();
  await visit(); // pane 2, unlocked, grid still empty
  await page.locator('#generate-diff').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
  await visit(); // pane 2, rebuilt and matching

  for (const box of await optionValues('#box-select')) {
    await page.locator('#box-select').selectOption(box);
    await visit(); // pane 2, each box under inspection
  }
  await page.locator('#box-select').selectOption('pi');

  for (const coset of await optionValues('#coset-select')) {
    await page.locator('#coset-select').selectOption(coset);
    await visit(); // pane 2, each of the 17 cosets
  }
  await page.locator('#coset-select').selectOption('0');

  await page.locator('#break-one-bit').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'fail');
  await visit(); // pane 2, one bit of λ₀ flipped
  await page.locator('#reset-constants').click();

  // The three branches of constraint-msg, one at a time.
  await page.locator('#in-s').fill(S_COLLAPSED);
  await visit(); // s is no longer a permutation
  await page.locator('#reset-constants').click();

  for (const idx of [0, 1, 2, 3]) await page.locator(`#in-lam-${idx}`).fill('00');
  await visit(); // the λ vectors no longer span 4 dimensions
  await page.locator('#reset-constants').click();

  for (const [idx, value] of LAMBDA_INSIDE_SUBFIELD.entries()) {
    await page.locator(`#in-lam-${idx}`).fill(value);
  }
  await visit(); // they span, but inside the subfield, so they stop complementing it
  await page.locator('#reset-constants').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');

  // The one intersection this walk pays for: NO COSET needs broken constants
  // AND the box switched to the rebuild.
  await page.locator('#in-s').fill(S_COLLAPSED);
  await page.locator('#box-select').selectOption('generated');
  for (const coset of await optionValues('#coset-select')) {
    await page.locator('#coset-select').selectOption(coset);
    await visit(); // pane 2, the partition gone, one coset at a time
  }
  await page.locator('#box-select').selectOption('pi');
  await page.locator('#coset-select').selectOption('0');
  await page.locator('#reset-constants').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');

  // ---- pane 3 --------------------------------------------------------------
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await visit(); // pane 3, the standing verdict green

  const scale = page.locator('#lottery-scale');
  const range = await scale.evaluate((el) => ({
    min: Number((el as HTMLInputElement).min),
    max: Number((el as HTMLInputElement).max),
    step: Number((el as HTMLInputElement).step) || 1,
  }));
  expect(range.max, 'the scale must offer positions to walk').toBeGreaterThan(range.min);
  for (let v = range.min; v <= range.max; v += range.step) {
    await scale.fill(String(v));
    await visit(); // pane 3, every position of the scale
  }
}

// ── C: coverage is taken FROM THE PAGE ─────────────────────────────────────

test('every rendered verdict carries a marker that a mutation covers', async ({ page }) => {
  const coveredVerdicts = new Set(LEDGER.map((e) => e.marker).filter((m): m is string => !!m));
  const coveredClaims = new Set(LEDGER.map((e) => e.claim).filter((c): c is string => !!c));
  const renderedVerdicts = new Set<string>();
  const renderedClaims = new Set<string>();
  await driveEveryState(page, async () => {
    for (const m of await markersOn(page, 'data-verdict')) renderedVerdicts.add(m);
    for (const c of await markersOn(page, 'data-claim')) renderedClaims.add(c);
  });

  expect(
    renderedVerdicts.size,
    'the walk must find verdicts, or it is walking the wrong page',
  ).toBeGreaterThan(5);
  expect(
    renderedClaims.size,
    'the walk must find measurements, or the claim family is not being enumerated',
  ).toBeGreaterThan(0);

  const uncovered = [...renderedVerdicts].filter((m) => !coveredVerdicts.has(m)).sort();
  expect(
    uncovered,
    'a verdict is rendered with no mutation in scripts/mutation-ledger.json proving it can go red',
  ).toEqual([]);
  const uncoveredClaims = [...renderedClaims].filter((c) => !coveredClaims.has(c)).sort();
  expect(
    uncoveredClaims,
    'a measurement is rendered with no mutation in scripts/mutation-ledger.json proving it can lie',
  ).toEqual([]);

  // And the other direction: a ledger entry naming a marker that no longer
  // renders is a mutation guarding a claim this page has stopped showing.
  const stale = [...coveredVerdicts].filter((m) => !renderedVerdicts.has(m)).sort();
  expect(stale, 'the ledger names a marker that the page no longer renders').toEqual([]);
  const staleClaims = [...coveredClaims].filter((c) => !renderedClaims.has(c)).sort();
  expect(staleClaims, 'the ledger names a measurement that the page no longer renders').toEqual([]);

  // A mutation is only evidence if its owning test asserted the marker's text
  // AND its state. A mention of the id in a spec file is not an assertion, and
  // a `toContainText` on its own leaves the tone, the class and the tick
  // untouched — so what is required is a call through the shared helper.
  const missingHelper: string[] = [];
  for (const entry of LEDGER) {
    if (entry.marker && renderedVerdicts.has(entry.marker)) {
      if (!SPEC_SOURCE.includes(`expectVerdict(page, '${entry.marker}'`)) {
        missingHelper.push(`${entry.id} -> expectVerdict(page, '${entry.marker}', …)`);
      }
    }
    if (entry.claim && renderedClaims.has(entry.claim)) {
      if (!SPEC_SOURCE.includes(`expectClaim(page, '${entry.claim}'`)) {
        missingHelper.push(`${entry.id} -> expectClaim(page, '${entry.claim}', …)`);
      }
    }
  }
  expect(
    missingHelper,
    'a mutation record whose owning test does not assert its marker through the shared helper: ' +
      'text alone is not a kill, because the tone, the class and the tick all survive it',
  ).toEqual([]);
});

test('no verdict wording or verdict styling is rendered outside a marker', async ({ page }) => {
  const found: Offence[] = [];
  await driveEveryState(page, async () => {
    found.push(...(await offencesOutsideMarkers(page)));
  });
  expect(
    found,
    'verdict wording, verdict styling or a rendered measurement outside a marker, so nothing ' +
      'derives coverage for it',
  ).toEqual([]);
});

// ── the three detectors, watched failing ───────────────────────────────────

test('the outside-a-marker detector catches a raw banner bolted onto the page', async ({ page }) => {
  await reachTableDiffed(page);
  const clean = await offencesOutsideMarkers(page);
  expect(clean, 'baseline for the injection must be clean').toEqual([]);

  // Exactly what a careless builder adds: a banner in the page's own verdict
  // styling, saying the thing the page most wants to say, carrying no marker.
  await page.locator('#pane-table').evaluate((pane) => {
    const banner = document.createElement('p');
    banner.className = 'verdict is-pass';
    banner.id = 'careless-banner';
    banner.textContent = 'PASS — the rebuild is a byte-for-byte MATCH.';
    pane.prepend(banner);
  });

  const caught = await offencesOutsideMarkers(page);
  expect(
    caught.filter((o) => o.kind === 'wording').length,
    'an unmarked banner must be caught by its wording',
  ).toBeGreaterThan(0);
  expect(
    caught.filter((o) => o.kind === 'styling').length,
    'an unmarked banner must be caught by its styling too',
  ).toBeGreaterThan(0);
});

test('the outside-a-marker detector catches an unmarked number in a result region', async ({
  page,
}) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  expect(await offencesOutsideMarkers(page), 'baseline for the injection must be clean').toEqual([]);

  // The measurement version of the same carelessness, and the easier one to
  // ship: a number with a unit, in the stats grid, carrying no marker. It has
  // no verdict word and no verdict styling, so the other two detectors are
  // blind to it.
  await page.locator('#scale-readout').evaluate((readout) => {
    const cell = document.createElement('div');
    cell.id = 'careless-measurement';
    cell.textContent = 'rebuilt table size 1,632 B';
    readout.append(cell);
  });

  const caught = await offencesOutsideMarkers(page);
  expect(
    caught.filter((o) => o.kind === 'measurement').map((o) => o.text),
    'an unmarked measurement in a result region must be reported',
  ).toContain('rebuilt table size 1,632 B');
});

test('the coverage detector catches a marker no mutation covers', async ({ page }) => {
  await reachTableDiffed(page);
  const covered = new Set(LEDGER.map((e) => e.marker).filter((m): m is string => !!m));
  expect([...(await markersOn(page, 'data-verdict'))].filter((m) => !covered.has(m))).toEqual([]);

  await page.locator('#pane-table').evaluate((pane) => {
    const p = document.createElement('p');
    p.setAttribute('data-verdict', 'invented-verdict');
    p.textContent = 'a verdict nobody wrote a mutation for';
    pane.prepend(p);
  });

  expect(
    [...(await markersOn(page, 'data-verdict'))].filter((m) => !covered.has(m)),
    'a marker absent from the ledger must be reported as uncovered',
  ).toEqual(['invented-verdict']);
});

// ── §4.1c owning tests: one per marker ─────────────────────────────────────

test('kat-encrypt reports pass against the RFC 7801 vector it names', async ({ page }) => {
  await page.goto('.');
  await page.locator('#run-kat').click();
  await expectVerdict(page, 'kat-encrypt', {
    text: 'PASS',
    state: 'pass',
    because: 'kat-encrypt must report pass on the published vector',
  });
  // The verdict names both sides of the comparison, so a canned PASS cannot
  // hide behind wording that never mentions what was compared.
  const text = (await page.locator('[data-verdict="kat-encrypt"]').textContent()) ?? '';
  const [produced, published] = [...text.matchAll(/\b([0-9a-f]{32})\b/g)].map((m) => m[1]);
  expect(produced, 'kat-encrypt must print the ciphertext it produced').toBeTruthy();
  expect(produced, 'kat-encrypt must report pass on the published vector').toBe(published);
});

test('kat-decrypt reports pass and recovers the published plaintext', async ({ page }) => {
  await page.goto('.');
  await page.locator('#run-kat').click();
  await expectVerdict(page, 'kat-decrypt', {
    text: 'PASS',
    state: 'pass',
    because: 'kat-decrypt must recover the published plaintext',
  });
  const text = (await page.locator('[data-verdict="kat-decrypt"]').textContent()) ?? '';
  const [recovered, published] = [...text.matchAll(/\b([0-9a-f]{32})\b/g)].map((m) => m[1]);
  expect(recovered, 'kat-decrypt must print the plaintext it recovered').toBeTruthy();
  expect(recovered, 'kat-decrypt must recover the published plaintext').toBe(published);
});

test('diff-verdict follows the distance rather than reporting a fixed tone', async ({ page }) => {
  await reachTableDiffed(page);
  await expectVerdict(page, 'diff-verdict', {
    text: 'MATCH',
    state: 'pass',
    because: 'diff-verdict must report a match on the unedited constants',
  });
  await page.locator('#break-one-bit').click();
  await expectVerdict(page, 'diff-verdict', {
    text: 'MISMATCH',
    state: 'fail',
    because: 'diff-verdict must go red when the rebuild stops matching',
  });
  await page.locator('#reset-constants').click();
  await expectVerdict(page, 'diff-verdict', {
    text: 'Hamming distance 0 of 256',
    state: 'pass',
    because: 'diff-verdict must come back when the constants do',
  });
});

test('reuse-verdict follows the Streebog distance rather than a fixed tone', async ({ page }) => {
  await reachTableDiffed(page);
  await expectVerdict(page, 'reuse-verdict', {
    text: 'MATCH',
    state: 'pass',
    because: 'reuse-verdict must report a match on the unedited constants',
  });
  await page.locator('#break-one-bit').click();
  await expectVerdict(page, 'reuse-verdict', {
    text: ['MISMATCH', 'RFC 6986'],
    state: 'fail',
    because: 'reuse-verdict must go red when the rebuild stops matching',
  });
});

test('miss-list names the inputs that differ, and says so when none do', async ({ page }) => {
  await reachTableDiffed(page);
  await expectVerdict(page, 'miss-list', {
    exact: 'No mismatches.',
    state: 'none',
    because: 'miss-list must report an all-clear only when the rebuild really matches',
  });
  await page.locator('#break-one-bit').click();
  await expectVerdict(page, 'miss-list', {
    text: /Mismatching inputs \(\d+\)/,
    state: 'none',
    because: 'miss-list must name the mismatching inputs once there are some',
  });
});

test('coset-verdict reports NO COSET once the rebuild stops partitioning', async ({ page }) => {
  await reachTableDiffed(page);
  await expectVerdict(page, 'coset-verdict', {
    text: 'ADDITIVE COSET',
    state: 'pass',
    because: 'coset-verdict must report an additive coset for the published table',
  });

  // Break the generator, then inspect the rebuilt box rather than the published
  // one: the published table is unchanged by an edit, so a broken constant only
  // shows up here through the "your rebuilt version" selection.
  //
  // It has to be `s` that breaks, and it has to stop being a PERMUTATION. The
  // TKlog sends coset i to kappa(16-i) XOR (alpha^17)^s[j], and (alpha^17)^s[j]
  // runs over the whole non-zero subfield for ANY permutation s -- so every
  // reordering of s, and every edit to lambda or cstt, leaves all sixteen of
  // those landing sets additive cosets. Collapsing s is what makes the landing
  // sets collide and stop being cosets at all. The first draft of this test
  // used a reordering and found no NO COSET anywhere, which is a fact about the
  // structure rather than about the page.
  await page.locator('#in-s').fill('0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0');
  await page.locator('#box-select').selectOption('generated');

  const seen: string[] = [];
  for (let i = 0; i < 17; i++) {
    await page.locator('#coset-select').selectOption(String(i));
    seen.push(
      ((await page.locator('[data-verdict="coset-verdict"]').textContent()) ?? '').includes(
        'NO COSET',
      )
        ? 'no'
        : 'yes',
    );
  }
  expect(
    seen.filter((s) => s === 'no').length,
    'coset-verdict must report NO COSET for at least one coset of a broken rebuild',
  ).toBeGreaterThan(0);
  // And where it reports one, it reports it in every channel it has: the words,
  // the tone, the class and the mark.
  await page.locator('#coset-select').selectOption(String(seen.indexOf('no')));
  await expectVerdict(page, 'coset-verdict', {
    text: 'NO COSET',
    state: 'fail',
    because: 'coset-verdict must report NO COSET for at least one coset of a broken rebuild',
  });
});

test('space-tally calls seventeen spaces what it is: not a partition', async ({ page }) => {
  await reachTableDiffed(page);
  await expectVerdict(page, 'space-tally', {
    text: ['uses 2 distinct landing spaces', 'a partition'],
    state: 'none',
    because: 'space-tally must call two landing spaces a partition',
  });

  await page.locator('#box-select').selectOption('aes');
  await expectVerdict(page, 'space-tally', {
    text: ['uses 17 distinct landing spaces', 'there is no partition here'],
    state: 'none',
    because: 'space-tally must deny a partition at seventeen spaces',
  });
});

test('constraint-msg names the precondition the edited constants broke', async ({ page }) => {
  await reachTableDiffed(page);
  await expectVerdict(page, 'constraint-msg', {
    exact: '',
    state: 'none',
    because: 'constraint-msg must stay silent while the constants still hold',
  });
  await page.locator('#in-s').fill(S_COLLAPSED);
  await expectVerdict(page, 'constraint-msg', {
    text: 's is no longer a permutation of 0..14',
    state: 'none',
    because: 'constraint-msg must name the precondition that broke',
  });
  await page.locator('#reset-constants').click();
  await expectVerdict(page, 'constraint-msg', {
    exact: '',
    state: 'none',
    because: 'constraint-msg must fall silent again once the constants are restored',
  });
});

test('scale-compare flips once the lottery run gets rarer than the coincidence', async ({ page }) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await page.locator('#lottery-scale').fill('40');
  await expectVerdict(page, 'scale-compare', {
    text: 'likelier than the TKlog coincidence',
    state: 'none',
    because: 'scale-compare must report the shorter run as likelier than the coincidence',
  });
  await page.locator('#lottery-scale').fill('80');
  await expectVerdict(page, 'scale-compare', {
    text: 'rarer than the TKlog coincidence',
    state: 'none',
    because: 'scale-compare must flip to rarer once the run outruns the coincidence',
  });
});

// ── §4.1c owning tests: one per measurement ────────────────────────────────

test('lottery-runs reports the scale position, not the figure Perrin quotes', async ({ page }) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  // The default is Perrin's own 66, which is exactly the value a pinned readout
  // would go on reporting, so the assertion has to move off it.
  await expectClaim(page, 'lottery-runs', {
    value: '66',
    text: '66',
    because: 'lottery-runs must report the position the scale is at',
  });
  for (const runs of ['1', '40', '80']) {
    await page.locator('#lottery-scale').fill(runs);
    await expectClaim(page, 'lottery-runs', {
      value: runs,
      text: runs,
      because: 'lottery-runs must report the position the scale is at',
    });
  }
});

test('lottery-probability is the printed one-win figure scaled by the run count shown', async ({
  page,
}) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await page.locator('#pane-claim details summary').first().click();

  // Both inputs are read off the page: the one-win figure from its own details
  // list, the run count from its own readout. A literal count here would agree
  // with a page that had stopped reading the scale at all, which is the failure
  // this oracle does catch.
  //
  // It does not catch two others, and the rendered copy is worded accordingly.
  // Summing the exponent `runs` times and multiplying it by `runs` are the same
  // arithmetic, so this cannot show that the page composed independent events
  // rather than scaling one figure — the readout says `that run, on the same
  // scale` and claims no more. And the one-win figure is a literal the page
  // prints and this oracle then reads back, so the two agree whatever it is
  // set to. Contrast `tklog-probability` below, which is derived from two
  // separately printed counts and does move when either of them does.
  const listed = (await page.locator('#pane-claim details li').allTextContents()).join(' ');
  const oneWin = Number(/French lottery, one win: about 2\^(-?[\d.]+)/.exec(listed)?.[1]);
  expect(oneWin, 'the page must print the one-win probability').toBeLessThan(0);

  for (const position of ['1', '40', '66', '80']) {
    await page.locator('#lottery-scale').fill(position);
    const runs = Number(await page.locator('[data-claim="lottery-runs"]').getAttribute('data-value'));
    expect(runs, 'the readout must report the position the scale is at').toBe(Number(position));
    let summed = 0;
    for (let i = 0; i < runs; i++) summed += oneWin;
    await expectClaim(page, 'lottery-probability', {
      value: summed.toFixed(1),
      text: `2^${summed.toFixed(1)}`,
      because:
        'lottery-probability must be the printed one-win figure scaled by the run count shown',
    });
  }
});

test('tklog-probability is the ratio of the two counts the page prints', async ({ page }) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await page.locator('#pane-claim details summary').first().click();

  const listed = (await page.locator('#pane-claim details li').allTextContents()).join(' ');
  const instances = Number(/TKlog instances on 8 bits: about 2\^([\d.]+)/.exec(listed)?.[1]);
  const perms = Number(/permutations of a byte: 256! ≈ 2\^([\d.]+)/.exec(listed)?.[1]);
  expect(instances, 'the page must print the instance count').toBeGreaterThan(0);
  expect(perms, 'the page must print the permutation count').toBeGreaterThan(instances);

  await expectClaim(page, 'tklog-probability', {
    value: (instances - perms).toFixed(1),
    text: `2^${(instances - perms).toFixed(1)}`,
    because: 'tklog-probability must be the ratio of the two counts the page prints',
  });
  // It is a standing figure rather than a function of the scale, so moving the
  // slider must not move it.
  await page.locator('#lottery-scale').fill('12');
  await expectClaim(page, 'tklog-probability', {
    value: (instances - perms).toFixed(1),
    because: 'tklog-probability must be the ratio of the two counts the page prints',
  });
});
