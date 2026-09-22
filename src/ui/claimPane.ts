/**
 * Pane 3 -- The Claim. The sourced record, the counting argument, and the gap
 * between what pi has and what Bannier's structural condition would need.
 *
 * NON-GOAL, enforced by `e2e/claims.spec.ts`: the words backdoor, dishonest and
 * malicious do not appear in shipped copy. The condition is named and described
 * without them -- this lab reports what the table does, and attributes every
 * judgement to whoever made it.
 *
 * Copy rule (brief 1.4e): no quotation marks around anything not verbatim from a
 * cited document. Everything below is paraphrase with attribution.
 */

import { cite, clear, el, svg } from './dom';
import { SOURCES, SOURCE_IDS } from './sources';

/** Perrin's figures, ToSC 2019(1) and the FAQ page. */
export const LOG2_TKLOG_INSTANCES = 82.6;
export const LOG2_PERMUTATIONS = 1684;
export const LOG2_TKLOG_PROBABILITY = LOG2_TKLOG_INSTANCES - LOG2_PERMUTATIONS; // about -1601
export const LOG2_LOTTERY = -24.2;
export const LOTTERY_RUNS = 66;

export interface LabProgress {
  cipherVerified: boolean;
  diffRun: boolean;
  diffDistance: number;
}

/**
 * The two shapes, drawn side by side.
 *
 * Units are CSS pixels at the figure's capped width, so the 13px and 15px
 * labels below really render at 13px and 15px rather than at whatever a
 * full-width scale-up produces. Two variants ship: `shape-wide` (panels side by
 * side) and `shape-narrow` (stacked), swapped by a media query at 640px --
 * side by side on a phone leaves each panel about 140px across and its labels
 * under 12px.
 *
 * Both SVGs are aria-hidden and the description is a real paragraph instead, so
 * a screen reader gets it once rather than twice, and gets prose rather than a
 * <desc> whose support varies.
 */
const FIG = {
  titleSize: 15,
  labelSize: 13,
  boxH: 92,
  panelH: 292,
} as const;

const SHAPE_DESCRIPTION =
  'Two panels. In the left panel, labelled what the condition needs, the input side is drawn as ' +
  'four parallel bands — additive cosets — and the output side is four parallel bands too. ' +
  'In the right panel, labelled what π has, the input side is drawn as nested rings — ' +
  'multiplicative cosets, which are not parallel slices — while the output side is again four ' +
  'parallel bands. The two panels agree on the output side and differ on the input side. On a ' +
  'narrow screen the two panels are stacked instead of side by side.';

function bands(x: number, y: number, w: number, fill: string): SVGElement[] {
  return [0, 1, 2, 3].map((n) =>
    svg('rect', {
      x,
      y: y + 10 + n * 20,
      width: w,
      height: 13,
      rx: 2,
      fill,
      stroke: 'currentColor',
      'stroke-width': 1,
    }),
  );
}

function rings(x: number, y: number, w: number): SVGElement[] {
  const cx = x + w / 2;
  const cy = y + FIG.boxH / 2;
  return [40, 28, 16, 6].map((r, idx) =>
    svg('circle', {
      cx,
      cy,
      r,
      fill: idx === 3 ? 'var(--sel-fill)' : 'none',
      stroke: 'currentColor',
      'stroke-width': 1.2,
    }),
  );
}

