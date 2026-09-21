import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Verdict coverage, derived from the RENDERED PAGE.
 *
 * Why this file exists, and why it is not a list.
 * ----------------------------------------------
 * An agent's own enumeration of "the verdicts this lab shows" is a self-report,
 * and a self-report is exactly what let sibling labs in this fleet ship a
 * headline claim that was a literal (`checksGreen: true`) and a browser suite
 * that stayed 5/5 green while the thing it reported on was forced false. So the
 * inventory here is taken by WALKING THE LIVE PAGE:
 *
 *   1. every element that reports an outcome carries `data-verdict="<id>"`;
 *   2. `covers every rendered verdict` fails if a marker found on the page has
 *      no mutation in scripts/mutation-ledger.json — so a new verdict cannot be
 *      added without a mutation that proves something goes red when it lies;
 *   3. `no verdict outside a marker` fails if verdict WORDING or verdict
 *      STYLING is rendered anywhere outside a marked subtree — so the careless
 *      fix of bolting a raw banner onto the page cannot slip past (2) by simply
 *      not carrying a marker.
 *
 * Both detectors are self-tested below by injecting the exact defect they exist
 * to catch: an unmarked banner, and a marker no mutation covers. A detector
 * that has never been watched failing is in the same category as a verdict that
 * has never been forced false.
 *
 * The rest of the file is the §4.1c owning tests: one per marker, each written
 * so that ONE named mutation in the ledger makes THAT assertion fail and leaves
 * the others alone.
 */

const LEDGER: Array<{ id: string; marker?: string | null }> = JSON.parse(
  readFileSync(new URL('../scripts/mutation-ledger.json', import.meta.url), 'utf8'),
);

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

interface Offence {
  kind: 'wording' | 'styling';
  where: string;
  text: string;
}

/** Everything on the page that looks like a verdict but sits outside a marker. */
async function offencesOutsideMarkers(page: Page): Promise<Offence[]> {
  return page.evaluate(
    ([wordSource, styleSelector]) => {
      const words = new RegExp(wordSource);
      const out: Offence[] = [];
      const path = (el: Element): string => {
        const bits: string[] = [];
        for (let n: Element | null = el; n && bits.length < 4; n = n.parentElement) {
          bits.unshift(n.id ? `${n.tagName.toLowerCase()}#${n.id}` : n.tagName.toLowerCase());
        }
        return bits.join('>');
      };
      const marked = (node: Node | null): boolean => {
        for (let n = node instanceof Element ? node : node?.parentElement; n; n = n.parentElement) {
          if (n.hasAttribute('data-verdict')) return true;
        }
        return false;
      };
      const roots = Array.from(document.querySelectorAll('.pane:not([hidden])'));
      for (const root of roots) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n.textContent ?? '';
          if (!words.test(text) || marked(n)) continue;
          out.push({ kind: 'wording', where: path(n.parentElement!), text: text.trim().slice(0, 120) });
        }
        for (const el of Array.from(root.querySelectorAll(styleSelector))) {
          if (marked(el)) continue;
          out.push({ kind: 'styling', where: path(el), text: (el.textContent ?? '').trim().slice(0, 120) });
        }
      }
      return out;
    },
    [VERDICT_WORDS.source, VERDICT_STYLE] as const,
  );
}

/** The markers the page is rendering right now. */
const markersOn = async (page: Page): Promise<string[]> =>
  page
    .locator('.pane:not([hidden]) [data-verdict]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-verdict') ?? ''));

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
 * Every state this lab renders a verdict in, walked in order. The gate on panes
 * 2 and 3 means an unvisited pane renders no markers at all, so a sweep of the
 * landing page alone would report near-total coverage of almost nothing.
 */
