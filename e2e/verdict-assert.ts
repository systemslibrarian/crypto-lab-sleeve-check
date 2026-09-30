import { expect, test as pwTest, type Locator, type Page } from '@playwright/test';
import { enterHelper, exitHelper, record } from './observe';

/**
 * The one way this lab is allowed to assert a marker, AND the one way it is
 * allowed to read one.
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
 * `e2e/coverage.spec.ts` fails the build if a ledger entry's owning test did
 * not EXECUTE such a call. A text-only kill cannot be recorded as evidence --
 * and neither can a call that only appears in the source.
 *
 * WHY THE CALL RETURNS WHAT IT READ
 * ---------------------------------
 * Several tests here need the marker's words for a second check -- the hex
 * digests in the KAT verdicts, the distance in the pane 3 summary, the run
 * count in the scale readout. They used to fetch those with a locator of their
 * own, beside the helper call rather than through it, and that is the same
 * defect one level down: the helper call satisfies the coverage rule while the
 * comparison that matters is made against a value nothing asserted. Worse, a
 * value read off a marker is a value an expectation about that marker can be
 * built from, and an expectation built that way cannot fail.
 *
 * So the helper hands back what it read, the tests use that, and
 * `e2e/observe.ts` records any extraction from a ledger marker that goes round
 * it. The coverage audit fails on one. The helper's reading is the thing
 * asserted.
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
 *
 * A LIST OF STATES IS NOT A KILL
 * ------------------------------
 * `state: ['pass', 'fail']` is allowed, for the two tests that SEARCH rather
 * than assert -- the seventeen cosets for a broken one, the three ways of
 * breaking a constant for the distance each produces. It asserts that the
 * marker is coherently in one of those states, tone, class and glyph all
 * agreeing, which is strictly more than the `textContent()` read it replaced.
 * It is still weaker than naming the state, so the coverage audit refuses to
 * let a list SATISFY a ledger entry. The kill has to name which state it is.
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
  /** The state asserted. A list means "coherently one of these", which is not a kill. */
  state: VerdictState | VerdictState[];
  /**
   * The finding this call is making, in one sentence.
   *
   * It is carried onto EVERY channel asserted here, so whichever channel a
   * mutation flips, the failure output names the finding rather than the
   * mechanics. `scripts/mutation.mjs` requires each ledger entry's `names`
   * string to appear in the failure it produces, and `e2e/coverage.spec.ts`
   * requires the owning test to have EXECUTED a call carrying that same
   * sentence -- so this field, the ledger's `names`, and the failure output are
   * one string in three places rather than three strings that happen to agree.
   */
  because: string;
}

/** What the helper read off the marker, handed back so the test can use it. */
export interface VerdictReading {
  text: string;
  tone: string | null;
  className: string;
  glyph: string | null;
}

const readChannels = (marker: Locator): Promise<VerdictReading> =>
  marker.evaluate((el) => ({
    text: el.textContent ?? '',
    tone: el.getAttribute('data-tone'),
    className: el.className,
    glyph: el.querySelector('.verdict-mark')?.textContent ?? null,
  }));

/**
 * Assert a `data-verdict` marker's text AND its state in one call, and return
 * what was read.
 *
 * Every channel is checked: the words, the `data-tone` attribute, the
 * `is-<tone>` class the stylesheet keys off, and the mark glyph. A mutation has
 * to flip all of it to be recorded as a kill.
 */