/** One column: title, input box, arrow, output box, and the two side labels. */
function shapePanel(x: number, y: number, w: number, title: string, kind: 'bands' | 'rings', inLabel: string): SVGElement {
  const inBoxY = y + 26;
  const outBoxY = y + 174;
  const box = (by: number) =>
    svg('rect', { x, y: by, width: w, height: FIG.boxH, rx: 5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 });
  return svg('g', {}, [
    svg('text', { x, y: y + 15, fill: 'currentColor', 'font-size': FIG.titleSize, 'font-weight': 700 }, [title]),
    box(inBoxY),
    ...(kind === 'bands' ? bands(x, inBoxY, w, 'var(--sel-fill)') : rings(x, inBoxY, w)),
    svg('text', { x, y: y + 136, fill: 'currentColor', 'font-size': FIG.labelSize }, [inLabel]),
    svg('path', {
      d: `M ${x + w / 2} ${y + 146} L ${x + w / 2} ${y + 166} M ${x + w / 2 - 6} ${y + 160} L ${x + w / 2} ${y + 166} L ${x + w / 2 + 6} ${y + 160}`,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.6,
    }),
    box(outBoxY),
    ...bands(x, outBoxY, w, 'var(--img-fill)'),
    svg('text', { x, y: y + 284, fill: 'currentColor', 'font-size': FIG.labelSize }, ['additive out']),
  ]);
}

function shapeSvg(variant: 'wide' | 'narrow'): SVGElement {
  const wide = variant === 'wide';
  const panelW = wide ? 250 : 300;
  const viewBox = wide ? `0 0 560 ${FIG.panelH}` : `0 0 300 ${FIG.panelH * 2 + 24}`;
  return svg(
    'svg',
    { viewBox, class: `shape-${variant}`, 'aria-hidden': 'true', focusable: 'false' },
    [
      shapePanel(0, 0, panelW, 'Needed', 'bands', 'additive in'),
      wide
        ? shapePanel(310, 0, panelW, 'What π has', 'rings', 'multiplicative in')
        : shapePanel(0, FIG.panelH + 24, panelW, 'What π has', 'rings', 'multiplicative in'),
    ],
  );
}

function shapeFigure(): HTMLElement {
  return el('figure', { class: 'shape-figure' }, [
    shapeSvg('wide'),
    shapeSvg('narrow'),
    el('p', { class: 'visually-hidden', id: 'shape-description', text: SHAPE_DESCRIPTION }),
    el('figcaption', {}, [
      'Both shapes agree on the output side: parallel slices of one 4-dimensional space. They differ ' +
        'on the input side, and that is the whole gap. Bannier’s condition asks for additive ' +
        'cosets going in; π has multiplicative ones, which are not parallel slices of anything.',
    ]),
  ]);
}