async function walkEveryState(page: Page, visit: () => Promise<void>): Promise<void> {
  await page.goto('.');
  await visit(); // pane 1, nothing run yet
  await page.locator('#run-kat').click();
  await expect(page.locator('#kat-encrypt')).toHaveAttribute('data-tone', 'pass');
  await visit(); // pane 1, vectors run

  await page.getByRole('tab', { name: /The Table/ }).click();
  await visit(); // pane 2, grid still empty
  await page.locator('#generate-diff').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
  await visit(); // pane 2, rebuilt and matching

  await page.locator('#box-select').selectOption('aes');
  await visit(); // pane 2, the AES control
  await page.locator('#box-select').selectOption('pi');

  await page.locator('#break-one-bit').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'fail');
  await visit(); // pane 2, every failure state a broken constant reaches
  await page.locator('#in-s').fill('0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0');
  await visit();
  await page.locator('#reset-constants').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');

  await page.getByRole('tab', { name: /The Claim/ }).click();
  await visit(); // pane 3, the standing verdict green
  await page.locator('#lottery-scale').fill('80');
  await visit(); // pane 3, the comparison flipped
}

// ── C: coverage is taken FROM THE PAGE ─────────────────────────────────────

test('every rendered verdict carries a marker that a mutation covers', async ({ page }) => {
  const covered = new Set(LEDGER.map((e) => e.marker).filter((m): m is string => !!m));
  const rendered = new Set<string>();
  await walkEveryState(page, async () => {
    for (const m of await markersOn(page)) rendered.add(m);
  });

  expect(rendered.size, 'the walk must find verdicts, or it is walking the wrong page').toBeGreaterThan(
    5,
  );
  const uncovered = [...rendered].filter((m) => !covered.has(m)).sort();
  expect(
    uncovered,
    'a verdict is rendered with no mutation in scripts/mutation-ledger.json proving it can go red',
  ).toEqual([]);

  // And the other direction: a ledger marker that no longer renders is a
  // mutation guarding a verdict this page has stopped showing.
  const stale = [...covered].filter((m) => !rendered.has(m)).sort();
  expect(stale, 'the ledger names a marker that the page no longer renders').toEqual([]);
});

test('no verdict wording or verdict styling is rendered outside a marker', async ({ page }) => {
  const found: Offence[] = [];
  await walkEveryState(page, async () => {
    found.push(...(await offencesOutsideMarkers(page)));
  });
  expect(
    found,
    'verdict wording or styling rendered outside a data-verdict marker, so nothing derives coverage for it',
  ).toEqual([]);
});

// ── the two detectors, watched failing ─────────────────────────────────────

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

test('the coverage detector catches a marker no mutation covers', async ({ page }) => {
  await reachTableDiffed(page);
  const covered = new Set(LEDGER.map((e) => e.marker).filter((m): m is string => !!m));
  expect([...(await markersOn(page))].filter((m) => !covered.has(m))).toEqual([]);

  await page.locator('#pane-table').evaluate((pane) => {
    const p = document.createElement('p');
    p.setAttribute('data-verdict', 'invented-verdict');
    p.textContent = 'a verdict nobody wrote a mutation for';
    pane.prepend(p);
  });

  expect(
    [...(await markersOn(page))].filter((m) => !covered.has(m)),
    'a marker absent from the ledger must be reported as uncovered',
  ).toEqual(['invented-verdict']);
});

// ── §4.1c owning tests: one per marker ─────────────────────────────────────

test('kat-encrypt reports pass against the RFC 7801 vector it names', async ({ page }) => {
  await page.goto('.');
  await page.locator('#run-kat').click();
  const v = page.locator('[data-verdict="kat-encrypt"]');
  await expect(v, 'kat-encrypt must report pass on the published vector').toHaveAttribute(
    'data-tone',
    'pass',
  );
  await expect(v).toContainText('PASS');
  // The verdict names both sides of the comparison, so a canned PASS cannot
  // hide behind wording that never mentions what was compared.
  const text = (await v.textContent()) ?? '';
  const [produced, published] = [...text.matchAll(/\b([0-9a-f]{32})\b/g)].map((m) => m[1]);
  expect(produced, 'kat-encrypt must print the ciphertext it produced').toBeTruthy();
  expect(produced, 'kat-encrypt must report pass on the published vector').toBe(published);
});

