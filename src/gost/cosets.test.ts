import { describe, it, expect } from 'vitest';
import { additiveCosetOf, cosetViews, distinctSpaceCount, tilesOutputSpace } from './cosets';
import { generateTklog, PI_PARAMS, TKLOG_FIELD } from './tklog';
import { PI_RFC7801 } from './reference';
import { generateAesSbox, AES_FIELD } from './aes';
import { subfield16 } from './field';

const PI = [...PI_RFC7801];
const piViews = cosetViews(PI, TKLOG_FIELD);

describe('the 17 multiplicative cosets', () => {
  it('partition the 255 non-zero inputs into 15s', () => {
    expect(piViews).toHaveLength(17);
    expect(piViews.every((v) => v.inputs.length === 15)).toBe(true);
    expect(new Set(piViews.flatMap((v) => v.inputs)).size).toBe(255);
  });

  it('coset 0 is exactly the order-15 subgroup', () => {
    const subgroup = subfield16(TKLOG_FIELD).filter((v) => v !== 0).sort((a, b) => a - b);
    expect(piViews[0].inputs).toEqual(subgroup);
  });
});

describe('where pi sends them -- the headline mechanism', () => {
  it('every coset lands on an additive coset of a 4-dimensional space', () => {
    expect(piViews.every((v) => v.space !== null && v.space.length === 16)).toBe(true);
  });

  it('sixteen of the seventeen land on the subfield F_16 itself', () => {
    expect(piViews.filter((v) => v.spaceIsSubfield)).toHaveLength(16);
  });

  it('the exception is coset 0, the a = 1 coset (brief 1.6)', () => {
    expect(piViews[0].spaceIsSubfield).toBe(false);
    expect(piViews.filter((v) => !v.spaceIsSubfield).map((v) => v.index)).toEqual([0]);
  });

  it('its space is the span of the lambda vectors, not the subfield', () => {
    const span = new Set([0]);
    for (let m = 0; m < 16; m++) {
      let r = 0;
      for (let j = 0; j < 4; j++) if ((m >> j) & 1) r ^= PI_PARAMS.lambda[j];
      span.add(r);
    }
    expect(piViews[0].space).toEqual([...span].sort((a, b) => a - b));
    expect(piViews[0].offset).toBe(PI_PARAMS.cstt);
  });

  it('the sixteen offsets are distinct, and the landing sets tile every output', () => {
    const offs = piViews.slice(1).map((v) => v.offset);
    expect(new Set(offs).size).toBe(16);
    expect(tilesOutputSpace(piViews, PI)).toBe(true);
  });

  it('pi uses 2 distinct landing spaces across all 17 cosets', () => {
    expect(distinctSpaceCount(piViews)).toBe(2);
  });
});

describe('the AES control', () => {
  const AES = generateAesSbox();
  const aesViews = cosetViews(AES, AES_FIELD);

  it('also sends every coset to an additive coset -- the naive test does NOT separate them', () => {
    // Recorded on purpose: a lab that only checked this would claim a contrast
    // that is not there. A multiplicative coset of F*_16 is already a 4-dim
    // subspace minus 0, inversion permutes those, and AES's affine layer is
    // GF(2)-linear -- so AES passes the naive test too.
    expect(aesViews.every((v) => v.space !== null)).toBe(true);
  });

  it('but uses 17 distinct landing spaces, where pi uses 2', () => {
    expect(distinctSpaceCount(aesViews)).toBe(17);
    expect(distinctSpaceCount(piViews)).toBe(2);
  });

  it('and none of its landing spaces is the subfield', () => {
    expect(aesViews.filter((v) => v.spaceIsSubfield)).toHaveLength(0);
  });

  it('so AES has no shared partition -- which is the whole contrast', () => {
    const piShared = Math.max(...countBy(piViews.map((v) => v.spaceId)));
    const aesShared = Math.max(...countBy(aesViews.map((v) => v.spaceId)));
    expect(piShared).toBe(16);
    expect(aesShared).toBe(1);
  });
});

function countBy(ids: (string | null)[]): number[] {
  const m = new Map<string, number>();
  for (const id of ids) if (id) m.set(id, (m.get(id) ?? 0) + 1);
  return [...m.values()];
}

describe('a broken box', () => {
  it('a random permutation lands on no additive cosets at all', () => {
    // Deterministic shuffle so the test does not flake.
    const box = [...Array(256).keys()];
    let seed = 12345;
    for (let i = 255; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = seed % (i + 1);
      [box[i], box[j]] = [box[j], box[i]];
    }
    expect(cosetViews(box, TKLOG_FIELD).filter((v) => v.space !== null)).toHaveLength(0);
  });

  it('a visitor-broken generator stops partitioning, without throwing', () => {
    const broken = generateTklog({ ...PI_PARAMS, cstt: PI_PARAMS.cstt ^ 0x0f });
    const views = cosetViews(broken, TKLOG_FIELD);
    expect(views).toHaveLength(17);
    expect(distinctSpaceCount(views)).toBeGreaterThanOrEqual(1);
  });

  it('a collapsed s makes the landing sets too small to be cosets', () => {
    const broken = generateTklog({ ...PI_PARAMS, s: new Array(15).fill(0) });
    const views = cosetViews(broken, TKLOG_FIELD);
    expect(views.some((v) => v.outputs.length < 15)).toBe(true);
    expect(views.some((v) => v.space === null)).toBe(true);
  });
});

describe('additiveCosetOf', () => {
  it('rejects a set of the wrong size', () => {
    expect(additiveCosetOf([1, 2, 3])).toBeNull();
  });

  it('rejects 15 values whose difference set is not closed under XOR', () => {
    // Difference set has 15 entries, which is not a power of two, so it cannot
    // be a subspace -- this is the path the deleted size check duplicated.
    expect(additiveCosetOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16])).toBeNull();
  });

  it('rejects a difference set that IS a subspace but of the wrong dimension', () => {
    // 15 values whose pairwise XORs span a FIVE-dimensional space (32 elements),
    // so `isSubspace` passes and the definition check at the end is the only
    // thing that rejects them. This is the second half of what the deleted
    // size check duplicated.
    const fiveDim = [20, 30, 4, 12, 31, 1, 2, 17, 3, 11, 18, 26, 16, 6, 27];
    const diffs = new Set(fiveDim.flatMap((a) => fiveDim.map((b) => a ^ b)));
    expect(diffs.size, 'the fixture really is 5-dimensional').toBe(32);
    expect(additiveCosetOf(fiveDim.map((v) => 0xa0 ^ v))).toBeNull();
  });

  it('recovers offset and space from a set it built itself', () => {
    const space = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const offset = 0xa0;
    const outputs = space.filter((w) => w !== 0).map((w) => offset ^ w);
    const found = additiveCosetOf(outputs);
    expect(found?.offset).toBe(offset);
    expect(found?.space).toEqual(space);
  });
});
