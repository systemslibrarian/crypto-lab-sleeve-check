import { expect, test, type Page } from '@playwright/test';
import { expectVerdict } from './verdict-assert';

/**
 * The claims suite (template 4.1b / 4.1c / 4.1d).
 *
 * The rule that makes these worth anything: compare two values the PAGE itself
 * printed, or re-derive a claim from the page's raw inputs by a route the
 * source does not take. A test that recomputes the same expression the source
 * uses will happily agree with a bug.
 *
 * Concretely, the re-derivations here read the published lookup table out of
 * the DOM -- 256 `<td>` elements -- and use that, rather than any module, to
 * check what the coset view asserts. The source computes the same facts from
 * typed arrays and a log table; neither route can quietly agree with the other.
 */

const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

async function reachCipherVerified(page: Page): Promise<void> {
  await page.goto('.');
  await page.locator('#run-kat').click();
  await expect(page.locator('#kat-encrypt')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#kat-decrypt')).toHaveAttribute('data-tone', 'pass');
}

async function reachTableDiffed(page: Page): Promise<void> {
  await reachCipherVerified(page);
  await page.getByRole('tab', { name: /The Table/ }).click();
  await page.locator('#generate-diff').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
}

/** The published table as the page prints it: 256 cells of the first grid. */
async function publishedTableFromDom(page: Page): Promise<number[]> {
  const cells = await page
    .locator('#pane-table table.sbox')
    .first()
    .locator('tbody td')
    .allTextContents();
  expect(cells).toHaveLength(256);
  return cells.map((s) => parseInt(s.trim(), 16));
}

const chipValues = async (page: Page, root: string): Promise<number[]> =>
  (await page.locator(root).locator('li').allTextContents()).map((s) => parseInt(s.trim(), 16));

// ── 4.1b: cross-checks between two surfaces the page printed ────────────────

test('the stated Hamming distance equals the number of cells the page painted red', async ({ page }) => {
  await reachTableDiffed(page);
  for (const [label, action] of [
    ['untouched', async () => {}],
    ['one lambda bit flipped', async () => page.locator('#break-one-bit').click()],
    ['s collapsed', async () => page.locator('#in-s').fill('1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1')],
  ] as const) {
    await action();
    const text = (await page.locator('#diff-verdict').textContent()) ?? '';
    const stated = Number(/Hamming distance (\d+) of 256/.exec(text)?.[1]);
    const painted = await page.locator('#pane-table td.miss').count();
    expect(stated, `stated vs painted mismatch count (${label})`).toBe(painted);
  }
});

test('the mismatch list names exactly the inputs whose rebuilt byte differs', async ({ page }) => {
  await reachTableDiffed(page);
  const published = await publishedTableFromDom(page);
  await page.locator('#break-one-bit').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'fail');

  const listed = ((await page.locator('#miss-list').textContent()) ?? '')
    .replace(/^[^:]*:/, '')
    .split(',')
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter((s) => /^[0-9A-F]{2}$/.test(s))
    .map((s) => parseInt(s, 16));
  expect(listed.length).toBeGreaterThan(0);

  // Re-derive from the two grids the page rendered, not from the verdict text.
  const rebuilt = (
    await page.locator('#pane-table table.sbox').nth(1).locator('tbody td').allTextContents()
  ).map((s) => parseInt(s.trim().slice(0, 2), 16));
  const actual = rebuilt.map((v, i) => [i, v] as const).filter(([i, v]) => v !== published[i]).map(([i]) => i);
  expect(listed.slice(0, 48)).toEqual(actual.slice(0, 48));
});

test('the landing set is exactly where the published table sends the selected coset', async ({ page }) => {
  await reachTableDiffed(page);
  const published = await publishedTableFromDom(page);
  for (const coset of ['0', '3', '9', '16']) {
    await page.locator('#coset-select').selectOption(coset);
    await expect(page.locator('#coset-detail h4').first()).toContainText(`coset ${coset}`);
    const inputs = await chipValues(page, '#coset-detail div:nth-of-type(1) ul');
    const landing = await chipValues(page, '#coset-detail div:nth-of-type(2) ul');
    expect(inputs, `coset ${coset} has 15 members`).toHaveLength(15);
    // The independent route: push the page's own inputs through the page's own
    // published grid and compare with the page's own landing chips.
    const derived = [...new Set(inputs.map((x) => published[x]))].sort((a, b) => a - b);
    expect(derived, `coset ${coset} landing set`).toEqual([...landing].sort((a, b) => a - b));
  }
});

