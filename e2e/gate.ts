import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Five rules govern everything here, and each one corrects something the gate
 * this replaces did:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The old spec pushed
 *     `animation:none!important; transition:none!important` through
 *     `addStyleTag`. That BYPASSES this lab's own
 *     `@media (prefers-reduced-motion: reduce)` block instead of exercising it,
 *     so the one rendering a reduced-motion reader actually gets — `.panel` and
 *     `.reveal` with their animations cancelled by the stylesheet's own rule —
 *     was never once the rendering that got scanned. This gate sets the
 *     preference through `emulateMedia`, asserts from inside the page that it
 *     took effect (`test.use({ reducedMotion })` silently does nothing on
 *     Playwright 1.61.1), and injects nothing.
 *
 *  2. IT FORCED EVERY PANEL VISIBLE FROM SCRIPT. The old drive stripped every
 *     `[hidden]` attribute and set every `<details>.open` by JS before its only
 *     scan. Stripping `hidden` puts all three panes on screen AT ONCE — a
 *     rendering no reader can reach and axe then scans instead of the real one
 *     — and it would also walk straight past this lab's pane GATES, scanning
 *     content no first-time reader can see while never scanning the lock cards
 *     every reader does see. Script-opening the disclosures means the SHUT
 *     state was never scanned either. This gate switches panes by clicking
 *     their tabs, unlocks them by doing the work, and opens each disclosure
 *     through its `<summary>`.
 *
 *  3. IT DROVE BLIND AND THEN THREW THE STATES AWAY. The old drive clicked
 *     every button whose label matched a regex, swallowed every failure with
 *     `.catch(() => {})`, waited a fixed 120ms per tab, and scanned ONCE at the
 *     end — so the unparseable-constant rendering, the collapsed-partition
 *     branch, the sticky-red mismatch grid and the stepper's intermediate
 *     states would all have been overwritten before anything measured them,
 *     and a click that silently did nothing would look identical to one that
 *     worked. This drive names every control it touches, asserts a real
 *     completion signal after each, and scans after every step, at 1280 and
 *     at 380. Dark is the only theme here, so there is no second theme axis.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. This lab's own fills
 *     are flat tokens rather than `color-mix()`, but the shared top bar's ink
 *     and border are `color-mix(in srgb, …)` and axe files those under
 *     `incomplete` rather than judging them. So is an `aria-label` on a
 *     role-less element, and `aria-required-children` on an explicit
 *     `role="list"` — which this lab puts on every styled list.
 *
 *  5. IT HAD NO REFLOW, NON-TEXT-CONTRAST OR GENERATED-CONTENT ORACLE. The old
 *     spec hand-rolled one luminance check over two input selectors, reading
 *     the DECLARED `border-top-color` and `background-color` — blind to
 *     `color-mix()`, to composited backdrops, to every `.act`, `.pane-btn`,
 *     `select` and table cell, and to all states past first paint.
 *     `nontext.ts` replaces it with a measured oracle over every control at
 *     every driven state, and `expectNoHorizontalOverflow` adds the 1.4.10
 *     check axe has no rule for.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Two rAFs are not enough. A transition sampled mid-flight has a colour that
 * exists in no state of the page, and axe will happily report it: elsewhere in
 * this fleet that produced a phantom 2.00:1 failure on a button whose settled
 * ratio is 9:1. Transitions also drain in waves rather than in one batch, so a
 * poll for "nothing running right now" can exit through a gap between waves —
 * hence six consecutive quiet frames rather than one.
 *
 * Bounded three ways, because a gate that can hang is a gate nobody runs:
 * animations that never finish (`iterations: Infinity`) are excluded from the
 * quiescence test rather than waited on, a wall-clock budget inside the page
 * gives up and proceeds, and Playwright's own timeout is the backstop.
 *
 * Under the reduced motion this gate asserts, `styles.css`'s reduced-motion
 * block cancels every transition, so `getAnimations()` is normally empty and
 * this returns on the sixth frame. It stays because the shared top bar's
 * `.cl-btn` transitions are declared OUTSIDE the lab's `@media` block —
 * `* { transition: none !important }` wins today, but that is a property of
 * the current stylesheet, not of the page.
 */
