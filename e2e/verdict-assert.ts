import { expect, type Page } from '@playwright/test';

/**
 * The one way this lab is allowed to assert a marker.
 *
 * WHY A HELPER RATHER THAN A CONVENTION
 * -------------------------------------
 * A marker's TEXT and its STATE are one claim, and a test that checks only the
 * sentence records a kill for a mutation that flipped the sentence and left the
 * green tick, the `data-tone="pass"` and the `is-pass` styling exactly where
 * they were. The marker then goes on reporting success in every channel a
 * reader can see except the one the test happened to read, and the ledger
 * records that as proof.
 *
 * So every channel a marker has is asserted in ONE call, and
 * `e2e/verdicts.spec.ts` fails the build if a ledger entry's owning test does
 * not go through this helper. A text-only kill cannot be recorded as evidence.
 *
 * THE `none` STATE IS NOT A LOOPHOLE
 * ----------------------------------
 * Four of this lab's markers -- `miss-list`, `space-tally`, `constraint-msg`
 * and `scale-compare` -- are plain notes: no tone, no pass/fail class, no mark
 * glyph. For them the sentence really is the only channel, so asserting it is
 * complete. `state: 'none'` says exactly that and PROVES it: it asserts the
 * marker carries no `data-tone`, no `is-pass`/`is-fail`/`is-idle` class and no
 * mark glyph. The day someone gives one of them styling, the text-only
 * assertion stops being complete and this call goes red rather than silently
 * becoming the weak shape above.
 */

export type VerdictState = 'pass' | 'fail' | 'idle' | 'none';

/** The non-colour channel every toned verdict carries (WCAG 1.4.1). */
const GLYPH: Record<Exclude<VerdictState, 'none'>, string> = {
  pass: '✓',
  fail: '✕',
  idle: '·',
};

type Pattern = string | RegExp;

export interface VerdictExpectation {
  /** Substrings/patterns the marker must contain. */
  text?: Pattern | Pattern[];
  /** The marker's whole text, when the claim is that it says exactly this (or nothing). */
  exact?: string;
  state: VerdictState;
  /**
   * The finding this call is making, in one sentence.
   *
   * It is carried onto EVERY channel asserted here, so whichever channel a
   * mutation flips, the failure output names the finding rather than the
   * mechanics. `scripts/mutation.mjs` requires each ledger entry's `names`
   * string to appear in the failure it produces, so this sentence and that
   * field are the same sentence -- which is what stops a mutation being
   * recorded as caught by a test that went red for an unrelated reason.
   */
  because: string;
}

/**
 * Assert a `data-verdict` marker's text AND its state in one call.
 *
 * Every channel is checked: the words, the `data-tone` attribute, the
 * `is-<tone>` class the stylesheet keys off, and the mark glyph. A mutation has
 * to flip all of it to be recorded as a kill.
 */
export async function expectVerdict(
  page: Page,
  id: string,
  expectation: VerdictExpectation,
): Promise<void> {
  const { text, exact, state, because } = expectation;
  expect(
    text !== undefined || exact !== undefined,
    `expectVerdict(${id}) was called with no text expectation, so it asserts nothing about what ` +
      `the marker says`,
  ).toBe(true);

  const marker = page.locator(`[data-verdict="${id}"]`);
  await expect(marker, `${because} [${id} must be rendered exactly once]`).toHaveCount(1);

  if (exact !== undefined) await expect(marker, `${because} [${id} text]`).toHaveText(exact);
  for (const pattern of text === undefined ? [] : [text].flat()) {
    await expect(marker, `${because} [${id} text]`).toContainText(pattern);
  }

  if (state === 'none') {
    const channels = await marker.evaluate((el) => ({
      tone: el.getAttribute('data-tone'),
      className: el.className,
      glyph: el.querySelector('.verdict-mark')?.textContent ?? null,
    }));
    expect(
      channels.tone,
      `${because} [${id} is asserted as a text-only marker but carries ` +
        `data-tone="${channels.tone}" -- its state is now a second channel and has to be ` +
        `asserted with the text]`,
    ).toBeNull();
    expect(
      channels.className,
      `${because} [${id} is asserted as a text-only marker but carries verdict styling]`,
    ).not.toMatch(/\bis-(pass|fail|idle)\b/);
    expect(
      channels.glyph,
      `${because} [${id} is asserted as a text-only marker but renders a mark glyph]`,
    ).toBeNull();
    return;
  }

  await expect(marker, `${because} [${id} data-tone]`).toHaveAttribute('data-tone', state);
  await expect(marker, `${because} [${id} styling]`).toHaveClass(new RegExp(`\\bis-${state}\\b`));
  await expect(marker.locator('.verdict-mark'), `${because} [${id} mark glyph]`).toHaveText(
    GLYPH[state],
  );
}

export interface ClaimExpectation {
  /** Substrings/patterns the rendered measurement must contain. */
  text?: Pattern | Pattern[];
  /** The machine-readable half of the same claim. */
  value: string | RegExp;
  /** The finding this call is making -- see `VerdictExpectation.because`. */
  because: string;
}

/**
 * Assert a `data-claim` measurement marker.
 *
 * The measurement counterpart of `expectVerdict`, and for the same reason: a
 * rendered number has two channels too -- the sentence a reader sees and the
 * `data-value` a test reads -- and a mutation that pins one while the other
 * keeps moving is exactly the defect. Both are asserted here or neither is.
 */
export async function expectClaim(
  page: Page,
  id: string,
  expectation: ClaimExpectation,
): Promise<void> {
  const { value, text, because } = expectation;
  const marker = page.locator(`[data-claim="${id}"]`);
  await expect(marker, `${because} [${id} must be rendered exactly once]`).toHaveCount(1);
  await expect(marker, `${because} [${id} data-value]`).toHaveAttribute('data-value', value);
  for (const pattern of text === undefined ? [] : [text].flat()) {
    await expect(marker, `${because} [${id} text]`).toContainText(pattern);
  }
}
