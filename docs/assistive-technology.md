# Assistive-technology checks

Two kinds of evidence live here, and they are kept apart on purpose.

## 1. Automated — runs in CI, and is real evidence about wiring

| What is checked | Where | Status |
|---|---|---|
| Zero axe WCAG 2.1 A/AA violations across ~25 driven states, at 1280 and 380 | `e2e/a11y.spec.ts` | automated, gating |
| axe's `incomplete` bucket asserted too (`aria-prohibited-attr`, `aria-required-children` appear only there) | `e2e/gate.ts` | automated, gating |
| Composite-aware contrast, computed arithmetically, including inside `aria-hidden` subtrees | `e2e/contrast.ts` | automated, gating |
| Non-text contrast on every control boundary, per painted side | `e2e/nontext.ts` | automated, gating |
| Scrolling regions keyboard-reachable — four lookup tables really do scroll here | `expectScrollersReachable` | automated, gating |
| Nothing focusable that paints nothing | `expectNoInvisibleFocusTargets` | automated, gating |
| Reflow at 380px, which axe has no rule for | `expectNoHorizontalOverflow` | automated, gating |
| Every visible control has an accessible name | `e2e/flows.spec.ts` | automated, gating |
| Verdicts carry `role="status"`, `aria-live="polite"`, and a WORD, not just a tint | `e2e/flows.spec.ts` | automated, gating |
| The whole journey driven by keyboard alone | `e2e/flows.spec.ts` | automated, gating |
| Target size ≥ 24px at phone width | `e2e/flows.spec.ts` | automated, gating |

## 2. Manual screen-reader pass — NOT YET PERFORMED

**Status: outstanding.** No manual screen-reader pass has been run against this
lab. Nothing below has been observed; this is the script to follow, not a record
of results.

It is recorded as outstanding rather than quietly skipped because automation
cannot answer these questions. Every check in section 1 verifies that the
*markup* is right. None of them tells you whether the page is *comprehensible*
when read aloud in sequence — whether the coset view means anything without the
picture, whether a 256-cell table is navigable in practice, or whether the live
verdicts interrupt at a useful moment rather than a maddening one.

### The script

Run with VoiceOver (macOS, Safari) and, if available, NVDA (Windows, Firefox).

1. **Landmarks and headings.** Rotor through landmarks: exactly one banner (the
   shared top bar), one main, one contentinfo. Then through headings: do the
   three panes read as a sequence?
2. **The pane gates.** Panes 2 and 3 announce `(locked)` as part of the tab
   name. Does the reason arrive before the frustration — is the lock card's
   explanation reached without hunting?
3. **Tab navigation.** Arrow keys move between panes and wrap. Does the newly
   selected panel get announced, or does focus land silently?
4. **The stepped round.** Each hex cell is a list item labelled
   `byte N: AB, changed`. Is 16 of those per stage useful or exhausting? Note
   whether the `changed` suffix lands before the value or after.
5. **The lookup tables.** Each is a `<table>` in a labelled, focusable
   `role="group"` scroller. Check: does table navigation give row/column
   headers? Is the scroller reachable and scrollable from the keyboard? Is
   `input FC: AB, mismatch — published byte is CD` intelligible at speed?
6. **Live verdicts.** Press Generate & Diff, then break a constant. The verdicts
   are `role="status"` `aria-live="polite"`. Are they announced? Do three of
   them changing at once produce a useful summary or a pile-up?
7. **Invalid constants.** Type `zz` into `cstt`. Is `aria-invalid` announced,
   and is the constraint message (also a polite live region) heard?
8. **The probability slider.** Does it announce its value, and is the readout —
   a separate live region referenced by `aria-describedby` — heard after it?
9. **The shape figure.** Both SVGs are `aria-hidden`; the description is a real
   paragraph. Confirm it is read exactly once, and that it is followed by the
   figcaption rather than replacing it.
10. **The negative claim.** In the all-green state, is the limitation reached in
    normal reading order, or only by hunting?

### Recording a result

Append a dated section with the tool, version, browser, and one line per step —
including the steps that were fine. A pass with no observations usually means
the pass did not happen.