test('the landing set is the offset XOR the space, both of which the page prints', async ({ page }) => {
  await reachTableDiffed(page);
  for (const coset of ['0', '7', '16']) {
    await page.locator('#coset-select').selectOption(coset);
    const landing = await chipValues(page, '#coset-detail div:nth-of-type(2) ul');
    const space = await chipValues(page, '#coset-detail div:nth-of-type(3) ul');
    const heading = (await page.locator('#coset-detail h4').nth(2).textContent()) ?? '';
    const offset = parseInt(/offset ([0-9A-F]{2})/.exec(heading)?.[1] ?? '', 16);
    expect(space, `coset ${coset} space is 4-dimensional`).toHaveLength(16);
    expect(space).toContain(0);
    const rebuilt = space.filter((w) => w !== 0).map((w) => offset ^ w).sort((a, b) => a - b);
    expect(rebuilt, `coset ${coset} = offset XOR space`).toEqual([...landing].sort((a, b) => a - b));
  }
});

// ── 4.1b: parts sum to whole ────────────────────────────────────────────────

test('the 17 landing sets plus pi(0) tile all 256 outputs exactly once', async ({ page }) => {
  await reachTableDiffed(page);
  const published = await publishedTableFromDom(page);
  const seen = new Set<number>([published[0]]);
  let total = 1;
  for (let i = 0; i < 17; i++) {
    await page.locator('#coset-select').selectOption(String(i));
    const landing = await chipValues(page, '#coset-detail div:nth-of-type(2) ul');
    expect(landing).toHaveLength(15);
    for (const y of landing) {
      seen.add(y);
      total++;
    }
  }
  expect(total, '17 x 15 landing values plus pi(0)').toBe(256);
  expect(seen.size, 'and no value is hit twice').toBe(256);
});

test('the space tally counts the distinct spaces the page itself printed', async ({ page }) => {
  await reachTableDiffed(page);
  for (const [box, expected] of [
    ['pi', 2],
    ['aes', 17],
  ] as const) {
    await page.locator('#box-select').selectOption(box);
    const spaces = new Set<string>();
    for (let i = 0; i < 17; i++) {
      await page.locator('#coset-select').selectOption(String(i));
      spaces.add((await chipValues(page, '#coset-detail div:nth-of-type(3) ul')).join(','));
    }
    const stated = Number(
      /uses (\d+) distinct landing space/.exec((await page.locator('#space-tally').textContent()) ?? '')?.[1],
    );
    expect(spaces.size, `${box}: distinct spaces actually printed`).toBe(expected);
    expect(stated, `${box}: the tally agrees with the chips`).toBe(spaces.size);
  }
});

// ── 4.1b: failure paths, retirement, and the no-op guard ────────────────────

test('a broken constant retires the green verdict and the page says what broke', async ({ page }) => {
  await reachTableDiffed(page);
  await expect(page.locator('#diff-verdict')).toContainText('Hamming distance 0 of 256');

  await page.locator('#in-s').fill('0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0');
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'fail');
  await expect(page.locator('#diff-verdict')).not.toContainText('Hamming distance 0 of 256');
  await expect(page.locator('#constraint-msg')).toContainText('s is no longer a permutation of 0..14');
  // The reuse claim retires with it -- one generator, so one failure.
  await expect(page.locator('#reuse-verdict')).toHaveAttribute('data-tone', 'fail');
});

test('re-selecting the same coset does not retire a fresh verdict', async ({ page }) => {
  await reachTableDiffed(page);
  await page.locator('#coset-select').selectOption('5');
  const before = await page.locator('#coset-detail').textContent();
  await page.locator('#coset-select').selectOption('5');
  expect(await page.locator('#coset-detail').textContent()).toBe(before);
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
});

test('resetting the constants brings the verdicts back, and clears the sticky marks', async ({ page }) => {
  await reachTableDiffed(page);
  await page.locator('#break-one-bit').click();
  await expect(page.locator('#pane-table td.miss').first()).toBeVisible();
  await page.locator('#reset-constants').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#pane-table td.miss')).toHaveCount(0);
});

