import { expect, test, type Page } from '@playwright/test';

/**
 * The critical-path journey, in every engine, plus the geometry assertions that
 * axe cannot make.
 *
 * Why this exists alongside the a11y gate: zero WCAG violations and zero
 * horizontal overflow are necessary and NOT sufficient for a page that reads
 * well. This lab shipped a mobile hero with 190px of dead space under it --
 * the template's `flex: 1 1 22rem` becoming a HEIGHT once the container turned
 * into a column -- and it passed both oracles the whole time. The layout
 * assertions below are the ones that would have caught it.
 *
 * Everything here is measured from the rendered page, never from a constant
 * copied out of the stylesheet, so a token change that genuinely improves the
 * layout does not fail the test while a regression does.
 */

const DESKTOP = { width: 1280, height: 900 };

/** The whole gated journey, which is also what proves each engine can run it. */
async function journey(page: Page): Promise<void> {
  await page.goto('.');
  await page.locator('#run-kat').click();
  await expect(page.locator('#kat-encrypt')).toHaveAttribute('data-tone', 'pass');
  await page.getByRole('tab', { name: /The Table/ }).click();
  await page.locator('#generate-diff').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
}

test('the critical path works end to end', async ({ page }) => {
  await page.goto('.');

  // Pane 1: the stepper advances and marks changed bytes.
  await expect(page.locator('#pane-cipher .stage')).toHaveCount(1);
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(page.locator('#pane-cipher .stage')).toHaveCount(2);
  await expect(page.locator('#pane-cipher .block-cell.changed').first()).toBeVisible();

  // The gate is real.
  await page.getByRole('tab', { name: /The Table/ }).click();
  await expect(page.locator('#pane-table')).toContainText('Locked until the cipher checks out');
  await page.getByRole('tab', { name: /The Cipher/ }).click();
  await page.locator('#run-kat').click();
  await expect(page.locator('#kat-encrypt')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#kat-decrypt')).toHaveAttribute('data-tone', 'pass');

  // Pane 2: rebuild, diff, coset view, AES control, break, reset.
  await page.getByRole('tab', { name: /The Table/ }).click();
  await page.locator('#generate-diff').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#reuse-verdict')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#pane-table td.miss')).toHaveCount(0);

  await page.locator('#coset-select').selectOption('5');
  await expect(page.locator('#coset-verdict')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#space-tally')).toContainText('2 distinct landing spaces');
  await page.locator('#box-select').selectOption('aes');
  await expect(page.locator('#space-tally')).toContainText('17 distinct landing spaces');
  await page.locator('#box-select').selectOption('pi');

  await page.locator('#break-one-bit').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'fail');
  await expect(page.locator('#pane-table td.miss').first()).toBeVisible();
  await page.locator('#reset-constants').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');

  // Pane 3: the standing verdict and the movable scale.
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await expect(page.locator('#standing-verdict')).toContainText('STRUCTURE RECOVERED');
  await page.locator('#lottery-scale').fill('70');
  await expect(page.locator('#scale-compare')).toContainText('rarer');
});

test('pane 2 keeps its state when you leave and come back', async ({ page }) => {
  await journey(page);
  await page.locator('#coset-select').selectOption('9');
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await page.getByRole('tab', { name: /The Table/ }).click();
  // A pane that re-rendered on every tab switch would throw the visitor's work away.
  await expect(page.locator('#coset-select')).toHaveValue('9');
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
});

test('the whole journey is reachable by keyboard alone', async ({ page }) => {
  await page.goto('.');
  await page.locator('#run-kat').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#kat-encrypt')).toHaveAttribute('data-tone', 'pass');
  await page.getByRole('tab', { name: /The Cipher/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /The Table/ })).toHaveAttribute('aria-selected', 'true');
  await page.locator('#generate-diff').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
});

/**
 * What a screen reader would actually announce.
 *
 * This is not a substitute for a human with a screen reader -- see
 * `docs/assistive-technology.md` -- but it does mechanically check the wiring
 * those tools depend on: accessible names, live regions, and the fact that a
 * verdict's meaning survives with colour removed.
 */
test('verdicts announce their meaning in words, not colour', async ({ page }) => {
  await journey(page);
  for (const id of ['#diff-verdict', '#reuse-verdict', '#coset-verdict']) {
    const node = page.locator(id);
    await expect(node).toHaveAttribute('role', 'status');
    await expect(node).toHaveAttribute('aria-live', 'polite');
    // The word, not the tint, is what carries the state.
    await expect(node).toContainText(/MATCH|MISMATCH|ADDITIVE COSET|NO COSET/);
  }
  const named = await page
    .locator('.pane:not([hidden]) button, .pane:not([hidden]) select, .pane:not([hidden]) input')
    .evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .filter((e) => {
          const label = e.getAttribute('aria-label') ?? e.closest('label')?.textContent ?? '';
          const own = (e as HTMLElement).innerText ?? '';
          return !(label.trim() || own.trim());
        })
        .map((e) => `${e.tagName.toLowerCase()}#${e.id}`),
    );
  expect(named, 'every visible control needs an accessible name').toEqual([]);
});

