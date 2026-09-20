/**
 * Pane 2 -- The Table. The core interactive.
 *
 * States, in the order the brief lays them out:
 *   A  published pi on the left, an empty grid on the right
 *   B  Generate & Diff fills the right grid from the four constants
 *   C  the coset view (headline)
 *   D  break-it-yourself: edit the constants and watch the rebuild diverge
 * plus the AES toggle, which is the nothing-up-my-sleeve control.
 */

import { PI_RFC6986, PI_RFC7801 } from '../gost/reference';
import { generateTklog, PI_PARAMS, TKLOG_FIELD, type TklogParams } from '../gost/tklog';
import { diffTables } from '../gost/diff';
import { cosetViews, distinctSpaceCount, type CosetView } from '../gost/cosets';
import { generateAesSbox, AES_FIELD } from '../gost/aes';
import { subfield16, type LogTables } from '../gost/field';
import { cite, clear, el, hex2, scrollRegion, verdict } from './dom';

const PI = [...PI_RFC7801];
const AES = generateAesSbox();

type BoxKey = 'pi' | 'generated' | 'aes';

interface GridHandles {
  readonly table: HTMLTableElement;
  readonly cells: HTMLTableCellElement[];
}

/** A 16x16 grid. `content` fills each cell; row/column headers are the hex nibbles. */
function buildGrid(caption: string, content: (index: number) => string): GridHandles {
  const cells: HTMLTableCellElement[] = [];
  const head = el('tr', {}, [
    el('th', { scope: 'col', text: '' }),
    ...Array.from({ length: 16 }, (_, c) => el('th', { scope: 'col', text: c.toString(16).toUpperCase() })),
  ]);
  const body = Array.from({ length: 16 }, (_, r) =>
    el('tr', {}, [
      el('th', { scope: 'row', text: `${r.toString(16).toUpperCase()}x` }),
      ...Array.from({ length: 16 }, (_, c) => {
        const idx = r * 16 + c;
        const cell = el('td', { text: content(idx) }) as HTMLTableCellElement;
        cells.push(cell);
        return cell;
      }),
    ]),
  );
  const table = el('table', { class: 'sbox' }, [
    el('caption', { text: caption }),
    el('thead', {}, [head]),
    el('tbody', {}, body),
  ]) as HTMLTableElement;
  return { table, cells };
}

const chipList = (values: readonly number[], extra = ''): HTMLElement =>
  el(
    'ul',
    { class: `chips ${extra}`.trim(), role: 'list' },
    values.map((v) => el('li', { role: 'listitem', text: hex2(v) })),
  );

function parseByte(raw: string): number | null {
  const v = raw.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{1,2}$/.test(v)) return null;
  return parseInt(v, 16);
}

function parseSList(raw: string): number[] | null {
  const parts = raw.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,2}$/.test(p)) return null;
    out.push(Number(p));
  }
  return out;
}

function isPermutation0to14(s: readonly number[]): boolean {
  if (s.length !== 15) return false;
  const seen = new Set(s);
  return seen.size === 15 && s.every((v) => v >= 0 && v <= 14);
}

function spans4(lambda: readonly number[]): boolean {
  const span = new Set([0]);
  for (let m = 0; m < 16; m++) {
    let r = 0;
    for (let j = 0; j < 4; j++) if ((m >> j) & 1) r ^= lambda[j] ?? 0;
    span.add(r);
  }
  return span.size === 16;
}

function complementsSubfield(lambda: readonly number[], field: LogTables): boolean {
  const sub = subfield16(field);
  const span: number[] = [];
  for (let m = 0; m < 16; m++) {
    let r = 0;
    for (let j = 0; j < 4; j++) if ((m >> j) & 1) r ^= lambda[j] ?? 0;
    span.push(r);
  }
  const sums = new Set<number>();
  for (const a of span) for (const b of sub) sums.add(a ^ b);
  return sums.size === 256;
}