// ── 4.1c: the INV-4 mutation gate, driven through the UI ────────────────────

test('INV-4: perturbing any one constant makes both INV-2 and INV-3 fail on screen', async ({ page }) => {
  await reachTableDiffed(page);
  const mutations: Array<[string, () => Promise<void>]> = [
    ['lambda_0', async () => page.locator('#in-lam-0').fill('13')],
    ['lambda_1', async () => page.locator('#in-lam-1').fill('27')],
    ['lambda_2', async () => page.locator('#in-lam-2').fill('25')],
    ['lambda_3', async () => page.locator('#in-lam-3').fill('31')],
    ['cstt', async () => page.locator('#in-cstt').fill('FD')],
    ['s[0]', async () => page.locator('#in-s').fill('1, 12, 9, 8, 7, 4, 14, 6, 5, 10, 2, 11, 0, 3, 13')],
  ];
  for (const [name, mutate] of mutations) {
    await page.locator('#reset-constants').click();
    await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
    await mutate();
    await expect(page.locator('#diff-verdict'), `${name}: INV-2 must fail`).toHaveAttribute('data-tone', 'fail');
    await expect(page.locator('#reuse-verdict'), `${name}: INV-3 must fail`).toHaveAttribute('data-tone', 'fail');
  }
});

test('a broken generator still produces 256 bytes rather than throwing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await reachTableDiffed(page);
  await page.locator('#in-s').fill('99');
  await page.locator('#in-cstt').fill('zz');
  await expect(page.locator('#in-cstt')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#pane-table table.sbox').nth(1).locator('tbody td')).toHaveCount(256);
  expect(errors, 'the generator must degrade, not throw').toEqual([]);
});

// ── 4.1: the [hidden] probe ─────────────────────────────────────────────────

test('hidden panes really are not painted', async ({ page }) => {
  await page.goto('.');
  for (const id of ['#pane-table', '#pane-claim']) {
    const painted = await page.locator(id).evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        display: cs.display,
        visible: (el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true }) ?? true,
      };
    });
    expect(painted.display, `${id} must not paint while [hidden]`).toBe('none');
    expect(painted.visible).toBe(false);
  }
});

// ── 4.1d: the negative claim and its evidence fixture ───────────────────────

test('4.1d: every check reports success, and the limitation is on screen in that state', async ({ page }) => {
  // 1. Reach the fixture through the UI.
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();

  // 2. Everything is green: every verdict the page renders in this state
  //    reports success. Asserted against the RENDERED verdicts across all
  //    three panes -- a flag the test sets would prove nothing, and a sweep of
  //    pane 3 alone would miss the two panes whose checks made the fixture.
  const tones: string[] = [];
  for (const name of [/The Cipher/, /The Table/, /The Claim/]) {
    await page.getByRole('tab', { name }).click();
    tones.push(
      ...(await page
        .locator('.pane:not([hidden]) [data-tone]')
        .evaluateAll((els) =>
          els
            .filter((e) => (e as HTMLElement).offsetParent !== null)
            .map((e) => e.getAttribute('data-tone') ?? ''),
        )),
    );
  }
  expect(tones.length, 'the fixture must render verdicts, not none').toBeGreaterThan(4);
  expect(tones.filter((t) => t !== 'pass'), 'no verdict may be anything but pass in the fixture').toEqual([]);
  await expect(page.locator('#standing-verdict')).toContainText('STRUCTURE RECOVERED — AND NOTHING IS BROKEN');

  // 3. The limitation is visible in that state -- not in the README, and not
  //    behind a disclosure the reader has to open.
  const claim = page.locator('#negative-claim');
  await expect(claim).toBeVisible();
  await expect(claim).toContainText('It is not an attack');
  expect(
    await claim.evaluate((el) => el.closest('details') !== null),
    'the negative claim must not be behind a disclosure',
  ).toBe(false);
});

test('INV-6: the no-attack finding is attributed to Perrin, not asserted by us', async ({ page }) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  const text = (await page.locator('#pane-claim').textContent()) ?? '';
  const sentences = text.split(/(?<=\.)\s+/).filter((s) => /no attack/i.test(s));
  expect(sentences.length, 'the page must make the no-attack statement').toBeGreaterThan(0);
  for (const s of sentences) {
    expect(s, `unattributed no-attack claim: ${s}`).toMatch(/Perrin|he (has )?(reports|states|found)/i);
  }
});