// ── geometry: what axe cannot see ──────────────────────────────────────────

test('the hero title block has no dead space at any width', async ({ page }) => {
  for (const size of [DESKTOP, { width: 768, height: 900 }, { width: 380, height: 900 }]) {
    await page.setViewportSize(size);
    await page.goto('.');
    const gap = await page.locator('.cl-hero-main').evaluate((el) => {
      const kids = Array.from(el.children) as HTMLElement[];
      const contentBottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
      return el.getBoundingClientRect().bottom - contentBottom;
    });
    // A flex-basis leaking into the cross axis showed up here as ~190px.
    expect(gap, `hero dead space at ${size.width}px`).toBeLessThan(24);
  }
});

test('exactly one shape figure is visible, and its labels are legible', async ({ page }) => {
  for (const size of [DESKTOP, { width: 380, height: 900 }]) {
    await page.setViewportSize(size);
    await journey(page);
    await page.getByRole('tab', { name: /The Claim/ }).click();
    const measured = await page.locator('.shape-figure').evaluate((fig) => {
      const visible = Array.from(fig.querySelectorAll('svg')).filter((s) =>
        (s as SVGElement).checkVisibility?.({ checkVisibilityCSS: true }),
      );
      if (visible.length !== 1) return { count: visible.length, min: 0, overflow: 0 };
      const svg = visible[0];
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / Number(svg.getAttribute('viewBox')!.split(' ')[2]);
      const sizes = Array.from(svg.querySelectorAll('text')).map(
        (t) => parseFloat(getComputedStyle(t).fontSize) * scale,
      );
      return {
        count: visible.length,
        min: Math.min(...sizes),
        overflow: rect.width - fig.getBoundingClientRect().width,
      };
    });
    expect(measured.count, `one variant at ${size.width}px`).toBe(1);
    expect(measured.min, `smallest label at ${size.width}px`).toBeGreaterThanOrEqual(12);
    expect(measured.overflow, `figure must fit its container at ${size.width}px`).toBeLessThanOrEqual(1);
  }
});

test('the two lookup tables sit side by side on desktop and stack on a phone', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await journey(page);
  const desktop = await page.locator('#pane-table .grid-wrap').first().evaluate((el) => {
    const [a, b] = Array.from(el.children).map((c) => c.getBoundingClientRect());
    return { sameRow: Math.abs(a.top - b.top) < 4, scrolls: (el.querySelector('.scroll-x') as HTMLElement).scrollWidth > (el.querySelector('.scroll-x') as HTMLElement).clientWidth + 1 };
  });
  expect(desktop.sameRow, 'the published and rebuilt grids should be comparable side by side').toBe(true);
  expect(desktop.scrolls, 'and neither should need scrolling at 1280px').toBe(false);

  await page.setViewportSize({ width: 380, height: 900 });
  await journey(page);
  const stacked = await page.locator('#pane-table .grid-wrap').first().evaluate((el) => {
    const [a, b] = Array.from(el.children).map((c) => c.getBoundingClientRect());
    return b.top >= a.bottom - 4;
  });
  expect(stacked, 'the grids must stack below 640px').toBe(true);
});

test('no control is smaller than the 24px target floor', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 900 });
  await journey(page);
  const small = await page
    .locator('.pane:not([hidden]) button, .pane:not([hidden]) select, .pane:not([hidden]) input[type="text"]')
    .evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => ({ id: e.id || e.className, r: e.getBoundingClientRect() }))
        .filter((x) => x.r.height < 24 || x.r.width < 24)
        .map((x) => `${x.id} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
    );
  expect(small, 'WCAG 2.5.8 target size').toEqual([]);
});

test('the grids and the scale stay inside the viewport on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 900 });
  await journey(page);
  await page.getByRole('tab', { name: /The Claim/ }).click();
  await page.locator('#lottery-scale').fill('66');
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  expect(overflow.scrollWidth, 'no horizontal scrolling on a phone').toBeLessThanOrEqual(
    overflow.clientWidth + 1,
  );
  // The readout must wrap rather than clip: every tile fully inside its grid.
  const clipped = await page.locator('#scale-readout').evaluate((el) => {
    const box = el.getBoundingClientRect();
    return Array.from(el.children)
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.right > box.right + 1 || r.left < box.left - 1).length;
  });
  expect(clipped, 'scale readout tiles must fit').toBe(0);
});
