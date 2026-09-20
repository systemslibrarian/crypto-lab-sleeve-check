/**
 * Pane 1 -- The Cipher.
 *
 * Purpose (brief 1.1): prove the implementation is standard-compliant before
 * the exhibit dissects it. One LSX round stepped X[K_i] -> S -> L, then the full
 * encrypt and decrypt run against the pinned RFC 7801 Section 5 fixture.
 */

import {
  blockFromHex,
  blockToHex,
  decryptBlock,
  encryptBlock,
  keyFromHex,
  keySchedule,
  traceRound,
  type Block,
} from '../gost/kuznyechik';
import * as V from '../gost/vectors';
import { clear, el, hex2, verdict } from './dom';

const STAGES = ['state', 'afterX', 'afterS', 'afterL'] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABEL: Record<Stage, string> = {
  state: 'input state',
  afterX: 'after X[K_i] — XOR the round key',
  afterS: 'after S — π applied to all 16 bytes',
  afterL: 'after L — 16 rounds of the field-Q shift register',
};

/**
 * 16 bytes as a 4x4 of hex cells; changed bytes get a mark, not just a colour.
 *
 * The cells are list items rather than bare divs. `aria-label` is PROHIBITED on
 * an element with no role, so a role-less div carrying one has its name
 * silently discarded -- axe files that under `incomplete`, never `violations`,
 * which is why the gate asserts that bucket too.
 */
function blockGrid(bytes: Block, previous: Block | null, label: string): HTMLElement {
  const cells = Array.from(bytes, (v, idx) => {
    const changed = previous !== null && previous[idx] !== v;
    return el(
      'div',
      {
        class: `block-cell${changed ? ' changed' : ''}`,
        role: 'listitem',
        'aria-label': `byte ${idx}: ${hex2(v)}${changed ? ', changed' : ''}`,
      },
      [hex2(v), changed ? el('span', { class: 'chg', 'aria-hidden': 'true', text: 'changed' }) : null],
    );
  });
  return el('div', { class: 'block-grid', role: 'list', 'aria-label': label }, cells);
}