// ── 4.1d: scope tests for the other negative claims in shipped copy ─────────

async function allShippedCopy(page: Page): Promise<string> {
  await reachTableDiffed(page);
  const parts: string[] = [];
  for (const name of [/The Cipher/, /The Table/, /The Claim/]) {
    await page.getByRole('tab', { name }).click();
    for (const summary of await page.locator('.pane:not([hidden]) details summary').all()) {
      await summary.click();
    }
    parts.push((await page.locator('.pane:not([hidden])').textContent()) ?? '');
  }
  parts.push((await page.locator('.cl-hero').textContent()) ?? '');
  parts.push((await page.locator('.scripture-footer').textContent()) ?? '');
  return parts.join('\n');
}

test('non-goal: the words backdoor, dishonest and malicious do not appear in shipped copy', async ({ page }) => {
  const copy = await allShippedCopy(page);
  expect(copy.length, 'the copy sweep must actually read the page').toBeGreaterThan(4000);
  for (const word of ['backdoor', 'dishonest', 'malicious']) {
    expect(copy.toLowerCase(), `the word "${word}" is a non-goal of this lab`).not.toContain(word);
  }
});

test('INV-8: nothing implies GOST specified a field for pi', async ({ page }) => {
  const copy = await allShippedCopy(page);
  const approved = 'GOST specified no field for π — it published a lookup table.';
  expect(copy).toContain(approved);
  // The field must never be attributed to the standard or its designers. The
  // approved sentence above says GOST specified NO field, which the patterns
  // below cannot tell apart from the thing they forbid, so it is removed first
  // -- and separately asserted present, so removing it cannot hide a loss.
  const rest = copy.split(approved).join(' ');
  for (const bad of [
    /GOST[^.]{0,80}(specifies|specified|defines|defined)[^.]{0,40}field/i,
    /the standard[^.]{0,60}(specifies|specified|defines|defined)[^.]{0,40}field/i,
    /designers[^.]{0,60}(chose|specified|published)[^.]{0,30}(the )?field/i,
  ]) {
    expect(rest, `INV-8 violated by: ${bad}`).not.toMatch(bad);
  }
});

test('the TKlog label ships verbatim, and the recovery is credited to Perrin', async ({ page }) => {
  const copy = await allShippedCopy(page);
  expect(copy).toContain(
    'a discrete logarithm on F₂₈ composed with an integer-to-field map recovered by Perrin (2019) — not published by the designers.',
  );
});

test('the a = 1 coset is named as an exception rather than smoothed over', async ({ page }) => {
  const copy = await allShippedCopy(page);
  expect(copy).toContain('the a = 1 coset');
  expect(copy).toMatch(/f ⊕ g split does not hold/);
});

test('the AES control does not claim AES has no coset structure', async ({ page }) => {
  const copy = await allShippedCopy(page);
  // The honest version of the contrast, which the naive measurement would get wrong.
  expect(copy).toMatch(/Every one of AES.s 17 cosets also lands on an additive coset/);
  expect(copy).toMatch(/how many DISTINCT spaces/);
});

// ── 4.1b: the free cross-check from the brief's edge cases ──────────────────

test('pi(0) = cstt = FC, checked against the page rather than a comment', async ({ page }) => {
  await reachTableDiffed(page);
  const published = await publishedTableFromDom(page);
  expect(published[0]).toBe(0xfc);
  await expect(page.locator('#in-cstt')).toHaveValue(hex2(published[0]));
});

test('the cipher pane names the RFC ciphertext it compared against', async ({ page }) => {
  await reachCipherVerified(page);
  const text = (await page.locator('#kat-encrypt').textContent()) ?? '';
  const [produced, printed] = [...text.matchAll(/([0-9a-f]{32})/g)].map((m) => m[1]);
  expect(produced, 'the page must print both sides of the comparison').toBeDefined();
  expect(produced).toBe(printed);
  expect(produced).toBe('7f679d90bebc24305a468d42b9d4edcd');
});

// ── the gates themselves ────────────────────────────────────────────────────

test('pane 2 is unreachable until the cipher has been checked', async ({ page }) => {
  await page.goto('.');
  await page.getByRole('tab', { name: /The Table/ }).click();
  await expect(page.locator('#pane-table')).toContainText('Locked until the cipher checks out');
  await expect(page.locator('#generate-diff')).toHaveCount(0);
});

