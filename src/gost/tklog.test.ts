import { describe, it, expect } from 'vitest';
import { generateTklog, kappa, tklogStep, PI_PARAMS, TKLOG_FIELD, type TklogParams } from './tklog';
import { PI_RFC7801, PI_RFC6986 } from './reference';
import { diffTables, isPermutation } from './diff';
import { POLY_TKLOG, subfield16 } from './field';

describe('INV-2 -- the generator reproduces pi exactly', () => {
  const generated = generateTklog();

  it('tklog(i) === pi[i] for all 256 i', () => {
    for (let i = 0; i < 256; i++) expect(generated[i]).toBe(PI_RFC7801[i]);
  });

  it('Hamming distance is strictly 0, not "all but one"', () => {
    expect(diffTables(generated, PI_RFC7801).distance).toBe(0);
  });

  it('and the result is a permutation', () => {
    expect(isPermutation(generated)).toBe(true);
  });
});

describe('INV-3 -- one generator, two standards', () => {
  it('the same generated array equals the RFC 6986 Streebog S-box byte for byte', () => {
    expect(diffTables(generateTklog(), PI_RFC6986).distance).toBe(0);
  });

  it('which is only interesting because the two RFCs print the same table', () => {
    expect(diffTables([...PI_RFC7801], PI_RFC6986).equal).toBe(true);
  });
});

describe('INV-4 -- the mutation gate', () => {
  const broken = (p: Partial<TklogParams>): TklogParams => ({ ...PI_PARAMS, ...p });
  const fails = (p: TklogParams) =>
    diffTables(generateTklog(p), PI_RFC7801).distance > 0 &&
    diffTables(generateTklog(p), PI_RFC6986).distance > 0;

  it('perturbing any one entry of s breaks both INV-2 and INV-3', () => {
    for (let idx = 0; idx < PI_PARAMS.s.length; idx++) {
      const s = [...PI_PARAMS.s];
      s[idx] = (s[idx] + 1) % 15;
      expect(fails(broken({ s })), `s[${idx}] perturbed`).toBe(true);
    }
  });

  it('perturbing any one lambda vector breaks both', () => {
    for (let idx = 0; idx < PI_PARAMS.lambda.length; idx++) {
      const lambda = [...PI_PARAMS.lambda];
      lambda[idx] ^= 1;
      expect(fails(broken({ lambda })), `lambda[${idx}] perturbed`).toBe(true);
    }
  });

  it('perturbing cstt breaks both', () => {
    expect(fails(broken({ cstt: PI_PARAMS.cstt ^ 1 }))).toBe(true);
  });

  it('every single-bit flip in any lambda vector breaks it', () => {
    for (let idx = 0; idx < 4; idx++) {
      for (let bit = 0; bit < 8; bit++) {
        const lambda = [...PI_PARAMS.lambda];
        lambda[idx] ^= 1 << bit;
        expect(fails(broken({ lambda })), `lambda[${idx}] bit ${bit}`).toBe(true);
      }
    }
  });
});

describe('the four recovered constants', () => {
  it('s is a permutation of 0..14', () => {
    expect([...PI_PARAMS.s].sort((a, b) => a - b)).toEqual([...Array(15).keys()]);
  });

  it('the lambda vectors span a 4-dimensional GF(2) space', () => {
    const span = new Set([0]);
    for (let m = 0; m < 16; m++) {
      let r = 0;
      for (let j = 0; j < 4; j++) if ((m >> j) & 1) r ^= PI_PARAMS.lambda[j];
      span.add(r);
    }
    expect(span.size).toBe(16);
  });

  it('that space meets the subfield only at 0, and together they span the field', () => {
    const subfield = new Set(subfield16(TKLOG_FIELD));
    const span: number[] = [];
    for (let m = 0; m < 16; m++) {
      let r = 0;
      for (let j = 0; j < 4; j++) if ((m >> j) & 1) r ^= PI_PARAMS.lambda[j];
      span.push(r);
    }
    expect(span.filter((v) => subfield.has(v))).toEqual([0]);
    const sums = new Set<number>();
    for (const a of span) for (const b of subfield) sums.add(a ^ b);
    expect(sums.size).toBe(256);
  });

  it('uses Perrin representation field 0x11D, with X as the generator', () => {
    expect(TKLOG_FIELD.modulus).toBe(POLY_TKLOG);
    expect(TKLOG_FIELD.modulus).toBe(0x11d);
    expect(TKLOG_FIELD.generator).toBe(0x02);
  });
});

