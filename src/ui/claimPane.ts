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

import { clear, el, svg } from './dom';

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

function shapeFigure(): HTMLElement {
  const band = (x: number, y: number, fill: string) =>
    svg('rect', { x, y, width: 86, height: 9, rx: 2, fill, stroke: 'currentColor', 'stroke-width': 0.6 });

  const panel = (ox: number, title: string, inputShape: SVGElement[], caption: string) =>
    svg('g', { transform: `translate(${ox} 0)` }, [
      svg('text', { x: 0, y: 14, fill: 'currentColor', 'font-size': 11, 'font-weight': 700 }, [title]),
      svg('rect', { x: 0, y: 24, width: 86, height: 74, rx: 4, fill: 'none', stroke: 'currentColor', 'stroke-width': 1 }),
      ...inputShape,
      svg('text', { x: 0, y: 112, fill: 'currentColor', 'font-size': 9 }, ['input side']),
      svg('path', { d: 'M 43 118 L 43 134 M 38 129 L 43 134 L 48 129', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }),
      svg('rect', { x: 0, y: 140, width: 86, height: 74, rx: 4, fill: 'none', stroke: 'currentColor', 'stroke-width': 1 }),
      band(0, 148, 'var(--img-fill)'),
      band(0, 164, 'var(--img-fill)'),
      band(0, 180, 'var(--img-fill)'),
      band(0, 196, 'var(--img-fill)'),
      svg('text', { x: 0, y: 228, fill: 'currentColor', 'font-size': 9 }, ['output side']),
      svg('text', { x: 0, y: 244, fill: 'currentColor', 'font-size': 9 }, [caption]),
    ]);

  const parallelIn = [band(0, 32, 'var(--sel-fill)'), band(0, 48, 'var(--sel-fill)'), band(0, 64, 'var(--sel-fill)'), band(0, 80, 'var(--sel-fill)')];
  const ringsIn = [
    svg('circle', { cx: 43, cy: 61, r: 30, fill: 'none', stroke: 'currentColor', 'stroke-width': 0.8 }),
    svg('circle', { cx: 43, cy: 61, r: 21, fill: 'none', stroke: 'currentColor', 'stroke-width': 0.8 }),
    svg('circle', { cx: 43, cy: 61, r: 12, fill: 'none', stroke: 'currentColor', 'stroke-width': 0.8 }),
    svg('circle', { cx: 43, cy: 61, r: 4, fill: 'var(--sel-fill)', stroke: 'currentColor', 'stroke-width': 0.8 }),
  ];

  const figure = svg(
    'svg',
    { viewBox: '0 0 260 256', role: 'img', 'aria-labelledby': 'shape-title shape-desc', class: 'shape-svg' },
    [
      svg('title', { id: 'shape-title' }, [
        'The shape the structural condition needs, beside the shape π actually has',
      ]),
      svg('desc', { id: 'shape-desc' }, [
        'Two panels. In the left panel, labelled what the condition needs, the input side is ' +
          'drawn as four parallel bands — additive cosets — and the output side is four parallel bands ' +
          'too. In the right panel, labelled what π has, the input side is drawn as nested rings — ' +
          'multiplicative cosets, which are not parallel slices — while the output side is again four ' +
          'parallel bands. The two panels agree on the output side and differ on the input side.',
      ]),
      panel(0, 'Needed', parallelIn, 'additive in'),
      panel(146, 'What π has', ringsIn, 'multiplicative in'),
    ],
  );

  return el('figure', { class: 'shape-figure' }, [
    figure,
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
  root.appendChild(
    el('section', { class: `card ${everythingGreen ? 'card-intro' : ''}` }, [
      el('h2', { text: 'What the rebuild does, and does not, establish' }),
      el(
        'p',
        {
          class: `verdict ${everythingGreen ? 'is-pass' : 'is-idle'}`,
          id: 'standing-verdict',
          // Same `data-tone` contract as every other verdict on the page, so the
          // claims suite's "every verdict reports success" sweep includes this
          // one rather than stepping around it.
          'data-tone': everythingGreen ? 'pass' : 'idle',
          role: 'status',
          'aria-live': 'polite',
        },
        [
          el('span', { class: 'verdict-mark', 'aria-hidden': 'true', text: everythingGreen ? '✓' : '·' }),
          el('span', {}, [
            el('strong', {
              text: everythingGreen ? 'STRUCTURE RECOVERED — AND NOTHING IS BROKEN' : 'Run panes 1 and 2 first',
            }),
            everythingGreen
              ? ' — the cipher matched every RFC 7801 §5 vector, and the rebuild matched all 256 ' +
                'published bytes with Hamming distance 0. Every check on this page reports success, ' +
                'and in exactly that state nothing here breaks Kuznyechik: no key is recovered, no ' +
                'distinguisher is built, no ciphertext is read.'
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
          el('span', { class: 'when', text: 'THE DESIGNERS’ STATED POSITION WHEN ASKED' }),
          el('p', {}, [
            'Cryptographers who put the question to the designers at conferences were told, in ' +
              'substance, that the S-box was picked at random from some set. The designers also say ' +
              'the generation algorithm was lost. Recorded by Perrin in his FAQ, §2.1.',
          ]),
        ]),
        el('li', { role: 'listitem' }, [
          el('span', { class: 'when', text: '22 MAY 2019' }),
          el('p', {}, [
            'After the TKlog result was published, the designers argued that the structure was a ' +
              'coincidence. Perrin states that those arguments are factually wrong, and the paper ' +
              'addressing them is Bonnetain, Perrin and Tian, eprint 2019/528.',
          ]),
        ]),
        el('li', { role: 'listitem' }, [
          el('span', { class: 'when', text: 'OCTOBER 2019 · ISO MEETING, PARIS' }),
          el('p', {}, [
            'Perrin met the alleged designer of the S-box. Perrin reports that he maintained the ' +
              'randomness claim and said he had lost the program that generated the S-box. Recorded ' +
              'in the 19 February 2020 update to Perrin’s page.',
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
    const lotteryExp = LOG2_LOTTERY * runs;
    const shortfall = lotteryExp - LOG2_TKLOG_PROBABILITY; // positive = lottery is still likelier
    clear(readout);
    readout.appendChild(
      el('div', {}, [
        el('span', { class: 'k', text: 'French lottery, won this many times running' }),
        `${runs}`,
      ]),
    );
    readout.appendChild(
      el('div', {}, [
        el('span', { class: 'k', text: 'probability of that run' }),
        `2^${lotteryExp.toFixed(1)}`,
      ]),
    );
    readout.appendChild(
      el('div', { id: 'tklog-probability' }, [
        el('span', { class: 'k', text: 'probability a random 8-bit permutation is a TKlog' }),
        `2^${LOG2_TKLOG_PROBABILITY.toFixed(1)}`,
      ]),
    );
    readout.appendChild(
      el('div', { id: 'scale-compare' }, [
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
          'Move the scale until a run of lottery wins gets that rare.',
      ]),
      el('label', { for: 'lottery-scale' }, ['Consecutive French lottery wins', slider]),
      readout,
      el('p', { class: 'note' }, [
        `Perrin’s own framing: the chance is comparable to winning the French lottery ${LOTTERY_RUNS} ` +
          'times in a row. His conclusion from that is that the structure is intentional. Note what ' +
          'the argument does and does not reach: it is about whether the table was generated this way, ' +
          'not about why, and not about who.',
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
          'it on the input side.',
      ]),
      shapeFigure(),
      el('p', { class: 'note' }, [
        'Perrin does report that, in Streebog, the linear layer interacts oddly with sets of both ' +
          'shapes, and says that interaction is not yet fully understood. He also states that he has ' +
          'found no attack leveraging these properties. That attribution matters: it is his finding, ' +
          'not a claim this page is making.',
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
      el('ul', { class: 'refs', role: 'list' }, [
        el('li', { role: 'listitem' }, [
          el('a', { href: 'https://www.rfc-editor.org/rfc/rfc7801.txt', target: '_blank', rel: 'noopener noreferrer' }, [
            'RFC 7801',
          ]),
          ' — GOST R 34.12-2015 “Kuznyechik”, Dolmatov ed., March 2016. Vectors in §5.',
        ]),
        el('li', { role: 'listitem' }, [
          el('a', { href: 'https://www.rfc-editor.org/rfc/rfc6986.txt', target: '_blank', rel: 'noopener noreferrer' }, [
            'RFC 6986',
          ]),
          ' — GOST R 34.11-2012 “Streebog”. The S-box table is §6.2.',
        ]),
        el('li', { role: 'listitem' }, [
          el('a', { href: 'https://eprint.iacr.org/2019/092', target: '_blank', rel: 'noopener noreferrer' }, [
            'Perrin, Partitions in the S-Box of Streebog and Kuznyechik',
          ]),
          ' — IACR ToSC 2019(1), 302–329. eprint 2019/092.',
        ]),
        el('li', { role: 'listitem' }, [
          el('a', { href: 'https://who.paris.inria.fr/Leo.Perrin/pi.html', target: '_blank', rel: 'noopener noreferrer' }, [
            'Perrin, On the S-Box of Streebog and Kuznyechik',
          ]),
          ' — the FAQ and the SAGE script this lab ports. Last updated 19 February 2020.',
        ]),
        el('li', { role: 'listitem' }, [
          el('a', { href: 'https://eprint.iacr.org/2016/071', target: '_blank', rel: 'noopener noreferrer' }, [
            'Biryukov, Perrin, Udovenko, Reverse-Engineering the S-box of Streebog, Kuznyechik and STRIBOBr1',
          ]),
          ' — EUROCRYPT 2016. eprint 2016/071.',
        ]),
        el('li', { role: 'listitem' }, [
          el('a', { href: 'https://eprint.iacr.org/2019/528', target: '_blank', rel: 'noopener noreferrer' }, [
            'Bonnetain, Perrin, Tian, Anomalies and Vector Space Search',
          ]),
          ' — eprint 2019/528, which addresses the coincidence argument.',
        ]),
      ]),
    ]),
  );

  drawScale();
}