test('pane 3 is unreachable until the table has been rebuilt', async ({ page }) => {
  await reachCipherVerified(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await expect(page.locator('#pane-claim')).toContainText('Locked until the table has been rebuilt');
  await expect(page.locator('#standing-verdict')).toHaveCount(0);
});

test('the probability scale reports the ratio of the two counts it prints', async ({ page }) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await page.locator('#pane-claim details summary').first().click();
  const listed = (await page.locator('#pane-claim details li').allTextContents()).join(' ');
  const instances = Number(/TKlog instances on 8 bits: about 2\^([\d.]+)/.exec(listed)?.[1]);
  const perms = Number(/permutations of a byte: 256! ≈ 2\^([\d.]+)/.exec(listed)?.[1]);
  const shown = Number(
    /2\^(-?[\d.]+)/.exec((await page.locator('#tklog-probability').textContent()) ?? '')?.[1],
  );
  // Parts sum to whole: the probability IS the ratio of the two counts.
  expect(instances - perms).toBeCloseTo(shown, 1);
});

// ── source traceability: every consequential claim carries a link ──────────

const ALLOWED_SOURCE_HOSTS = [
  'www.rfc-editor.org',
  'tosc.iacr.org',
  'eprint.iacr.org',
  'who.paris.inria.fr',
  'nvlpubs.nist.gov',
];

test('every dated record entry cites a primary source beside it', async ({ page }) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  const items = page.locator('.record > li');
  const count = await items.count();
  expect(count, 'the record must have entries').toBeGreaterThanOrEqual(3);
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const when = ((await item.locator('.when').textContent()) ?? '').trim();
    const links = item.locator('a[data-source]');
    expect(await links.count(), `record entry "${when}" has no source link`).toBeGreaterThan(0);
    for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''))) {
      expect(new URL(href).protocol, `${when}: ${href}`).toBe('https:');
      expect(ALLOWED_SOURCE_HOSTS, `${when}: unexpected host in ${href}`).toContain(new URL(href).host);
    }
  }
});

test('each named technical claim carries a link where it is made', async ({ page }) => {
  await reachTableDiffed(page);
  // section heading (or disclosure summary) -> a source id that must be linked inside it
  const required: Array<[RegExp, string, string]> = [
    [/The Table/, 'Rebuild it, then diff it', 'tosc2019'],
    [/The Table/, 'Rebuild it, then diff it', 'rfc6986'],
    [/The Claim/, 'The reality check', 'bannier'],
    [/The Claim/, 'How unlikely is unlikely', 'tosc2019'],
    [/The Claim/, 'Prior art, and further reading', 'tosc2016'],
    [/The Claim/, 'Prior art, and further reading', 'eurocrypt2016'],
  ];
  for (const [tab, heading, sourceId] of required) {
    await page.getByRole('tab', { name: tab }).click();
    const card = page
      .locator('.pane:not([hidden]) .card')
      .filter({ has: page.getByRole('heading', { name: heading }) });
    await expect(card, `card "${heading}" must exist`).toHaveCount(1);
    await expect(
      card.locator(`a[data-source="${sourceId}"]`).first(),
      `"${heading}" must link ${sourceId} where the claim is made`,
    ).toHaveAttribute('href', /^https:\/\//);
  }
});

test('the errata are cited where the L coefficients are discussed', async ({ page }) => {
  await reachCipherVerified(page);
  const card = page
    .locator('#pane-cipher .card')
    .filter({ hasText: 'One thing the RFC gets wrong' });
  await expect(card).toHaveCount(1);
  await expect(card.locator('a[data-source="eid6928"]')).toHaveCount(1);
  await expect(card.locator('a[data-source="eid4660"]')).toHaveCount(1);
  // EID 4660 must be described as editorial, never as the fix for the vectors.
  await expect(card).toContainText('editorial and unrelated');
});

test('the bibliography lists every source the page can cite, with no orphans', async ({ page }) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  const listed = await page
    .locator('#bibliography li[data-source-entry]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-source-entry') ?? ''));
  expect(listed.length, 'the bibliography must be populated').toBeGreaterThanOrEqual(12);
  expect(new Set(listed).size, 'no duplicate bibliography entries').toBe(listed.length);

  // Every source linked anywhere in the page must appear in the bibliography.
  const cited = new Set<string>();
  for (const tab of [/The Cipher/, /The Table/, /The Claim/]) {
    await page.getByRole('tab', { name: tab }).click();
    for (const summary of await page.locator('.pane:not([hidden]) details summary').all()) {
      await summary.click();
    }
    for (const id of await page
      .locator('.pane:not([hidden]) a[data-source]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-source') ?? ''))) {
      cited.add(id);
    }
  }
  expect([...cited].filter((id) => !listed.includes(id)), 'cited but not in the bibliography').toEqual([]);
  // And every bibliography entry is a real link, not bare text.
  const hrefs = await page
    .locator('#bibliography a[data-source]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  expect(hrefs).toHaveLength(listed.length);
  for (const href of hrefs) expect(ALLOWED_SOURCE_HOSTS).toContain(new URL(href).host);
});