export async function expectVerdict(
  page: Page,
  id: string,
  expectation: VerdictExpectation,
): Promise<VerdictReading> {
  enterHelper();
  try {
    const { text, exact, state, because } = expectation;
    const states = [state].flat();
    expect(
      text !== undefined || exact !== undefined,
      `expectVerdict(${id}) was called with no text expectation, so it asserts nothing about what ` +
        `the marker says`,
    ).toBe(true);
    expect(states.length > 0, `expectVerdict(${id}) was called with no state`).toBe(true);
    expect(
      states.includes('none') && states.length > 1,
      `expectVerdict(${id}) mixes 'none' with a toned state: a marker either carries a state or it ` +
        `does not, and "either" is not something this helper can prove`,
    ).toBe(false);

    const marker = page.locator(`[data-verdict="${id}"]`);
    await expect(marker, `${because} [${id} must be rendered exactly once]`).toHaveCount(1);

    if (exact !== undefined) await expect(marker, `${because} [${id} text]`).toHaveText(exact);
    for (const pattern of text === undefined ? [] : [text].flat()) {
      await expect(marker, `${because} [${id} text]`).toContainText(pattern);
    }

    if (states.length === 1 && states[0] !== 'none') {
      // The retrying form, which is the right one when the expected tone is
      // known: it waits for the page to settle rather than snapshotting it.
      await expect(marker, `${because} [${id} data-tone]`).toHaveAttribute('data-tone', states[0]);
    }

    const reading = await readChannels(marker);

    if (states.length === 1 && states[0] === 'none') {
      expect(
        reading.tone,
        `${because} [${id} is asserted as a text-only marker but carries ` +
          `data-tone="${reading.tone}" -- its state is now a second channel and has to be ` +
          `asserted with the text]`,
      ).toBeNull();
      expect(
        reading.className,
        `${because} [${id} is asserted as a text-only marker but carries verdict styling]`,
      ).not.toMatch(/\bis-(pass|fail|idle)\b/);
      expect(
        reading.glyph,
        `${because} [${id} is asserted as a text-only marker but renders a mark glyph]`,
      ).toBeNull();
    } else {
      expect(states, `${because} [${id} data-tone]`).toContain(reading.tone);
      const tone = reading.tone as Exclude<VerdictState, 'none'>;
      await expect(marker, `${because} [${id} styling]`).toHaveClass(new RegExp(`\\bis-${tone}\\b`));
      await expect(marker.locator('.verdict-mark'), `${because} [${id} mark glyph]`).toHaveText(
        GLYPH[tone],
      );
    }

    observe(id, 'verdict', because, states.join('|'));
    return reading;
  } finally {
    exitHelper();
  }
}

export interface ClaimExpectation {
  /** Substrings/patterns the rendered measurement must contain. */
  text?: Pattern | Pattern[];
  /** The machine-readable half of the same claim. */
  value: string | RegExp;
  /** The finding this call is making -- see `VerdictExpectation.because`. */
  because: string;
}

/** What the helper read off a measurement marker. */
export interface ClaimReading {
  text: string;
  value: string;
}

/**
 * Assert a `data-claim` measurement marker, and return what was read.
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
): Promise<ClaimReading> {
  enterHelper();
  try {
    const { value, text, because } = expectation;
    const marker = page.locator(`[data-claim="${id}"]`);
    await expect(marker, `${because} [${id} must be rendered exactly once]`).toHaveCount(1);
    await expect(marker, `${because} [${id} data-value]`).toHaveAttribute('data-value', value);
    for (const pattern of text === undefined ? [] : [text].flat()) {
      await expect(marker, `${because} [${id} text]`).toContainText(pattern);
    }

    const reading = await marker.evaluate((el) => ({
      text: el.textContent ?? '',
      value: el.getAttribute('data-value') ?? '',
    }));
    observe(id, 'claim', because);
    return reading;
  } finally {
    exitHelper();
  }
}

/**
 * Write down that this call happened, in this test.
 *
 * Deliberately AFTER the assertions: a call that threw is not evidence that the
 * marker was checked, and recording it first would let a failing helper look
 * like coverage.
 */
function observe(marker: string, family: 'verdict' | 'claim', because: string, state?: string): void {
  let info: { title: string; project: { name: string } };
  try {
    info = pwTest.info();
  } catch {
    return; // not inside a running test; nothing to attribute the call to
  }
  record({
    project: info.project.name,
    test: info.title,
    marker,
    family,
    kind: 'helper',
    because,
    state,
  });
}
