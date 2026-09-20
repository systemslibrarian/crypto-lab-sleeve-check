import { describe, it, expect } from 'vitest';
import { PI_RFC7801, PI_RFC6986, PI_INV_RFC7801 } from './reference';
import { isPermutation } from './diff';

describe('the transcribed RFC tables', () => {
  it('each holds 256 entries', () => {
    expect(PI_RFC7801).toHaveLength(256);
    expect(PI_RFC6986).toHaveLength(256);
    expect(PI_INV_RFC7801).toHaveLength(256);
  });

  it('pi and pi^-1 are both permutations of 0..255', () => {
    expect(isPermutation([...PI_RFC7801])).toBe(true);
    expect(isPermutation([...PI_INV_RFC7801])).toBe(true);
  });

  it('pi^-1 really inverts pi in both directions', () => {
    for (let x = 0; x < 256; x++) {
      expect(PI_INV_RFC7801[PI_RFC7801[x]]).toBe(x);
      expect(PI_RFC7801[PI_INV_RFC7801[x]]).toBe(x);
    }
  });

  it('RFC 7801 Section 4.1 and RFC 6986 Section 6.2 print the same table', () => {
    expect([...PI_RFC6986]).toEqual([...PI_RFC7801]);
  });

  it('opens and closes on the bytes both RFCs print', () => {
    // RFC 7801 Section 4.1 / RFC 6986 Section 6.2, first and last four entries.
    expect(PI_RFC7801.slice(0, 4)).toEqual([252, 238, 221, 17]);
    expect(PI_RFC7801.slice(252)).toEqual([57, 75, 99, 182]);
    expect(PI_RFC6986.slice(0, 4)).toEqual([252, 238, 221, 17]);
    expect(PI_RFC6986.slice(252)).toEqual([57, 75, 99, 182]);
  });
});
