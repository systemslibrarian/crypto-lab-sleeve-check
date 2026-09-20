import { describe, it, expect } from 'vitest';
import { aesAffine, aesInverse, aesSbox, generateAesSbox, AES_FIELD, AES_SBOX_SPOT_CHECKS } from './aes';
import { isPermutation } from './diff';
import { gfMul, POLY_AES } from './field';

describe('the AES S-box, built from FIPS 197 rather than pasted', () => {
  it('matches the published lookup table at the spot checks', () => {
    for (const [x, want] of AES_SBOX_SPOT_CHECKS) expect(aesSbox(x)).toBe(want);
  });

  it('is a permutation', () => {
    expect(isPermutation(generateAesSbox())).toBe(true);
  });

  it('S(0) is the affine constant alone, because inversion fixes 0', () => {
    expect(aesInverse(0)).toBe(0);
    expect(aesSbox(0)).toBe(0x63);
  });

  it('the inversion half really inverts', () => {
    for (let x = 1; x < 256; x++) expect(gfMul(x, aesInverse(x), POLY_AES)).toBe(1);
  });

  it('the affine half is affine: A(x) XOR A(y) XOR A(0) = A(x XOR y)', () => {
    for (let x = 0; x < 256; x += 5)
      for (let y = 0; y < 256; y += 7)
        expect(aesAffine(x) ^ aesAffine(y) ^ aesAffine(0)).toBe(aesAffine(x ^ y));
  });

  it('uses its own field and its own generator', () => {
    expect(AES_FIELD.modulus).toBe(0x11b);
    expect(AES_FIELD.generator).toBe(0x03);
  });
});