export function renderCipherPane(root: HTMLElement, onVerified: () => void): void {
  clear(root);

  root.appendChild(
    el('section', { class: 'card card-intro' }, [
      el('h2', { text: 'What is happening here' }),
      el('p', { class: 'lede' }, [
        'Kuznyechik is the Russian Federation’s standard block cipher (GOST R 34.12-2015). ' +
          'It scrambles a 16-byte block with nine identical rounds. Each round does three things in ' +
          'order: XOR in a round key, replace every byte using one fixed 256-entry lookup table ' +
          'called π, then stir the bytes together with a linear mixing step. A tenth key XOR ' +
          'finishes it.',
      ]),
      el('p', { class: 'lede' }, [
        'That lookup table π is what the rest of this lab is about. Before taking it apart, this ' +
          'pane checks that the implementation here is the real, standard one — by running the ' +
          'worked examples printed in RFC 7801 Section 5 and comparing byte for byte.',
      ]),
    ]),
  );

  // ---- step control -------------------------------------------------------
  const roundKeys = keySchedule(keyFromHex(V.TEST_KEY));
  let roundIndex = 0;
  let stage = 0;

  const stageHost = el('div', { class: 'stage-flow' });
  const stageCaption = el('p', { class: 'note', id: 'step-caption' });

  function trace() {
    return traceRound(roundKeys[roundIndex], blockFromHex(V.TEST_PLAINTEXT));
  }

  function drawSteps(): void {
    const t = trace();
    const frames: Array<{ stage: Stage; bytes: Block; prev: Block | null }> = [
      { stage: 'state', bytes: t.input, prev: null },
      { stage: 'afterX', bytes: t.afterX, prev: t.input },
      { stage: 'afterS', bytes: t.afterS, prev: t.afterX },
      { stage: 'afterL', bytes: t.afterL, prev: t.afterS },
    ];
    clear(stageHost);
    frames.slice(0, stage + 1).forEach((frame, idx) => {
      const label = STAGE_LABEL[frame.stage].replace('K_i', `K_${roundIndex + 1}`);
      stageHost.appendChild(
        el('div', { class: `stage${idx === stage ? ' is-current' : ''}` }, [
          el('p', { class: 'stage-label', text: `${idx === stage ? '▸ ' : '  '}${label}` }),
          blockGrid(frame.bytes, frame.prev, label),
        ]),
      );
    });
    const names = ['the block as it arrives', 'X', 'S', 'L'];
    stageCaption.textContent =
      stage === 0
        ? `Round ${roundIndex + 1} of 9. Showing ${names[0]}. Press Step to apply X[K_${roundIndex + 1}].`
        : `Round ${roundIndex + 1} of 9, after ${names[stage]}. ` +
          (stage === 3
            ? 'That is one complete LSX round. Nine of these, then a final key XOR, is the whole cipher.'
            : `Press Step to apply ${names[stage + 1]}.`);
    stepBtn.disabled = stage === 3;
  }

  const stepBtn = el('button', { class: 'act', type: 'button', text: 'Step' });
  const resetBtn = el('button', { class: 'act ghost', type: 'button', text: 'Reset round' });
  const roundSelect = el(
    'select',
    { id: 'round-select' },
    Array.from({ length: 9 }, (_, i) => el('option', { value: String(i), text: `Round ${i + 1}` })),
  );

  stepBtn.addEventListener('click', () => {
    if (stage < 3) stage += 1;
    drawSteps();
  });
  resetBtn.addEventListener('click', () => {
    stage = 0;
    drawSteps();
  });
  roundSelect.addEventListener('change', () => {
    roundIndex = Number(roundSelect.value);
    stage = 0;
    drawSteps();
  });

  root.appendChild(
    el('section', { class: 'card' }, [
      el('h2', { text: 'One round, stepped' }),
      el('p', { class: 'note' }, [
        'The plaintext is the one RFC 7801 Section 5.5 uses. Bytes that changed at each step are ' +
          'marked. Blocks are printed the way the RFC prints them: leftmost cell is a₁₅.',
      ]),
      el('div', { class: 'row' }, [
        el('label', { for: 'round-select' }, ['Round key', roundSelect]),
        stepBtn,
        resetBtn,
      ]),
      stageCaption,
      stageHost,
    ]),
  );

  // ---- full-vector run ----------------------------------------------------
  const encVerdict = verdict('kat-encrypt');
  const decVerdict = verdict('kat-decrypt');
  const traceHost = el('div', { id: 'kat-trace' });

  encVerdict.set('idle', '·', ['Not run yet. Press Run the RFC 7801 vectors.']);
  decVerdict.set('idle', '·', ['Not run yet.']);

  const runBtn = el('button', { class: 'act', type: 'button', id: 'run-kat', text: 'Run the RFC 7801 vectors' });

  runBtn.addEventListener('click', () => {
    const key = keyFromHex(V.TEST_KEY);
    const pt = blockFromHex(V.TEST_PLAINTEXT);
    const ct = blockToHex(encryptBlock(key, pt));
    const back = blockToHex(decryptBlock(key, blockFromHex(V.TEST_CIPHERTEXT)));
    const encOk = ct === V.TEST_CIPHERTEXT;
    const decOk = back === V.TEST_PLAINTEXT;

    encVerdict.set(encOk ? 'pass' : 'fail', encOk ? '✓' : '✕', [
      el('strong', { text: encOk ? 'PASS' : 'FAIL' }),
      ` — encrypt produced ${ct}; RFC 7801 §5.5 prints ${V.TEST_CIPHERTEXT}.`,
    ]);
    decVerdict.set(decOk ? 'pass' : 'fail', decOk ? '✓' : '✕', [
      el('strong', { text: decOk ? 'PASS' : 'FAIL' }),
      ` — decrypt recovered ${back}; RFC 7801 §5.6 prints ${V.TEST_PLAINTEXT}. ` +
        'The decrypt path runs inverse S and inverse L against the same fixture.',
    ]);

    clear(traceHost);
    if (encOk && decOk) {
      const rows = V.ENCRYPT_TRACE.map((want, idx) =>
        el('li', {}, [
          el('span', { class: 'mono', text: idx < 9 ? `LSX[K_${idx + 1}]` : 'X[K_10]' }),
          ' → ',
          el('span', { class: 'mono', text: want }),
        ]),
      );
      traceHost.appendChild(
        el('details', {}, [
          el('summary', { text: 'All ten intermediate states, as RFC 7801 §5.5 prints them' }),
          el('p', {}, [
            'Nine LSX rounds plus a closing X[K₁₀], on ten round keys — not ten full rounds.',
          ]),
          el('ul', { class: 'chips', role: 'list' }, rows),
        ]),
      );
      onVerified();
    }
  });

  root.appendChild(
    el('section', { class: 'card' }, [
      el('h2', { text: 'The whole cipher, against the published vectors' }),
      el('p', { class: 'note' }, [
        'Nine LSX rounds and a final key XOR, run against the key, plaintext and ciphertext printed ' +
          'in RFC 7801 §5.4–§5.6. Those values are pinned as fixtures; they are not produced by ' +
          'this code. Passing here is what unlocks pane 2.',
      ]),
      el('div', { class: 'row' }, [runBtn]),
      el('div', { class: 'stack-gap' }, [encVerdict.node, decVerdict.node]),
      traceHost,
    ]),
  );

  root.appendChild(
    el('section', { class: 'card' }, [
      el('h3', { text: 'What this pane does not claim' }),
      el('p', { class: 'note' }, [
        'Matching the RFC vectors shows this implementation agrees with the standard. It says nothing ' +
          'about whether the standard is a good one — that question is what panes 2 and 3 are for. ' +
          'This is a teaching demo, not production cryptography.',
      ]),
    ]),
  );

  drawSteps();
}