describe('edge cases (brief 1.6)', () => {
  it('pi(0) = cstt = 0xFC -- the free cross-check, wired as an assertion', () => {
    expect(kappa(0, PI_PARAMS)).toBe(PI_PARAMS.cstt);
    expect(tklogStep(0, PI_PARAMS).value).toBe(PI_RFC7801[0]);
    expect(PI_RFC7801[0]).toBe(0xfc);
  });

  it('the identity element takes log 255, not 0', () => {
    expect(TKLOG_FIELD.log[1]).toBe(255);
    expect(TKLOG_FIELD.log[0]).toBe(-1);
  });

  it('and with log(1) = 0 instead, pi(1) would collide with pi(0)', () => {
    // The whole point of PORT NOTE 1, executed rather than asserted.
    const wrongL = 0;
    const i = wrongL % 17;
    const j = Math.floor(wrongL / 17);
    expect(i).toBe(0);
    expect(kappa(16 - j, PI_PARAMS)).toBe(PI_RFC7801[0]); // 0xFC -- a collision
    expect(tklogStep(1, PI_PARAMS).value).toBe(PI_RFC7801[1]); // 0xEE -- the real value
    expect(PI_RFC7801[1]).not.toBe(PI_RFC7801[0]);
  });

  it('kappa is only ever handed an argument inside its 4-bit domain', () => {
    for (let x = 0; x < 256; x++) {
      const step = tklogStep(x, PI_PARAMS);
      const arg = step.branch === 'zero' ? 0 : step.branch === 'subgroup' ? 16 - step.j : 16 - step.i;
      expect(arg, `x=${x}`).toBeGreaterThanOrEqual(0);
      expect(arg, `x=${x}`).toBeLessThanOrEqual(15);
    }
  });

  it('the subgroup branch (17 | l) covers exactly the order-15 subgroup', () => {
    const viaBranch: number[] = [];
    for (let x = 1; x < 256; x++) if (tklogStep(x, PI_PARAMS).branch === 'subgroup') viaBranch.push(x);
    expect(viaBranch.length).toBe(15);
    const subgroup = subfield16(TKLOG_FIELD).filter((v) => v !== 0);
    expect(viaBranch.sort((a, b) => a - b)).toEqual([...subgroup].sort((a, b) => a - b));
  });

  it('the general branch never indexes s out of range', () => {
    for (let x = 1; x < 256; x++) {
      const step = tklogStep(x, PI_PARAMS);
      if (step.branch === 'general') expect(step.j).toBeLessThan(PI_PARAMS.s.length);
    }
  });

  it('a visitor turning s into a non-permutation still produces output, and still fails', () => {
    const p = { ...PI_PARAMS, s: [...PI_PARAMS.s].fill(0) };
    const out = generateTklog(p);
    expect(out).toHaveLength(256);
    expect(out.every((v) => Number.isInteger(v) && v >= 0 && v < 256)).toBe(true);
    expect(diffTables(out, PI_RFC7801).distance).toBeGreaterThan(0);
    expect(isPermutation(out)).toBe(false);
  });

  it('a visitor truncating s does not throw either', () => {
    const out = generateTklog({ ...PI_PARAMS, s: [0, 1] });
    expect(out).toHaveLength(256);
    expect(diffTables(out, PI_RFC7801).distance).toBeGreaterThan(0);
  });
});