export async function settle(page: Page, budgetMs = 4000): Promise<void> {
  await page.waitForFunction(
    (budget: number) => {
      const w = window as unknown as { __quietFrames?: number; __settleStart?: number };
      if (w.__settleStart === undefined) w.__settleStart = performance.now();
      const done = (): boolean => {
        w.__quietFrames = 0;
        w.__settleStart = undefined;
        return true;
      };
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        const timing = a.effect?.getComputedTiming?.();
        // An infinite decorative animation never drains; waiting on it hangs.
        return timing?.iterations !== Infinity;
      });
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      if (w.__quietFrames >= 6) return done();
      if (performance.now() - (w.__settleStart ?? 0) > budget) return done();
      return false;
    },
    budgetMs,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set. This lab
 * declares no `@keyframes` at all and fades nothing, so it cannot have that
 * shape today. The assertion stays because a single `animation` added to a
 * card or a verdict would create it silently, and because the reduced-motion
 * block already sits in `styles.css` waiting to cancel one.
 *
 * `aria-hidden` subtrees are excluded; what this lab hides is the verdict and
 * cell marker glyphs beside their own words — see `contrast.ts`.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from the moment the page
 * is created. Every pane here renders synchronously at first activation, so a
 * renderer that throws leaves that tabpanel EMPTY — and an empty region is
 * exactly what a scan reports as perfectly accessible. Attach before `boot`,
 * assert after the drive.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark.
 *
 * The shared `.cl-topbar` carries an explicit `role="banner"`. This lab's own
 * hero is a `<div class="cl-hero">`, not a `<header>`, so nothing here implies
 * a second banner today — but the shared bar's `dedupeBanner()` exists because
 * other labs in this fleet DID ship one, and the hero markup is the part of
 * this page most likely to be re-templated from a lab that uses `<header>`,
 * where the template itself prints the hero as a `<header class="cl-hero">`.
 * Asserting the OUTCOME rather than the markup is what catches that edit.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * List semantics survive their styling.
 *
 * This lab is full of lists styled `list-style: none` — the legends, the byte
 * chips, the record, the reference list — which is exactly the declaration
 * that makes Safari and VoiceOver DROP a list's implicit role. The UI
 * compensates the documented way: an explicit `role="list"` on the container
 * and `role="listitem"` on every child, so here, unlike most of this fleet, an
 * explicit role on a list is the fix rather than the defect. What is asserted
 * is therefore the SHAPE of that fix: any explicit role on a `ul`/`ol` must be
 * `list` (any other value orphans every `<li>` under it), and a `role="list"`
 * must never sit on an empty element, because axe applies
 * `aria-required-children` to the explicit role and fails it the day the
 * pipeline renders with no stages. Roles can be assigned as JS properties in
 * an element-creation helper, so ask the DOM rather than grepping the source.
 */
