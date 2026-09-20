import { expect, test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches: the arrival state, where pane
 * 1's stepper shows the input block only and panes 2 and 3 are hidden AND
 * UNRENDERED behind their gates; the shared skip link focused; both lock cards,
 * which are the first thing any reader sees of panes 2 and 3; one LSX round
 * stepped to its end with changed bytes marked, and a different round key
 * selected; the RFC 7801 encrypt and decrypt verdicts; the ten-state
 * disclosure; pane 2's empty right-hand grid before anything is generated, and
 * its all-green state after; the defining-equations disclosure; the coset view
 * on coset 0 (the a = 1 exception), on coset 5 (the subfield case), and on the
 * AES control with its seventeen distinct landing spaces; the AES-comparison
 * disclosure; then the break-it-yourself states, which are where the failure
 * renderings live — one flipped lambda bit and its sticky-red mismatches, a
 * collapsed `s` with its constraint warning, the coset view showing the
 * partition gone, an unparseable constant behind an `aria-invalid` boundary,
 * and the reset back to distance 0; a hovered tab; pane 3's standing verdict,
 * its probability scale on both sides of the crossing point, its disclosure
 * and a focused reference link; and finally the tablist wrapping under
 * ArrowRight. Every one of those states is scanned, at desktop and phone width.
 *
 * Dark is the only theme this lab ships, so there is one theme axis, not two.
 *
 * See `gate.ts` for why nothing is injected into the page (the old gate's
 * `addStyleTag` motion kill bypassed the stylesheet's own reduced-motion
 * block, so the rendering reduced-motion readers get was never the one
 * scanned), why no pane is revealed from script (the old gate stripped every
 * `[hidden]` and opened every `<details>` by JS before its only scan — here
 * that would also walk straight past the pane gates), why the lab's defaults
 * are asserted rather than assumed, and why `violations` is not the whole
 * oracle.
 */

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors = watchPageErrors(page);
  await boot(page, 'dark');
  await driveAllStates(page, 'dark');
  expect(errors, errors.join('\n')).toEqual([]);
  expectBaselineNotStale();
  reportCollected();
});

test('no WCAG A/AA violations in dark theme at 380px', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors = watchPageErrors(page);
  await page.setViewportSize(NARROW);
  await boot(page, 'dark');
  await driveAllStates(page, 'dark @380px');
  expect(errors, errors.join('\n')).toEqual([]);
  expectBaselineNotStale();
  reportCollected();
});