test('kat-decrypt reports pass and recovers the published plaintext', async ({ page }) => {
  await page.goto('.');
  await page.locator('#run-kat').click();
  const v = page.locator('[data-verdict="kat-decrypt"]');
  await expect(v, 'kat-decrypt must recover the published plaintext').toHaveAttribute(
    'data-tone',
    'pass',
  );
  const text = (await v.textContent()) ?? '';
  const [recovered, published] = [...text.matchAll(/\b([0-9a-f]{32})\b/g)].map((m) => m[1]);
  expect(recovered, 'kat-decrypt must print the plaintext it recovered').toBeTruthy();
  expect(recovered, 'kat-decrypt must recover the published plaintext').toBe(published);
});

test('diff-verdict follows the distance rather than reporting a fixed tone', async ({ page }) => {
  await reachTableDiffed(page);
  const v = page.locator('[data-verdict="diff-verdict"]');
  await expect(v).toHaveAttribute('data-tone', 'pass');
  await page.locator('#break-one-bit').click();
  await expect(v, 'diff-verdict must go red when the rebuild stops matching').toHaveAttribute(
    'data-tone',
    'fail',
  );
  await expect(v).toContainText('MISMATCH');
  await page.locator('#reset-constants').click();
  await expect(v, 'diff-verdict must come back when the constants do').toHaveAttribute(
    'data-tone',
    'pass',
  );
});

test('reuse-verdict follows the Streebog distance rather than a fixed tone', async ({ page }) => {
  await reachTableDiffed(page);
  const v = page.locator('[data-verdict="reuse-verdict"]');
  await expect(v).toHaveAttribute('data-tone', 'pass');
  await page.locator('#break-one-bit').click();
  await expect(v, 'reuse-verdict must go red when the rebuild stops matching').toHaveAttribute(
    'data-tone',
    'fail',
  );
  await expect(v).toContainText('MISMATCH');
});

test('miss-list names the inputs that differ, and says so when none do', async ({ page }) => {
  await reachTableDiffed(page);
  const v = page.locator('[data-verdict="miss-list"]');
  await expect(v).toHaveText('No mismatches.');
  await page.locator('#break-one-bit').click();
  await expect(v, 'miss-list must name the mismatching inputs once there are some').toContainText(
    /Mismatching inputs \(\d+\)/,
  );
});

test('coset-verdict reports NO COSET once the rebuild stops partitioning', async ({ page }) => {
  await reachTableDiffed(page);
  const v = page.locator('[data-verdict="coset-verdict"]');
  await expect(v).toContainText('ADDITIVE COSET');

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
    seen.push(((await v.textContent()) ?? '').includes('NO COSET') ? 'no' : 'yes');
  }
  expect(
    seen.filter((s) => s === 'no').length,
    'coset-verdict must report NO COSET for at least one coset of a broken rebuild',
  ).toBeGreaterThan(0);
});

test('space-tally calls seventeen spaces what it is: not a partition', async ({ page }) => {
  await reachTableDiffed(page);
  const v = page.locator('[data-verdict="space-tally"]');
  await expect(v).toContainText('uses 2 distinct landing spaces');
  await expect(v).toContainText('a partition');

  await page.locator('#box-select').selectOption('aes');
  await expect(v).toContainText('uses 17 distinct landing spaces');
  await expect(v, 'space-tally must deny a partition at seventeen spaces').toContainText(
    'there is no partition here',
  );
});

test('constraint-msg names the precondition the edited constants broke', async ({ page }) => {
  await reachTableDiffed(page);
  const v = page.locator('[data-verdict="constraint-msg"]');
  await expect(v).toHaveText('');
  await page.locator('#in-s').fill('0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0');
  await expect(v, 'constraint-msg must name the precondition that broke').toContainText(
    's is no longer a permutation of 0..14',
  );
  await page.locator('#reset-constants').click();
  await expect(v, 'constraint-msg must fall silent again once the constants are restored').toHaveText(
    '',
  );
});

test('scale-compare flips once the lottery run gets rarer than the coincidence', async ({ page }) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  const v = page.locator('[data-verdict="scale-compare"]');
  await page.locator('#lottery-scale').fill('40');
  await expect(v).toContainText('likelier than the TKlog coincidence');
  await page.locator('#lottery-scale').fill('80');
  await expect(v, 'scale-compare must flip to rarer once the run outruns the coincidence').toContainText(
    'rarer than the TKlog coincidence',
  );
});