export async function assertListSemantics(page: Page): Promise<void> {
  const broken = await page.$$eval('ul[role], ol[role]', (els) =>
    els
      .filter((e) => e.getAttribute('role') !== 'list' || e.children.length === 0)
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}[role=${e.getAttribute('role')}] with ${e.children.length} children`
      )
  );
  expect(
    broken,
    'an explicit non-list role on a list deletes its semantics; an empty role="list" fails aria-required-children'
  ).toEqual([]);
}

/**
 * Load the page with reduced motion actually in effect, and assert the content
 * every scan relies on is really on the page — including the lab's DEFAULTS,
 * which are never assumed.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page. Nothing in this lab's JS branches on
 * `matchMedia` and its stylesheet declares no animations at all, so the
 * reduced-motion block currently cancels nothing — the assertion stays because
 * it is what makes that a measurement rather than a reading, and because the
 * shared top bar's `.cl-btn` transitions are declared outside it.
 *
 * Dark is the only theme and there is no toggle, so nothing is seeded: the
 * page is loaded exactly as a reader loads it, and the `data-theme` assertion
 * plus the `localStorage` check below are what prove the anti-flash script ran.
 *
 * The defaults are asserted at length because panes 2 and 3 render lazily on
 * first activation and are GATED besides. A navigation that resolves proves
 * nothing: a renderer that threw would leave the pane empty, and an empty
 * region is exactly what a scan reports as perfectly accessible.
 */
export async function boot(page: Page, theme: 'dark'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the
  // whole test timeout and reports nothing useful. 20s turns that silent hang
  // into a named failure naming the locator.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await assertSingleBanner(page);
  await assertListSemantics(page);

  // The anti-flash script WRITES 'theme' rather than reading it -- dark is the
  // only theme here and there is no toggle -- so assert the write landed. If
  // that script were ever refused (a CSP without its hash, say) the page would
  // still look right because `<html data-theme="dark">` is in the markup, and
  // this is the only thing that would notice.
  expect(
    await page.evaluate(() => localStorage.getItem('theme')),
    "the anti-flash script must have stamped localStorage 'theme'"
  ).toBe('dark');

  // ── The page really rendered ────────────────────────────────────────────
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('.pane-btn')).toHaveCount(3);

  // The shared skip link points at an id that exists. axe's skip-link rule is
  // best-practice, not WCAG-tagged, so `withTags` never runs it -- a skip link
  // aimed at a missing element is exactly the kind of thing a green axe run
  // says nothing about.
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app');
  await expect(page.locator('#app')).toHaveCount(1);

  // Dark is the only theme, so the page must carry no theme control at all.
  // The shared CSS hides any lab toggle with `display:none !important`, which
  // would leave a dead-but-known element; asserting the count at zero catches
  // the day one is added without going through that list.
  await expect(
    page.locator('#theme-toggle, #themeToggle, .theme-toggle, .theme-toggle-btn, [data-theme-toggle]')
  ).toHaveCount(0);
  await expect(page.locator('#cl-theme-toggle')).toHaveCount(0);

  // ── The arrival state, asserted rather than assumed ─────────────────────
  // Pane 1 renders at mount and its stepper starts on the input state alone.
  // Panes 2 and 3 are GATED: hidden, and empty until their tab is first
  // activated -- "empty" being this lab's tell that a renderer threw (see
  // `watchPageErrors`), which is why both halves are checked.
  await expect(page.getByRole('tab', { name: /The Cipher/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('#pane-cipher .stage')).toHaveCount(1);
  await expect(page.locator('#pane-cipher .block-cell')).toHaveCount(16);
  for (const id of ['table', 'claim']) {
    await expect(page.locator(`#pane-${id}`)).toBeHidden();
    await expect(page.locator(`#pane-${id}`)).toBeEmpty();
  }
  // The gate is real: both later tabs say so in a word, not a colour.
  await expect(page.getByRole('tab', { name: /The Table/ })).toContainText('(locked)');
  await expect(page.getByRole('tab', { name: /The Claim/ })).toContainText('(locked)');

  // ── Every shipped control default ───────────────────────────────────────
  await expect(page.locator('#round-select')).toHaveValue('0');
  await expect(page.locator('#kat-encrypt')).toHaveAttribute('data-tone', 'idle');
  await expect(page.locator('#kat-decrypt')).toHaveAttribute('data-tone', 'idle');

  // ── Disclosures ship shut ───────────────────────────────────────────────
  await expect(page.locator('details[open]')).toHaveCount(0);

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all. The shapes at
 * risk here are the four 16x16 lookup tables, whose `min-width` would push the
 * document sideways if their `.scroll-x` wrappers were ever removed, and the
 * `.grid-wrap` / `.const-grid` flex and grid rows, whose items must collapse
 * to one column below 640px. At 380px that is precisely what this check exists
 * to catch — and note that the clipping test below is what stops a table
 * inside a working scroller being blamed for it.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow: auto` wrapper has a huge bounding rect but
    // is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 *
 * This lab has four of them: the 16x16 lookup tables in pane 2 each sit in a
 * `.scroll-x` wrapper that really does scroll below about 20rem of column
 * width. So this assertion is LIVE here, not vacuous as it is in most of the
 * fleet. Each wrapper is built by `scrollRegion()` in `src/ui/dom.ts` with
 * `tabindex="0"`, `role="group"` and an `aria-label`; drop any one of the
 * three and this fails, where axe reports nothing.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY);
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Nothing may be focusable while it paints nothing (WCAG 2.4.3 / 2.4.7).
 *
 * `opacity: 0` with `pointer-events: none` is NOT hiding: the element keeps
 * `tabIndex: 0`, so a keyboard reader tabs to a control that is not on screen
 * and the focus ring lands nowhere. `display: none` and `visibility: hidden`
 * DO remove an element from the tab order, so those are skipped rather than
 * flagged — the failure is specifically the invisible-but-tabbable pair. The
 * `hidden` panes here take the `display: none` route, which is why the other
 * two panes' controls are legitimately absent from the tab order.
 *
 * Off-screen-but-focusable is the WCAG-sanctioned skip-link idiom and is
 * deliberately not flagged: the shared skip link parks at `top:-3rem` with
 * full opacity and slides in on focus. The drive scans it focused.
 */
export async function expectNoInvisibleFocusTargets(page: Page, label: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
      if (el.tabIndex < 0) continue;
      // display:none / visibility:hidden already remove it from the tab order.
      if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        effective *= parseFloat(getComputedStyle(n).opacity);
      }
      const r = el.getBoundingClientRect();
      if (effective !== 0 && r.width > 0 && r.height > 0) continue;
      // Confirm it really is reachable rather than inferring it.
      const before = document.activeElement;
      el.focus();
      const took = document.activeElement === el;
      (before as HTMLElement | null)?.focus?.();
      if (took) {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').trim()}` +
            ` (opacity ${effective}, ${Math.round(r.width)}x${Math.round(r.height)})`
        );
      }
    }
    return Array.from(new Set(out));
  });
  expect(bad, `focusable elements that paint nothing in state: ${label}`).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run.
 * It is a debugging aid only: `A11Y_COLLECT` is never set in CI, and a run
 * with it set prints every finding as it happens and then fails at the end, so
 * a green collection run cannot be mistaken for a green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function soft(fn: () => Promise<void>): Promise<void> {
  if (!COLLECTING) return fn();
  try {
    await fn();
  } catch (e) {
    // Generous, not 900: a truncated oracle dump is how a second and third
    // finding in the same state get missed on a collection pass.
    record(String(e).slice(0, 6000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no
 * text node.
 *
 * IT IS CALLED FROM `scan()`, deliberately and not by accident. Fleet-wide
 * this oracle had been called from inside a soft wrapper AFTER its
 * `if (!COLLECTING) return` guard — so in a strict run, which is every run in
 * CI and every run anyone reads as a pass, the guard returned first and
 * `nontext.ts` never executed at all. Thirteen repos certified themselves
 * clean on an oracle that had never looked. Calling it here means it runs at
 * every driven state, including `:hover`, and this repo's baseline was
 * captured by that live path.
 *
 * A check that merely logs is not a gate, so it ratchets: anything NOT in the
 * baseline fails, anything in the baseline that got WORSE fails, and anything
 * in the baseline that has been FIXED fails until its entry is deleted. That
 * last rule is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the
 * point — or the drive stopped reaching the state that shows it, which is a
 * coverage regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Nine assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically. This lab paints its own surfaces from flat tokens
 *    rather than `color-mix()`, but the shared top bar's ink and border are
 *    `color-mix(in srgb, …)` and axe declines them. Everything else in that
 *    bucket is a real result axe simply could not finish — including
 *    `aria-prohibited-attr`, which is where an `aria-label` on a role-less
 *    element hides, and `aria-required-children`, which is where an empty
 *    `role="list"` hides. This page leans on getting both right: the 4x4 hex
 *    block, the two legends, the byte-chip lists, the record and the reference
 *    list all pair an `aria-label` or an explicit `role="list"` with a real
 *    role and real children. Drop either and the label is silently discarded.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - the same walk over `aria-hidden` content with the exemption lifted —
 *    SC 1.4.3 is about what a reader SEES; see `contrast.ts` for what this
 *    lab hides and why it is measured anyway.
 *  - non-text contrast and generated content — SC 1.4.11, ratcheted; see
 *    `expectNoNewNonTextFailures`. This is the only oracle that judges a
 *    control's boundary against the surface OUTSIDE it.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1, live here: four
 *    lookup tables sit in `overflow-x: auto` wrappers.
 *  - no focusable element that paints nothing — WCAG 2.4.3/2.4.7.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first —
  // the axe-core/playwright source says so in as many words on `withRules`
  // ("Cannot be used with AxeBuilder#withTags"). Chained as
  // `.withTags(TAGS).withRules([...4 landmark rules])`, axe runs those FOUR
  // best-practice rules and NOT ONE WCAG RULE, while a green result reads
  // exactly like a full A/AA pass. For scale, `withTags(TAGS)` selects 69 of
  // axe-core 4.12's 105 rule definitions; the chained form executes 4.
  //
  // The landmark four are still wanted because they are best-practice rather
  // than WCAG-tagged, so `withTags` alone does not reach them — and this page
  // has the shape they catch: a sticky `<header role="banner">` above a
  // `<div id="app">` holding an `<aside class="cl-hero-why">`, two `<nav>`s
  // (the shared actions and the tablist wrapper), one `<main>` and a footer.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  // The `incomplete` bucket is asserted, not skimmed. `aria-prohibited-attr`
  // and `aria-required-children` appear ONLY here — never in `violations` — so
  // a gate that ignores this bucket cannot see either. Only `color-contrast`
  // is allowed to remain, and only because the arithmetic walk below judges
  // those ratios for real; no other rule is filtered out.
  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  // The aria-hidden walk, exemption lifted — axe skips this text entirely and
  // the default walk honours the same boundary, so this second call is the
  // ONLY thing that ever measures it. See `contrast.ts` for the inventory.
  const hiddenContrast = Array.from(
    new Set(
      formatContrastFailures(
        await auditContrast(page, '[aria-hidden="true"], [aria-hidden="true"] *', true)
      )
    )
  );
  softExpect(hiddenContrast, `measured aria-hidden contrast failures in state: ${label}`, []);

  await soft(() => expectNoNewNonTextFailures(page, label));
  await soft(() => expectScrollersReachable(page, label));
  await soft(() => expectNoInvisibleFocusTargets(page, label));
  await soft(() => expectNoHorizontalOverflow(page, label));
}

// ── The drive ───────────────────────────────────────────────────────────────

/** Switch to a pane by clicking its tab, and prove the switch happened. */
async function openPane(page: Page, name: RegExp, paneId: string): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(paneId)).toBeVisible();
  await expect(page.locator(paneId)).not.toBeEmpty();
}

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * Five things shape this drive:
 *
 *  - THE ARRIVAL STATE IS SCANNED FIRST, exactly as a reader gets it: pane 1
 *    active with its step control on the input state only, panes 2 and 3
 *    showing their lock cards, every disclosure shut.
 *
 *  - THE PANES ARE GATED, so panes 2 and 3 have TWO renderings each — the lock
 *    card and the real content — and the lock card is the one every reader
 *    meets first. Both are scanned. Unlocking is done by driving the real
 *    controls, never by reaching into the app's state.
 *
 *  - THE FAILURE STATES ARE SCANNED, and here they are the interesting half:
 *    the sticky-red mismatch grid after a constant is broken, the constraint
 *    warning under the editor, an `aria-invalid` input, the NO COSET verdict
 *    when the partition collapses, and the AES control's seventeen-space tally.
 *    None of these is reachable without deliberately breaking something.
 *
 *  - THE SCROLLERS ARE REAL HERE. Four 16x16 lookup tables each live in an
 *    `overflow-x: auto` region, so `expectScrollersReachable` is live rather
 *    than vacuous: each wrapper carries `tabindex="0"`, `role="group"` and an
 *    `aria-label`, and a regression in any of the three is a WCAG 2.1.1
 *    failure axe cannot see.
 *
 *  - NO FIXED TIMEOUTS. Every wait is on a real DOM signal: a verdict's tone
 *    attribute, a cell's class, `aria-selected`, the tally's wording.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);

  await scanAt('arrival: pane 1 at step 0, panes 2 and 3 locked, disclosures shut');

  // ── The shared skip link, focused ───────────────────────────────────────
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('the shared skip link focused, slid in from top:-3rem');

  // ── The locked panes, which is what a first-time reader actually sees ───
  await openPane(page, /The Table/, '#pane-table');
  await expect(page.locator('#pane-table')).toContainText('Locked until the cipher checks out');
  await scanAt('pane 2 locked: the gate card and its way out');

  await openPane(page, /The Claim/, '#pane-claim');
  await expect(page.locator('#pane-claim')).toContainText('Locked until the table has been rebuilt');
  await scanAt('pane 3 locked: the gate card');

  // ── Pane 1: the step control ────────────────────────────────────────────
  await openPane(page, /The Cipher/, '#pane-cipher');
  for (const expected of [2, 3, 4]) {
    await page.getByRole('button', { name: 'Step', exact: true }).click();
    await expect(page.locator('#pane-cipher .stage')).toHaveCount(expected);
  }
  await expect(page.locator('#pane-cipher .block-cell.changed').first()).toBeVisible();
  await scanAt('pane 1: one LSX round stepped to the end, changed bytes marked');

  await page.locator('#round-select').selectOption('4');
  await expect(page.locator('#pane-cipher .stage')).toHaveCount(1);
  await scanAt('pane 1: round 5 selected, stepper reset to the input state');

  // ── Pane 1: the KAT run, which is the gate on pane 2 ────────────────────
  await page.locator('#run-kat').click();
  await expect(page.locator('#kat-encrypt')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#kat-decrypt')).toHaveAttribute('data-tone', 'pass');
  await scanAt('pane 1: both RFC 7801 vectors passed');

  await page.locator('#kat-trace summary').click();
  await expect(page.locator('#kat-trace details[open]')).toHaveCount(1);
  await scanAt('pane 1: the ten intermediate states disclosed');

  // ── Pane 2, now unlocked: state A, the empty grid ───────────────────────
  await openPane(page, /The Table/, '#pane-table');
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'idle');
  await expect(page.locator('#pane-table td.blank').first()).toBeVisible();
  await scanAt('pane 2 state A: published grid filled, rebuilt grid empty');

  // ── State B: generate and diff ──────────────────────────────────────────
  await page.locator('#generate-diff').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#reuse-verdict')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#pane-table td.miss')).toHaveCount(0);
  await scanAt('pane 2 state B: rebuilt, Hamming distance 0, all cells green');

  await page.locator('#pane-table details').first().locator('summary').click();
  await expect(page.locator('#pane-table details[open]')).toHaveCount(1);
  await scanAt('pane 2: the defining equations disclosed');

  // ── State C: the coset view, on pi and then on the AES control ──────────
  await expect(page.locator('#coset-verdict')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#space-tally')).toContainText('2 distinct landing spaces');
  await scanAt('pane 2 state C: coset 0 of pi, the a = 1 exception');

  await page.locator('#coset-select').selectOption('5');
  await expect(page.locator('#coset-verdict')).toContainText('subfield');
  await scanAt('pane 2 state C: coset 5 of pi, landing on the subfield');

  await page.locator('#box-select').selectOption('aes');
  await expect(page.locator('#space-tally')).toContainText('17 distinct landing spaces');
  await scanAt('pane 2 state C: the AES control, seventeen distinct spaces');

  await page.locator('#pane-table details').nth(1).locator('summary').click();
  await expect(page.locator('#pane-table details[open]')).toHaveCount(2);
  await scanAt('pane 2: the AES-comparison disclosure open');

  await page.locator('#box-select').selectOption('pi');
  await expect(page.locator('#space-tally')).toContainText('2 distinct landing spaces');

  // ── State D: break it, and watch every failure surface at once ──────────
  await page.locator('#break-one-bit').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'fail');
  await expect(page.locator('#pane-table td.miss').first()).toBeVisible();
  await expect(page.locator('#constraint-msg')).toBeEmpty();
  await scanAt('pane 2 state D: one bit of lambda flipped, sticky-red mismatches');

  await page.locator('#in-s').fill('0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0');
  await expect(page.locator('#constraint-msg')).toContainText('no longer a permutation');
  await scanAt('pane 2 state D: s collapsed, the constraint warning shown');

  await page.locator('#box-select').selectOption('generated');
  await expect(page.locator('#coset-verdict')).toHaveAttribute('data-tone', 'fail');
  await scanAt('pane 2 state D: the partition gone from the visitor-broken box');

  await page.locator('#in-cstt').fill('zz');
  await expect(page.locator('#in-cstt')).toHaveAttribute('aria-invalid', 'true');
  await scanAt('pane 2 state D: an unparseable constant, aria-invalid boundary');

  // Pane 3 in its RETIRED state. This is a third rendering of the standing
  // verdict -- not the idle one a first visitor sees, and not the green one the
  // reset path reaches -- so without this step it would be the one state the
  // page can paint that nothing ever scans.
  await openPane(page, /The Claim/, '#pane-claim');
  await expect(page.locator('#standing-verdict')).toHaveAttribute('data-tone', 'fail');
  await expect(page.locator('#standing-verdict')).toContainText('RETIRED');
  await scanAt('pane 3: the standing verdict retired by a broken constant');

  await openPane(page, /The Table/, '#pane-table');
  await page.locator('#reset-constants').click();
  await expect(page.locator('#diff-verdict')).toHaveAttribute('data-tone', 'pass');
  await expect(page.locator('#in-cstt')).toHaveAttribute('aria-invalid', 'false');
  await scanAt('pane 2: reset to Perrin’s constants, back to distance 0');

  // Hover persists after a click, and `.pane-btn:hover` repaints its border.
  await page.getByRole('tab', { name: /The Claim/ }).hover();
  await scanAt('the pane-3 tab hovered');

  // ── Pane 3, now unlocked ────────────────────────────────────────────────
  await openPane(page, /The Claim/, '#pane-claim');
  await expect(page.locator('#standing-verdict')).toContainText('STRUCTURE RECOVERED');
  await scanAt('pane 3: the standing verdict with every check green');

  await page.locator('#lottery-scale').fill('10');
  await expect(page.locator('#scale-compare')).toContainText('likelier');
  await scanAt('pane 3: the scale at 10 wins, still far likelier');

  await page.locator('#lottery-scale').fill('70');
  await expect(page.locator('#scale-compare')).toContainText('rarer');
  await scanAt('pane 3: the scale past the crossing point');

  await page.locator('#pane-claim details summary').first().click();
  await expect(page.locator('#pane-claim details[open]')).toHaveCount(1);
  await scanAt('pane 3: the three numbers disclosed');

  await page.locator('#pane-claim a').first().focus();
  await scanAt('pane 3: an inline reference link focused');

  // ── Keyboard navigation of the tablist ──────────────────────────────────
  await page.getByRole('tab', { name: /The Claim/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /The Cipher/ })).toHaveAttribute('aria-selected', 'true');
  await scanAt('tablist wrapped with ArrowRight, back to pane 1');
}