export function renderTablePane(root: HTMLElement, onDiffed: (distance: number) => void): void {
  clear(root);

  let params: TklogParams = PI_PARAMS;
  let generated: number[] | null = null;
  const everMismatched = new Set<number>();

  // ---------------------------------------------------------------- intro --
  root.appendChild(
    el('section', { class: 'card card-intro' }, [
      el('h2', { text: 'An unexplained constant is still checkable' }),
      el('p', { class: 'lede' }, [
        'GOST published π as a plain list of 256 numbers, with no explanation of where they came ' +
          'from. For years that was the end of the conversation: a table is not an argument, and you ' +
          'cannot inspect a list.',
      ]),
      el('p', { class: 'lede' }, [
        'In 2019 Léo Perrin found that those 256 numbers fall out of four small constants and a ' +
          'few lines of finite-field arithmetic. The grid on the right below starts empty. Press ' +
          'Generate & Diff and it fills from those four constants alone — the code that fills it ' +
          'has never seen the published table. ',
        el('span', { class: 'src' }, [
          'Sources: the published table is ',
          cite('rfc7801', 'RFC 7801 §4.1'),
          ' and ',
          cite('rfc6986', 'RFC 6986 §6.2'),
          '; the structure is ',
          cite('tosc2019'),
          ', with the generator script in ',
          cite('faq', 'Perrin’s FAQ, §2.1.1'),
          '.',
        ]),
      ]),
    ]),
  );

  // ------------------------------------------------------------ A/B grids --
  const left = buildGrid('Published π — RFC 7801 §4.1', (i) => hex2(PI[i]));
  const right = buildGrid('Rebuilt from the four constants', () => '··');
  const diffVerdict = verdict('diff-verdict');
  const reuseVerdict = verdict('reuse-verdict');
  const missList = el('p', { class: 'note', id: 'miss-list' });

  diffVerdict.set('idle', '·', ['Not generated yet. The right-hand grid is empty.']);
  reuseVerdict.set('idle', '·', ['Not generated yet.']);

  function paintDiff(): void {
    if (generated === null) {
      right.cells.forEach((cell) => {
        cell.textContent = '··';
        cell.className = 'blank';
        cell.removeAttribute('aria-label');
      });
      missList.textContent = '';
      return;
    }
    const table = generated;
    const result = diffTables(table, PI);
    const missing = new Set(result.mismatches);
    result.mismatches.forEach((idx) => everMismatched.add(idx));

    right.cells.forEach((cell, idx) => {
      const isMiss = missing.has(idx);
      const wasMiss = !isMiss && everMismatched.has(idx);
      cell.textContent = hex2(table[idx]);
      cell.className = isMiss ? 'miss' : 'match';
      cell.setAttribute(
        'aria-label',
        `input ${hex2(idx)}: ${hex2(table[idx])}, ` +
          (isMiss
            ? `mismatch — published byte is ${hex2(PI[idx])}`
            : wasMiss
              ? 'matches now, mismatched earlier'
              : 'matches'),
      );
      clear(cell);
      cell.appendChild(document.createTextNode(hex2(table[idx])));
      if (isMiss) cell.appendChild(el('span', { class: 'mk', 'aria-hidden': 'true', text: '≠' }));
      else if (wasMiss) cell.appendChild(el('span', { class: 'mk', 'aria-hidden': 'true', text: '·' }));
    });

    const reuse = diffTables(table, PI_RFC6986);
    diffVerdict.set(result.equal ? 'pass' : 'fail', result.equal ? '✓' : '✕', [
      el('strong', { text: result.equal ? 'MATCH' : 'MISMATCH' }),
      ` — Hamming distance ${result.distance} of 256 against RFC 7801 §4.1.` +
        (result.equal ? ' Every one of the 256 bytes is identical.' : ''),
    ]);
    reuseVerdict.set(reuse.equal ? 'pass' : 'fail', reuse.equal ? '✓' : '✕', [
      el('strong', { text: reuse.equal ? 'MATCH' : 'MISMATCH' }),
      ` — Hamming distance ${reuse.distance} of 256 against the Streebog S-box, RFC 6986 §6.2. ` +
        'One generator, two standards.',
    ]);

    missList.textContent = result.equal
      ? everMismatched.size > 0
        ? `No mismatches now. ${everMismatched.size} cell(s) mismatched earlier in this session and stay marked with a dot.`
        : 'No mismatches.'
      : `Mismatching inputs (${result.mismatches.length}): ` +
        result.mismatches.slice(0, 48).map(hex2).join(', ') +
        (result.mismatches.length > 48 ? ', …' : '') +
        '.';
  }

  const genBtn = el('button', { class: 'act', type: 'button', id: 'generate-diff', text: 'Generate & Diff' });
  genBtn.addEventListener('click', () => {
    generated = generateTklog(params);
    paintDiff();
    refreshCoset();
    // Report the distance measured here, not a second computation in main.ts --
    // a caller that regenerates from the DEFAULT constants would report 0 while
    // the visitor is looking at a broken grid.
    onDiffed(diffTables(generated, PI).distance);
  });

  root.appendChild(
    el('section', { class: 'card' }, [
      el('h2', { text: 'Rebuild it, then diff it' }),
      el('div', { class: 'row' }, [genBtn]),
      el('div', { class: 'stack-gap' }, [diffVerdict.node, reuseVerdict.node]),
      missList,
      el('p', { class: 'src' }, [
        'The two tables these verdicts compare against are ',
        cite('rfc7801', 'RFC 7801 §4.1'),
        ' (Kuznyechik) and ',
        cite('rfc6986', 'RFC 6986 §6.2'),
        ' (Streebog). They are transcribed from the RFCs, not produced by this page. The structure ' +
          'being rebuilt is ',
        cite('tosc2019'),
        '.',
      ]),
      el('ul', { class: 'legend', role: 'list' }, [
        el('li', { role: 'listitem' }, [el('span', { class: 'swatch match', 'aria-hidden': 'true' }), 'match']),
        el('li', { role: 'listitem' }, [el('span', { class: 'swatch miss', 'aria-hidden': 'true' }), 'mismatch (marked ≠, and listed above)']),
      ]),
      el('div', { class: 'grid-wrap' }, [
        el('div', { class: 'grid-col' }, [scrollRegion('Published π lookup table', left.table)]),
        el('div', { class: 'grid-col' }, [scrollRegion('Rebuilt lookup table', right.table)]),
      ]),
      el('details', {}, [
        el('summary', { text: 'The defining equations' }),
        el('p', {}, [
          'A TKlog is ',
          el('strong', {
            text:
              'a discrete logarithm on F₂₈ composed with an integer-to-field map recovered by ' +
              'Perrin (2019) — not published by the designers.',
          }),
        ]),
        el('ul', {}, [
          el('li', { text: 'κ(x) = cstt ⊕ (XOR of λ[j] over the set bits j = 0..3 of x)' }),
          el('li', { text: 'π(0) = κ(0) = cstt' }),
          el('li', { text: 'for x ≠ 0, write ℓ = log_α(x) and split it: i = ℓ mod 17, j = ⌊ℓ / 17⌋' }),
          el('li', { text: 'if i = 0 (that is, 17 divides ℓ):  π(x) = κ(16 − j)' }),
          el('li', { text: 'otherwise:  π(x) = κ(16 − i) ⊕ (α¹⁷)^s[j]' }),
        ]),
        el('p', { class: 'note' }, [
          'The representation field is F₂[X]/(X⁸+X⁴+X³+X²+1) and α is its generator. That field is ' +
            'Perrin’s choice of representation, recovered along with the constants. GOST ' +
            'specified no field for π — it published a lookup table. ',
          el('span', { class: 'src' }, ['The equations above are ', cite('tosc2019'), ', §4.']),
        ]),
        el('p', { class: 'note' }, [
          'One subtlety the port has to get right: the multiplicative identity has two log ' +
            'representatives, 0 and 255. Only 255 reproduces the published table; with 0, π(1) ' +
            'collides with π(0) and the result is not a permutation.',
        ]),
      ]),
    ]),
  );

  // ------------------------------------------------------------ coset view --
  const cosetSelect = el(
    'select',
    { id: 'coset-select' },
    Array.from({ length: 17 }, (_, i) => el('option', { value: String(i), text: `coset ${i}` })),
  );
  const boxSelect = el('select', { id: 'box-select' }, [
    el('option', { value: 'pi', text: 'π — the published GOST S-box' }),
    el('option', { value: 'generated', text: 'π — your rebuilt version' }),
    el('option', { value: 'aes', text: 'AES S-box — the control' }),
  ]);

  const inGrid = buildGrid('Input space — pick a coset', (i) => hex2(i));
  const outGrid = buildGrid('Output space — where it lands', (i) => hex2(i));
  const cosetVerdict = verdict('coset-verdict');
  const cosetDetail = el('div', { class: 'stack-gap', id: 'coset-detail' });
  const tally = el('p', { class: 'note', id: 'space-tally' });

  function currentBox(): { key: BoxKey; table: number[]; field: LogTables; name: string } {
    const key = boxSelect.value as BoxKey;
    if (key === 'aes') return { key, table: AES, field: AES_FIELD, name: 'the AES S-box' };
    if (key === 'generated' && generated !== null)
      return { key, table: generated, field: TKLOG_FIELD, name: 'your rebuilt π' };
    return { key: 'pi', table: PI, field: TKLOG_FIELD, name: 'the published π' };
  }

  function refreshCoset(): void {
    const box = currentBox();
    if (boxSelect.value === 'generated' && generated === null) boxSelect.value = 'pi';
    const views = cosetViews(box.table, box.field);
    const view: CosetView = views[Number(cosetSelect.value)];
    const selected = new Set(view.inputs);
    const landed = new Set(view.outputs);

    inGrid.cells.forEach((cell, idx) => {
      const on = selected.has(idx);
      cell.className = on ? 'sel' : '';
      cell.setAttribute('aria-label', on ? `${hex2(idx)}, in the selected coset` : hex2(idx));
      clear(cell);
      cell.appendChild(document.createTextNode(hex2(idx)));
      if (on) cell.appendChild(el('span', { class: 'mk', 'aria-hidden': 'true', text: '▪' }));
    });
    outGrid.cells.forEach((cell, idx) => {
      const on = landed.has(idx);
      cell.className = on ? 'img' : '';
      cell.setAttribute('aria-label', on ? `${hex2(idx)}, in the landing set` : hex2(idx));
      clear(cell);
      cell.appendChild(document.createTextNode(hex2(idx)));
      if (on) cell.appendChild(el('span', { class: 'mk', 'aria-hidden': 'true', text: '▫' }));
    });

    const distinct = distinctSpaceCount(views);
    if (view.space === null) {
      cosetVerdict.set('fail', '✕', [
        el('strong', { text: 'NO COSET' }),
        ` — the 15 inputs of coset ${view.index} do not land on an additive coset of any ` +
          '4-dimensional space. The partition is gone.',
      ]);
    } else {
      cosetVerdict.set('pass', '✓', [
        el('strong', { text: 'ADDITIVE COSET' }),
        ` — the 15 inputs land exactly on { ${hex2(view.offset ?? 0)} ⊕ w } for w in a ` +
          `4-dimensional space${view.spaceIsSubfield ? ', and that space is the subfield F₁₆ itself' : ''}.`,
      ]);
    }

    clear(cosetDetail);
    cosetDetail.appendChild(
      el('div', {}, [
        el('h4', { text: `The 15 inputs of coset ${view.index}` }),
        chipList(view.inputs, 'is-sel'),
      ]),
    );
    cosetDetail.appendChild(
      el('div', {}, [el('h4', { text: 'Where they land' }), chipList(view.outputs, 'is-space')]),
    );
    if (view.space) {
      cosetDetail.appendChild(
        el('div', {}, [
          el('h4', { text: `The 4-dimensional space W behind that landing set (offset ${hex2(view.offset ?? 0)})` }),
          chipList(view.space, 'is-space'),
        ]),
      );
    }

    tally.textContent =
      `Across all 17 cosets, ${box.name} uses ${distinct} distinct landing space` +
      (distinct === 1 ? '' : 's') +
      '. ' +
      (distinct <= 2
        ? 'Few spaces means the landing sets are parallel slices of one and the same subspace — a partition.'
        : 'Seventeen different spaces means the landing sets line up with nothing; there is no partition here.');
  }

  cosetSelect.addEventListener('change', refreshCoset);
  boxSelect.addEventListener('change', refreshCoset);

  root.appendChild(
    el('section', { class: 'card' }, [
      el('h2', { text: 'Where the cosets land' }),
      el('p', { class: 'lede' }, [
        'The 255 non-zero inputs split into 17 groups of 15 — the multiplicative cosets of the ' +
          'small subfield F₁₆ sitting inside F₂₈. Pick one group on the left and ' +
          'watch where its 15 members land on the right. Then switch the box to AES and do it again.',
      ]),
      el('div', { class: 'row' }, [
        el('label', { for: 'box-select' }, ['Box under inspection', boxSelect]),
        el('label', { for: 'coset-select' }, ['Coset', cosetSelect]),
      ]),
      cosetVerdict.node,
      tally,
      el('ul', { class: 'legend', role: 'list' }, [
        el('li', { role: 'listitem' }, [el('span', { class: 'swatch sel', 'aria-hidden': 'true' }), 'selected coset (input side, marked ▪)']),
        el('li', { role: 'listitem' }, [el('span', { class: 'swatch img', 'aria-hidden': 'true' }), 'its landing set (output side, marked ▫)']),
      ]),
      el('div', { class: 'grid-wrap' }, [
        el('div', { class: 'grid-col' }, [scrollRegion('Input space, one coset selected', inGrid.table)]),
        el('div', { class: 'grid-col' }, [scrollRegion('Output space, landing set marked', outGrid.table)]),
      ]),
      cosetDetail,
      el('details', {}, [
        el('summary', { text: 'Why the AES comparison is not simply “AES has no structure”' }),
        el('p', {}, [
          'Every one of AES’s 17 cosets also lands on an additive coset of some 4-dimensional ' +
            'space, and for a dull reason: a multiplicative coset of F*₁₆ already is a ' +
            '4-dimensional subspace with zero removed, inversion permutes those, and the AES affine ' +
            'layer is linear over GF(2). A lab that only tested “does it land on a coset?” would ' +
            'report a contrast that is not there.',
        ]),
        el('p', {}, [
          'The difference is how many DISTINCT spaces the 17 landing sets use. π uses two: ' +
            'sixteen cosets land on parallel slices of the subfield F₁₆ itself, and those ' +
            'sixteen slices tile the whole output. AES uses seventeen different spaces, which tile ' +
            'nothing. Only the first is a partition. The tally above is that count.',
        ]),
        el('p', {}, [
          'The exception on the π side is coset 0 — the a = 1 coset, the subfield’s own ' +
            'multiplicative group. It lands on a coset of the span of the λ vectors instead, and ' +
            'the f ⊕ g split does not hold there. The selector shows it as coset 0; it is not ' +
            'uniform with the other sixteen and the exhibit does not pretend otherwise.',
        ]),
        el('p', { class: 'note' }, [
          'AES’s S-box is S(0) = b and S(x) = A·x⁻¹ ⊕ b for x ≠ 0, with A ' +
            'a fixed GF(2)-affine map and b = 0x63 — both halves published in ',
          cite('fips197', 'FIPS 197, §5.1.1'),
          '. The contrast is not that AES is structureless. It is that AES’s structure was ' +
            'stated by its designers, and π’s was recovered from the table twenty years later.',
        ]),
      ]),
    ]),
  );

  // --------------------------------------------------------- break it (D) --
  const sInput = el('input', { type: 'text', id: 'in-s', value: PI_PARAMS.s.join(', '), size: '34' }) as HTMLInputElement;
  const lamInputs = PI_PARAMS.lambda.map(
    (v, idx) => el('input', { type: 'text', id: `in-lam-${idx}`, value: hex2(v), size: '4' }) as HTMLInputElement,
  );
  const csttInput = el('input', { type: 'text', id: 'in-cstt', value: hex2(PI_PARAMS.cstt), size: '4' }) as HTMLInputElement;
  const constraintMsg = el('p', { class: 'field-msg', id: 'constraint-msg', role: 'status', 'aria-live': 'polite' });

  function readParams(): void {
    const s = parseSList(sInput.value) ?? [];
    const lambda = lamInputs.map((i) => parseByte(i.value) ?? 0);
    const cstt = parseByte(csttInput.value) ?? 0;
    sInput.setAttribute('aria-invalid', parseSList(sInput.value) === null ? 'true' : 'false');
    lamInputs.forEach((i) => i.setAttribute('aria-invalid', parseByte(i.value) === null ? 'true' : 'false'));
    csttInput.setAttribute('aria-invalid', parseByte(csttInput.value) === null ? 'true' : 'false');

    params = { s, lambda, cstt };
    const problems: string[] = [];
    if (!isPermutation0to14(s)) problems.push('s is no longer a permutation of 0..14');
    if (!spans4(lambda)) problems.push('the four λ vectors no longer span a 4-dimensional space');
    else if (!complementsSubfield(lambda, TKLOG_FIELD))
      problems.push('the λ span no longer covers the whole field together with the subfield');
    constraintMsg.textContent = problems.length
      ? `Constraint broken: ${problems.join('; ')}. The generator still runs and still produces 256 bytes — it just stops reproducing π.`
      : '';

    if (generated !== null) {
      generated = generateTklog(params);
      paintDiff();
      refreshCoset();
      onDiffed(diffTables(generated, PI).distance);
    }
  }

  [sInput, ...lamInputs, csttInput].forEach((input) => input.addEventListener('input', readParams));

  const resetBtn = el('button', { class: 'act ghost', type: 'button', id: 'reset-constants', text: "Reset to Perrin's constants" });
  resetBtn.addEventListener('click', () => {
    sInput.value = PI_PARAMS.s.join(', ');
    lamInputs.forEach((input, idx) => (input.value = hex2(PI_PARAMS.lambda[idx])));
    csttInput.value = hex2(PI_PARAMS.cstt);
    everMismatched.clear();
    readParams();
  });

  const breakBtn = el('button', { class: 'act ghost', type: 'button', id: 'break-one-bit', text: 'Flip one bit of λ₀' });
  breakBtn.addEventListener('click', () => {
    const current = parseByte(lamInputs[0].value) ?? 0;
    lamInputs[0].value = hex2(current ^ 0x01);
    readParams();
  });

  root.appendChild(
    el('section', { class: 'card' }, [
      el('h2', { text: 'Break it yourself' }),
      el('p', { class: 'lede' }, [
        'Change any of the four constants and the rebuilt grid diverges live. Nothing here is ' +
          'simulated: the same generator runs, on your numbers.',
      ]),
      el('div', { class: 'const-grid' }, [
        el('label', { for: 'in-s' }, ['s — a permutation of 0..14', sInput]),
        el('label', { for: 'in-lam-0' }, ['λ₀ (hex)', lamInputs[0]]),
        el('label', { for: 'in-lam-1' }, ['λ₁ (hex)', lamInputs[1]]),
        el('label', { for: 'in-lam-2' }, ['λ₂ (hex)', lamInputs[2]]),
        el('label', { for: 'in-lam-3' }, ['λ₃ (hex)', lamInputs[3]]),
        el('label', { for: 'in-cstt' }, ['cstt (hex)', csttInput]),
      ]),
      constraintMsg,
      el('div', { class: 'row' }, [breakBtn, resetBtn]),
      el('p', { class: 'note' }, [
        'The constraints: s has to stay a permutation of {0..14}, and the four λ vectors have to span ' +
          'a 4-dimensional space which, together with the subfield, spans the whole field. Break ' +
          'either and the generator still produces 256 bytes — they are just not π any more. Switch ' +
          'the coset selector above to “your rebuilt version” to watch the partition go with it.',
      ]),
    ]),
  );

  paintDiff();
  refreshCoset();
}
