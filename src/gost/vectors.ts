/**
 * RFC 7801 Section 5 "Examples (Informative)", pinned as fixtures.
 *
 * INV-1. These are the acceptance test for the cipher. They are transcribed from
 * the RFC text, not produced by this implementation -- a fixture a lab generated
 * from its own code proves only that the code agrees with itself.
 *
 * Note for anyone chasing a citation: RFC 7801 has no Appendix A. Its body runs
 * 4.1 Nonlinear Bijection, 4.2 Linear Transformation, 4.3 Transformations,
 * 4.4 Key Schedule, 4.5 Basic Encryption Algorithm, 5 Examples (Informative).
 * The vectors are in Section 5.
 */

/** Section 5.1 -- S applied four times in succession. */
export const S_CHAIN: readonly string[] = [
  'ffeeddccbbaa99881122334455667700',
  'b66cd8887d38e8d77765aeea0c9a7efc',
  '559d8dd7bd06cbfe7e7b262523280d39',
  '0c3322fed531e4630d80ef5c5a81c50b',
  '23ae65633f842d29c5df529c13f5acda',
];

/** Section 5.2 -- R applied four times in succession. */
export const R_CHAIN: readonly string[] = [
  '00000000000000000000000000000100',
  '94000000000000000000000000000001',
  'a5940000000000000000000000000000',
  '64a59400000000000000000000000000',
  '0d64a594000000000000000000000000',
];

/** Section 5.3 -- L applied four times in succession. */
export const L_CHAIN: readonly string[] = [
  '64a59400000000000000000000000000',
  'd456584dd0e3e84cc3166e4b7fa2890d',
  '79d26221b87b584cd42fbc4ffea5de9a',
  '0e93691a0cfc60408b7b68f66b513c13',
  'e6a8094fee0aa204fd97bcb0b44b8580',
];

/** Section 5.4 -- the test key. */
export const TEST_KEY = '8899aabbccddeeff0011223344556677fedcba98765432100123456789abcdef';

/** Section 5.4 -- the first eight round constants C_1..C_8. */
export const ROUND_CONSTANTS_1_TO_8: readonly string[] = [
  '6ea276726c487ab85d27bd10dd849401',
  'dc87ece4d890f4b3ba4eb92079cbeb02',
  'b2259a96b4d88e0be7690430a44f7f03',
  '7bcd1b0b73e32ba5b79cb140f2551504',
  '156f6d791fab511deabb0c502fd18105',
  'a74af7efab73df160dd208608b9efe06',
  'c9e8819dc73ba5ae50f5b570561a6a07',
  'f6593616e6055689adfba18027aa2a08',
];

/** Section 5.4 -- all ten round keys K_1..K_10. */
export const ROUND_KEYS: readonly string[] = [
  '8899aabbccddeeff0011223344556677',
  'fedcba98765432100123456789abcdef',
  'db31485315694343228d6aef8cc78c44',
  '3d4553d8e9cfec6815ebadc40a9ffd04',
  '57646468c44a5e28d3e59246f429f1ac',
  'bd079435165c6432b532e82834da581b',
  '51e640757e8745de705727265a0098b1',
  '5a7925017b9fdd3ed72a91a22286f984',
  'bb44e25378c73123a5f32f73cdb6e517',
  '72e9dd7416bcf45b755dbaa88e4a4043',
];

/** Section 5.5 -- the test encryption. */
export const TEST_PLAINTEXT = '1122334455667700ffeeddccbbaa9988';
export const TEST_CIPHERTEXT = '7f679d90bebc24305a468d42b9d4edcd';

/**
 * Section 5.5 -- the state after each of the nine LSX rounds, then after the
 * final X[K_10]. Ten entries, because Kuznyechik is nine LSX rounds plus a
 * closing round-key XOR, on ten round keys -- not "ten full rounds".
 */
export const ENCRYPT_TRACE: readonly string[] = [
  'e297b686e355b0a1cf4a2f9249140830',
  '285e497a0862d596b36f4258a1c69072',
  '0187a3a429b567841ad50d29207cc34e',
  'ec9bdba057d4f4d77c5d70619dcad206',
  '1357fd11de9257290c2a1473eb6bcde1',
  '28ae31e7d4c2354261027ef0b32897df',
  '07e223d56002c013d3f5e6f714b86d2d',
  'cd8ef6cd97e0e092a8e4cca61b38bf65',
  '0d8e40e4a800d06b2f1b37ea379ead8e',
  '7f679d90bebc24305a468d42b9d4edcd',
];

/** Section 5.5 -- the two named intermediates inside the first round. */
export const ROUND1_AFTER_X = '99bb99ff99bb99ffffffffffffffffff';
export const ROUND1_AFTER_S = 'e87de8b6e87de8b6b6b6b6b6b6b6b6b6';
export const ROUND1_AFTER_L = 'e297b686e355b0a1cf4a2f9249140830';

/** Section 5.6 -- the first three states of the test decryption. */
export const DECRYPT_AFTER_X_K10 = '0d8e40e4a800d06b2f1b37ea379ead8e';
export const DECRYPT_AFTER_LINV = '8a6b930a52211b45c5baa43ff8b91319';
export const DECRYPT_AFTER_SINV = '76ca149eef27d1b10d17e3d5d68e5a72';