test('source links open safely and are not identified by colour alone', async ({ page }) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  const links = page.locator('#pane-claim a[data-source]');
  expect(await links.count()).toBeGreaterThan(10);
  const bad = await links.evaluateAll((els) =>
    els
      .filter(
        (e) =>
          e.getAttribute('rel') !== 'noopener noreferrer' ||
          getComputedStyle(e).textDecorationLine === 'none',
      )
      .map((e) => e.textContent ?? ''),
  );
  expect(bad, 'every source link needs rel="noopener noreferrer" and a visible underline').toEqual([]);
});

// ── retirement of the pane-3 summary ───────────────────────────────────────

test('editing a constant retires the standing verdict, and the page says so', async ({ page }) => {
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  // Through the shared helper, which asserts the words, the tone, the class and
  // the tick as one claim -- a mutation that flips the sentence and leaves the
  // green tick standing is not a kill. `e2e/verdicts.spec.ts` fails the build
  // if this test stops going through it.
  await expectVerdict(page, 'standing-verdict', {
    text: 'STRUCTURE RECOVERED',
    state: 'pass',
    because: 'the standing verdict must report the state of the checks in panes 1 and 2',
  });

  await page.getByRole('tab', { name: /The Table/ }).click();
  await page.locator('#break-one-bit').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'fail');
  await page.getByRole('tab', { name: /The Claim/ }).click();

  // The stale verdict is gone, the page says it was withdrawn, and it reports
  // the same distance pane 2 is showing -- a cross-check between two surfaces.
  await expectVerdict(page, 'standing-verdict', {
    text: ['RETIRED', 'withdrawn'],
    state: 'fail',
    because: 'a broken constant must retire the standing verdict',
  });
  await expect(page.locator('#standing-verdict')).not.toContainText('STRUCTURE RECOVERED');

  const summary = (await page.locator('#standing-verdict').textContent()) ?? '';
  const fromPane3 = Number(/differs from the published table in (\d+) of 256/.exec(summary)?.[1]);
  await page.getByRole('tab', { name: /The Table/ }).click();
  const fromPane2 = Number(
    /Hamming distance (\d+) of 256/.exec((await page.locator('#diff-verdict').textContent()) ?? '')?.[1],
  );
  expect(fromPane3, 'the two panes must report the same distance').toBe(fromPane2);
  expect(fromPane3).toBeGreaterThan(0);

  // And it comes back when the constants do.
  await page.locator('#reset-constants').click();
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await expectVerdict(page, 'standing-verdict', {
    text: 'STRUCTURE RECOVERED',
    state: 'pass',
    because: 'the standing verdict must come back when the constants do',
  });
});

test('a retired summary does not retire the sourced record below it', async ({ page }) => {
  // The record is about π as published; a visitor's edits must not appear to
  // undermine it. This is the shape that would be easy to get wrong by wiring
  // the whole pane to `everythingGreen`.
  await reachTableDiffed(page);
  await page.getByRole('tab', { name: /The Table/ }).click();
  await page.locator('#break-one-bit').click();
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await expect(page.locator('#standing-verdict')).toHaveAttribute('data-tone', 'fail');
  await expect(page.locator('.record > li')).toHaveCount(3);
  await expect(page.locator('#bibliography li[data-source-entry]')).toHaveCount(12);
  await expect(page.locator('#negative-claim')).toBeVisible();
});