export function renderClaimPane(root: HTMLElement, progress: LabProgress): void {
  clear(root);

  // --------------------------------------------------- the standing verdict --
  const everythingGreen = progress.cipherVerified && progress.diffRun && progress.diffDistance === 0;
  // Three states, not two. "Not run yet" and "run, and no longer matching" are
  // different things, and a summary that calls the second one the first is
  // telling the visitor to do work they have already done. The retired state
  // has to SAY it was retired -- that is what makes the standing verdict a
  // report on the checks rather than a decoration.
  const retired = progress.cipherVerified && progress.diffRun && progress.diffDistance !== 0;
  root.appendChild(
    el('section', { class: `card ${everythingGreen ? 'card-intro' : ''}` }, [
      el('h2', { text: 'What the rebuild does, and does not, establish' }),
      el(
        'p',
        {
          class: `verdict ${everythingGreen ? 'is-pass' : retired ? 'is-fail' : 'is-idle'}`,
          id: 'standing-verdict',
          // Same `data-tone` contract as every other verdict on the page, so the
          // claims suite's "every verdict reports success" sweep includes this
          // one rather than stepping around it.
          //
          // This one is hand-built rather than made by `verdict()` (it has three
          // states and a body of its own), so it has to carry the coverage
          // marker explicitly. That is exactly the case the outside-a-marker
          // check in `e2e/verdicts.spec.ts` exists to catch.
          'data-verdict': 'standing-verdict',
          'data-tone': everythingGreen ? 'pass' : retired ? 'fail' : 'idle',
          role: 'status',
          'aria-live': 'polite',
        },
        [
          el('span', {
            class: 'verdict-mark',
            'aria-hidden': 'true',
            text: everythingGreen ? '✓' : retired ? '✕' : '·',
          }),
          el('span', {}, [
            el('strong', {
              text: everythingGreen
                ? 'STRUCTURE RECOVERED — AND NOTHING IS BROKEN'
                : retired
                  ? 'RETIRED — THE REBUILD NO LONGER MATCHES'
                  : 'Run panes 1 and 2 first',
            }),
            everythingGreen
              ? ' — the cipher matched every RFC 7801 §5 vector, and the rebuild matched all 256 ' +
                'published bytes with Hamming distance 0. Every check on this page reports success, ' +
                'and in exactly that state nothing here breaks Kuznyechik: no key is recovered, no ' +
                'distinguisher is built, no ciphertext is read.'
              : retired
                ? ` — the constants in pane 2 have been edited, and the rebuild now differs from the ` +
                  `published table in ${progress.diffDistance} of 256 entries. This summary was ` +
                  `withdrawn when that happened; everything below still stands, because it is about ` +
                  `π as published rather than about your edited version.`
                : ' — this summary reports the state of the checks in panes 1 and 2.',
          ]),
        ],
      ),
      el('p', { class: 'lede', id: 'negative-claim' }, [
        'The limit, stated plainly: reproducing π from four constants is evidence about how the ' +
          'table was made. It is not an attack, and it does not become one by being exact. Perrin, who ' +
          'recovered the structure, reports finding no attack that leverages these properties.',
      ]),
      el('p', { class: 'note' }, [
        'A second limit, on the same footing: byte equality identifies the function, not the history. ' +
          'Two earlier decompositions also reproduce π exactly, and none of the three carries a ' +
          'signature saying which one the designers ran. This page makes no claim about intent or ' +
          'motive, and it is not a Dual_EC analogue — that case turned on a recoverable secret, ' +
          'and there is no analogous secret here.',
      ]),
    ]),
  );

  // ---------------------------------------------------------- the record ----
  root.appendChild(
    el('section', { class: 'card' }, [
      el('h2', { text: 'The record' }),
      el('ul', { class: 'record', role: 'list' }, [
        el('li', { role: 'listitem' }, [
          el('span', { class: 'when', text: 'THE DESIGNERS\u2019 STATED POSITION WHEN ASKED' }),
          el('p', {}, [
            'Cryptographers who put the question to the designers at conferences were told, in ' +
              'substance, that the S-box was picked at random from some set. The designers also say ' +
              'the generation algorithm was lost. ',
            el('span', { class: 'src' }, ['Source: ', cite('faq', 'Perrin\u2019s FAQ, \u00A72.1'), '.']),
          ]),
        ]),
        el('li', { role: 'listitem' }, [
          el('span', { class: 'when', text: '22 MAY 2019' }),
          el('p', {}, [
            'After the TKlog result was published, the designers argued that the structure was a ' +
              'coincidence. Perrin states that those arguments are factually wrong. ',
            el('span', { class: 'src' }, [
              'Source: ',
              cite('faq', 'Perrin\u2019s FAQ, Updates'),
              '; the paper addressing them is ',
              cite('eprint2019528'),
              '.',
            ]),
          ]),
        ]),
        el('li', { role: 'listitem' }, [
          el('span', { class: 'when', text: 'OCTOBER 2019 \u00B7 ISO MEETING, PARIS' }),
          el('p', {}, [
            'Perrin met the alleged designer of the S-box. Perrin reports that he maintained the ' +
              'randomness claim and said he had lost the program that generated the S-box. ',
            el('span', { class: 'src' }, [
              'Source: ',
              cite('faq', 'Perrin\u2019s FAQ, Updates \u2014 entry dated 19 February 2020'),
              '.',
            ]),
          ]),
        ]),
      ]),
    ]),
  );

  // ------------------------------------------------------- the counting -----
  const slider = el('input', {
    type: 'range',
    id: 'lottery-scale',
    min: '1',
    max: '80',
    step: '1',
    value: String(LOTTERY_RUNS),
    'aria-describedby': 'scale-readout',
  }) as HTMLInputElement;

  const readout = el('div', { class: 'scale-readout', id: 'scale-readout', role: 'status', 'aria-live': 'polite' });

  function drawScale(): void {
    const runs = Number(slider.value);
    // One literal scaled by the run count, and the readout says only that.
    //
    // What can be shown here: this number tracks the one-win figure the page
    // prints in its own details list, and the run count the readout renders
    // beside it. `e2e/verdicts.spec.ts` reads both off the page and derives the
    // expected value from them.
    //
    // What CANNOT be shown here, so what the copy must not claim: composing
    // `runs` independent wins and scaling one figure by `runs` are the same
    // arithmetic in the exponent, so no test written against this page can
    // separate them. And LOG2_LOTTERY is a literal -- the oracle reads the same
    // figure the page prints, so any value for it agrees with itself. The row
    // therefore reads `that run, on the same scale` and leaves the probability
    // reading to Perrin's framing in the prose above, where it is attributed.
    // The row below it may say probability: it is the ratio of two separately
    // printed, separately cited counts, and moving either one moves it.
    const lotteryExp = LOG2_LOTTERY * runs;
    const shortfall = lotteryExp - LOG2_TKLOG_PROBABILITY; // positive = lottery is still likelier
    clear(readout);
    // The three rendered MEASUREMENTS of the counting argument.
    //
    // `data-claim` is the measurement counterpart of `data-verdict`, and it is
    // in the same coverage loop on the same terms: a number rendered in a
    // result region with no mutation record in `scripts/mutation-ledger.json`
    // fails the build, and a record naming a claim the page has stopped
    // rendering fails too. A rendered number is as much a claim as a rendered
    // word, and it is the easier one to ship unchecked, because a number does
    // not look like a claim.
    //
    // `data-value` is the machine-readable half of the same claim. Asserting
    // both is what stops a mutation pinning one while the sentence beside it
    // keeps moving.
    readout.appendChild(
      el('div', { 'data-claim': 'lottery-runs', 'data-value': String(runs) }, [
        el('span', { class: 'k', text: 'French lottery, won this many times running' }),
        `${runs}`,
      ]),
    );
    readout.appendChild(
      el('div', { 'data-claim': 'lottery-probability', 'data-value': lotteryExp.toFixed(1) }, [
        el('span', { class: 'k', text: 'that run, on the same scale' }),
        `2^${lotteryExp.toFixed(1)}`,
      ]),
    );
    readout.appendChild(
      el(
        'div',
        {
          id: 'tklog-probability',
          'data-claim': 'tklog-probability',
          'data-value': LOG2_TKLOG_PROBABILITY.toFixed(1),
        },
        [
          el('span', { class: 'k', text: 'probability a random 8-bit permutation is a TKlog' }),
          `2^${LOG2_TKLOG_PROBABILITY.toFixed(1)}`,
        ],
      ),
    );
    readout.appendChild(
      // Marked: this line is the comparison the whole counting argument turns
      // on, and it flips between two opposite readings as the slider moves.
      el('div', { id: 'scale-compare', 'data-verdict': 'scale-compare' }, [
        el('span', { class: 'k', text: 'which is' }),
        shortfall > 0.5
          ? `still 2^${shortfall.toFixed(1)} times likelier than the TKlog coincidence`
          : shortfall < -0.5
            ? `already 2^${(-shortfall).toFixed(1)} times rarer than the TKlog coincidence`
            : 'about the same as the TKlog coincidence',
      ]),
    );
  }

  slider.addEventListener('input', drawScale);

  root.appendChild(
    el('section', { class: 'card' }, [
      el('h2', { text: 'How unlikely is unlikely' }),
      el('p', { class: 'lede' }, [
        'There are roughly 2^82.6 TKlog instances on 8 bits, against 256! ≈ 2^1684 permutations of ' +
          'a byte. So a permutation drawn at random is a TKlog with probability about 2^−1601. ' +
          'Move the scale until a run of lottery wins gets that rare. ',
        el('span', { class: 'src' }, [
          'Both counts are Perrin’s: ',
          cite('tosc2019'),
          ' (preprint: ',
          cite('eprint2019092'),
          ').',
        ]),
      ]),
      el('label', { for: 'lottery-scale' }, ['Consecutive French lottery wins', slider]),
      readout,
      el('p', { class: 'note' }, [
        `Perrin’s own framing: the chance is comparable to winning the French lottery ${LOTTERY_RUNS} ` +
          'times in a row. His conclusion from that is that the structure is intentional. Note what ' +
          'the argument does and does not reach: it is about whether the table was generated this way, ' +
          'not about why, and not about who. ',
        el('span', { class: 'src' }, ['Source: ', cite('faq', 'Perrin\u2019s FAQ, \u00A72.1.3'), '.']),
      ]),
      el('details', {}, [
        el('summary', { text: 'The three numbers, and where they come from' }),
        el('ul', {}, [
          el('li', { text: `TKlog instances on 8 bits: about 2^${LOG2_TKLOG_INSTANCES} (Perrin, ToSC 2019(1))` }),
          el('li', { text: `permutations of a byte: 256! ≈ 2^${LOG2_PERMUTATIONS}` }),
          el('li', { text: `their ratio: 2^${LOG2_TKLOG_PROBABILITY.toFixed(1)}` }),
          el('li', { text: `French lottery, one win: about 2^${LOG2_LOTTERY}` }),
        ]),
      ]),
    ]),
  );

  // ------------------------------------------------------ the reality check --
  root.appendChild(
    el('section', { class: 'card' }, [
      el('h2', { text: 'The reality check' }),
      el('p', { class: 'lede' }, [
        'Arnaud Bannier’s thesis sets out a structural condition an S-box has to satisfy before a ' +
          'block cipher built on it can carry a deliberately planted weakness of one particular kind: ' +
          'it must map sets of the form { b ⊕ x, x in V } to sets of the form { b ⊕ x, x in W }, ' +
          'with V and W vector subspaces. π has that shape on the output side. It does not have ' +
          'it on the input side. ',
        el('span', { class: 'src' }, [
          'Source: ',
          cite('bannier'),
          ' — the published form of the condition, from the 2017 ENSAM thesis Perrin cites.',
        ]),
      ]),
      shapeFigure(),
      el('p', { class: 'note' }, [
        'Perrin does report that, in Streebog, the linear layer interacts oddly with sets of both ' +
          'shapes, and says that interaction is not yet fully understood. He also states that he has ' +
          'found no attack leveraging these properties. That attribution matters: it is his finding, ' +
          'not a claim this page is making. ',
        el('span', { class: 'src' }, ['Source: ', cite('faq', 'Perrin\u2019s FAQ, \u00A72.3\u2013\u00A72.4'), ' and ', cite('tosc2019'), '.']),
      ]),
    ]),
  );

  // ------------------------------------------------------------ prior art ---
  root.appendChild(
    el('section', { class: 'card' }, [
      el('h2', { text: 'Prior art, and further reading' }),
      el('p', { class: 'note' }, [
        'TKlog is the third published decomposition of π, not the first. Biryukov, Perrin and ' +
          'Udovenko gave one at EUROCRYPT 2016; Perrin and Udovenko gave a second in ToSC 2016(2), ' +
          'which linked π to the S-box of BelT through exponential S-boxes. TKlog is the ' +
          'simplest of the three, and it explains the relationship between the first two.',
      ]),
      el('h3', { text: 'Sources', id: 'bibliography-heading' }),
      el('p', { class: 'note' }, [
        'Every source this lab cites, in one place. Each is also linked beside the sentence it ' +
          'supports; nothing above rests on a citation you have to go looking for.',
      ]),
      el(
        'ul',
        { class: 'refs', role: 'list', id: 'bibliography' },
        SOURCE_IDS.map((id) =>
          el('li', { role: 'listitem', 'data-source-entry': id }, [
            cite(id),
            ' \u2014 ',
            SOURCES[id].cite.replace(new RegExp(`^${SOURCES[id].label}\\s*[\u2014-]\\s*`), ''),
          ]),
        ),
      ),
    ]),
  );

  drawScale();
}
