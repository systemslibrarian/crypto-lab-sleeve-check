# BUILD BRIEF — crypto-lab-sleeve-check

Binding spec: `audits/_MASTER-TEMPLATE.md` (copy into this repo alongside this
brief). Catalog root `CLAUDE.md` wins where the two touch.
Lifecycle: Build → Teach → Look → Accessibility → README → Deploy.

## REVISION HISTORY (keep — do not delete on build)

- Rev 1 cited "RFC 7801 Appendix A" for the KATs. FALSE: RFC 7801 has no
  Appendix A. Its ToC runs 4.1 Nonlinear Bijection, 4.2 Linear Transformation,
  4.3 Transformations, 4.4 Key Schedule, 4.5 Basic Encryption Algorithm,
  5. Examples (Informative). The vectors are in §5.
- Rev 1 said the designers "declined to give a generator." FALSE and weaker
  than the record: they stated the S-box was picked at random from some set,
  claimed to have lost the generation program, and after Perrin 2019 argued
  the TKlog was coincidence. See CITATIONS.
- Rev 1 labelled TKlog "composed with a published integer-to-field map."
  FALSE: that map was RECOVERED by Perrin, not published by anyone.
- Rev 1 named one prior decomposition. There are TWO (EUROCRYPT 2016 and
  ToSC 2016); TKlog is the third and explains the relation between them.
- Rev 2 restated the TKlog branch arithmetic as pseudocode. Do NOT treat that
  restatement as normative — see ALGORITHM SOURCE below. The SAGE script is
  normative; the 256-byte table is the acceptance test.
- Rev 1 wrote "full 10-round Kuznyechik." Loose: 9 LSX rounds plus a final
  round-key XOR, 10 round keys total.

## NEW DEMO BRIEF

repo name      : crypto-lab-sleeve-check
short name (H1): Sleeve Check
subtitle       : GOST R 34.12-2015 · GOST R 34.11-2012 · π
one-liner      : Rebuild the Kuznyechik/Streebog S-box from four recovered
                 constants and watch it match the published table byte for byte.
concept        : An unexplained constant is still checkable. Recovering the
                 structure behind a table is evidence about the design process
                 — not, by itself, an attack.
primitives/spec: Kuznyechik (GOST R 34.12-2015, RFC 7801), Streebog S-box
                 (GOST R 34.11-2012, RFC 6986), Perrin's TKlog decomposition
                 (ToSC 2019(1) 302–329), AES S-box (FIPS 197) as NUMS control.
--accent       : ASSIGN CENTRALLY. Do not pick one in this repo.
favicon        : 🎩
in scope       : Kuznyechik encrypt/decrypt to KAT; TKlog generator; π vs
                 generated diff; coset partition view; AES NUMS comparison;
                 sourced record of the designers' statements.
non-goals      : No attack. No key recovery. No Streebog hash implementation
                 (the S-box table alone is in scope). No claim about intent or
                 motive. Not a Dual_EC analogue. The words "backdoor",
                 "dishonest" and "malicious" do not appear in shipped copy.

## §1.1 SCOPE

Three panes, left to right, each gated on the one before.

1. THE CIPHER — one Kuznyechik LSX round stepped as X[Kᵢ] → S → L, plus a
   full encrypt/decrypt run against the RFC 7801 §5 vectors. Purpose: prove
   the implementation is standard-compliant before the exhibit dissects it.
2. THE TABLE — the core interactive. Two 16×16 grids; generate π from the
   TKlog constants; diff; then the coset view (the headline mechanism); then
   the AES toggle as the nothing-up-my-sleeve control.
3. THE CLAIM — the sourced record and the probability argument.

## §1.2 SECURITY / CORRECTNESS INVARIANTS (beat features on conflict)

INV-1  Kuznyechik encrypt and decrypt match RFC 7801 §5 "Examples
       (Informative)". Use the errata-incorporated rendering — verified
       erratum EID 4660 exists against this RFC. Pin the vectors as fixtures.
INV-2  tklog(i) === pi[i] for all 256 i. Hamming distance evaluates strictly
       to 0. Not "≈", not "all but one".
INV-3  The same generated array equals the RFC 6986 Streebog S-box, byte for
       byte. One generator, two standards — this is the reuse claim and it
       must be executed, not asserted in prose.
INV-4  MUTATION GATE (§4.1c/§4.1d, `e2e/claims.spec.ts`): perturbing any one
       entry of `s`, any one λ vector, or `cstt` must make INV-2 and INV-3
       FAIL in CI. Sticky-red in the UI is a teaching affordance, not the test.
INV-5  Generator and reference table live in separate code paths and separate
       modules. The verifier must never import the lab's generator, and the
       lab must never import the RFC table into the generator path.
INV-6  Every negative claim in shipped copy carries a fixture-backed scope
       test per §4.1d. In particular: "no attack leveraging this structure is
       known" is attributed to Perrin, not asserted by us.
INV-7  Two distinct field polynomials appear in this lab. PIN BOTH, DO NOT
       ASSUME: the TKlog representation field is
       F₂[X]/(X⁸+X⁴+X³+X²+1) (= 0x11D, primitive, so X generates F*₂₈); the
       polynomial for Kuznyechik's L transformation must be read out of
       RFC 7801 §4.2 and recorded here before any code is written. One
       polynomial must not silently serve both.
INV-8  Nothing in the UI may imply GOST specified a field for π. GOST
       published a lookup table. The field is Perrin's representation choice.

## §1.3 ARCHITECTURE

ALGORITHM SOURCE (normative):
Perrin's SAGE script at https://who.paris.inria.fr/Leo.Perrin/pi.html §2.1.1
is the reference implementation. Port it line by line. It is Python 2
(`xrange`, bare `print`) — port, don't transliterate. Recovered constants:

    field     F₂[X]/(X⁸+X⁴+X³+X²+1), alpha = the field generator
    s         [0,12,9,8,7,4,14,6,5,10,2,11,1,3,13]   (a permutation of 0..14)
    lambda    [0x12, 0x26, 0x24, 0x30]
    cstt      0xFC
    kappa(x)  XOR of lambda[j] over set bits j of x (j = 0..3), XOR cstt
    branches  pi[0] from kappa(0); for x > 0 split the discrete log
              l = log_alpha(x) into l mod 17 and floor(l/17), with a separate
              case when 17 | l (i.e. x in the order-15 subgroup).

The index arithmetic in the subgroup branch is the single easiest thing in
this lab to get subtly wrong. Do not accept a hand-derived formula, including
the one in this brief's Rev 2 history. Acceptance is INV-2: byte equality on
all 256 entries, or the port is wrong.

Build log/antilog tables for F₂₈ once at load; don't recompute logs per entry.
Everything client-side, no build step beyond the catalog default.

## §1.4 UI

PANE 1 — The Cipher
  Step control over one LSX round: state → X[Kᵢ] → S → L, 16 bytes shown as a
  4×4 of hex cells, changed bytes marked. A separate "run full vector" control
  executes all 9 LSX rounds plus the final key XOR and shows pass/fail against
  the pinned RFC 7801 §5 fixture. Plain-language intro sits above the first
  hex the visitor sees.

PANE 2 — The Table
  State A: standard π grid populated from the RFC; generated grid blank.
  State B: "Generate & Diff" fills the second grid from the TKlog constants.
    Matches settle green; mismatches go red and stay red.
  State C (HEADLINE): coset view. A single selector over i = 0..16 picks one
    multiplicative coset {α^17ⁱ ⊙ x : x ∈ F*₂₄} — 15 input cells highlight,
    and the 15 cells they land on highlight in the output grid, forming an
    additive coset {b ⊕ x : x ∈ F*₂₄}. One coset at a time: do NOT colour all
    17 simultaneously (17 hues fails the §4 axe/WCAG gate and teaches less).
  State D: break-it-yourself. The visitor edits `s`, a λ vector or `cstt`
    directly; the generated grid diverges live. Footnote the constraints —
    `s` must stay a permutation of {0..14}; the λ vectors must span a
    4-dimensional space that together with the subfield spans the whole field.
  AES TOGGLE (the NUMS control): same two grids, same coset selector, driven
    by S(0) = b and S(x) = A·x⁻¹ ⊕ b for x ≠ 0, both halves written out. The
    coset selector run over AES shows no corresponding partition. That
    contrast is the lesson; do not narrate it in prose the picture already
    makes.
  TKlog label, verbatim: "a discrete logarithm on F₂₈ composed with an
    integer-to-field map recovered by Perrin (2019) — not published by the
    designers." Defining equations inside a <details> disclosure.

PANE 3 — The Claim
  a. The record, dated and sourced:
     - Designers' stated position when asked: the S-box was picked at random
       from some set; the generation algorithm was lost.
     - Oct 2019, ISO meeting, Paris: the alleged designer maintained the
       randomness claim and said he had lost the generating program.
     - After Perrin 2019, the designers argued the TKlog was coincidence;
       that argument is addressed in Bonnetain–Perrin–Tian (eprint 2019/528).
  b. The counter (the interactive payload): roughly 2^82.6 TKlog instances
     exist on 8 bits against 256! ≈ 2^1684 permutations, so a random
     permutation is a TKlog with probability about 2^-1601 — Perrin's own
     framing is winning the French lottery 66 times running. Render it as a
     scale the visitor can move, not a sentence. This is what converts
     "unexplained" into "not an accident" without us asserting intent.
  c. The reality check: Bannier's backdoor condition requires the coset
     structure on the INPUT; π has it on the output only. Draw both shapes
     and show the gap. State that Perrin reports finding no attack leveraging
     these properties.
  d. Prior art footnote: two earlier decompositions — EUROCRYPT 2016
     (Biryukov–Perrin–Udovenko) and ToSC 2016 (Perrin–Udovenko, exponential
     S-boxes, linking to BelT). TKlog is the third, is the simplest, and
     explains the relation between the first two.
  e. No quotation marks around anything not verbatim from a cited document.

HERO — three text roles, kept distinct:
  subtitle    : spec label only (see NEW DEMO BRIEF above)
  description : what the demo demonstrates — rebuilding a published S-box
                from recovered constants and diffing it
  why it matters: standards you cannot audit are standards you are trusting
                on the designer's word

## §1.5 VISUAL SEMANTICS

green      = generated byte equals published byte
red, sticky= mismatch; persists so the visitor can find the exact failure cell
selected   = the one coset under inspection (input side)
image      = its landing set (output side)
neutral    = everything not currently under inspection
No decorative motion anywhere. Never draw a picture that contradicts the
taught property — in particular, no arrow or animation that implies data
flowing from π into a break.

## §1.6 EDGE CASES

- π(0). The table's first entry is 252 and κ(0) = cstt = 0xFC. Free
  cross-check; wire it as a claims-suite assertion, not a comment.
- The subgroup branch (17 | l). Highest off-by-one risk in the lab.
- The a = 1 coset, where the f ⊕ g split does not hold. Say so in the
  disclosure rather than letting the coset selector imply uniformity.
- Python 2 → JS port hazards: `xrange`, `integer_representation`, and the log
  of the identity element.
- Visitor mutation that leaves `s` a non-permutation: the generator must still
  produce output and still fail the diff, not throw.
- Decrypt path: inverse S and inverse L, exercised against the same fixture.

## §1.7 EXTENSION SEAMS

- The f(a) ⊕ g(b) half-dependency view as a second toggle in pane 2.
- Streebog's 64×64 binary linear layer shown as an 8×8 matrix over F₂₈ —
  Perrin reports it lives in the same field as π, and its design process is
  still unrecovered. Good "open problem" card.
- LAT / DDT picture as an optional deep-dive.

## VERIFY BEFORE WRITING COPY — do not assert, grep

- grep CATEGORIES and report the resulting chip-bar split; propose placement
  from what you find. Do not state that a category is new until checked.
- grep the catalog for existing S-box-structure, NUMS, or reverse-engineering
  coverage and report overlaps before any "first" or "only" phrasing is
  drafted. No exhaustive negative claims about the catalog, in any revision.
- Confirm `crypto-lab-hidden-bit` still exists before reusing any of its copy
  patterns; the rename away from "hidden-box" was to avoid colliding with it.
- Read RFC 7801 §4.2 and record the L polynomial here (INV-7).
- Confirm RFC 6986 prints the S-box table and pin the section number.

## CI GATES (existing mechanisms — reference, do not reinvent)

- `e2e/claims.spec.ts` — §4.1b cross-checks and independent re-derivations,
  §4.1c mutation discipline, §4.1d negative-claim scope tests.
- §4 axe/WCAG gate. The coset view is the a11y risk; single-selection design
  above is what keeps it passing.
- §5 README section list. §6.1/6.2 dependabot grouping, auto-merge, deploy
  dispatch.
- §4.1d names CLAIMS.yaml, THREAT-MODEL.md and a second-language verifier as
  the things NOT to build. Do not build them here.

## CITATIONS (verified against primary sources)

- RFC 7801, GOST R 34.12-2015 "Kuznyechik", Dolmatov ed., March 2016.
  Vectors in §5 Examples (Informative). Verified erratum EID 4660.
- RFC 6986, GOST R 34.11-2012 "Streebog".
- Léo Perrin, "Partitions in the S-Box of Streebog and Kuznyechik",
  IACR ToSC 2019(1), 302–329. eprint 2019/092.
- Léo Perrin, "On the S-Box of Streebog and Kuznyechik" (FAQ + SAGE script,
  last updated 19 Feb 2020): https://who.paris.inria.fr/Leo.Perrin/pi.html
- Biryukov, Perrin, Udovenko, "Reverse-Engineering the S-box of Streebog,
  Kuznyechik and STRIBOBr1", EUROCRYPT 2016. eprint 2016/071.
- Perrin, Udovenko, "Exponential S-boxes: a link between the S-boxes of BelT
  and Kuznyechik/Streebog", IACR ToSC 2016(2), 99–124.
- Bonnetain, Perrin, Tian, "Anomalies and Vector Space Search: Tools for
  S-Box Reverse-Engineering". eprint 2019/528.
- FIPS 197 for the AES S-box control.
## VERIFIED DURING BUILD (2026-09-20) — recorded as the VERIFY section asks

Primary sources fetched and checked, not asserted.

INV-7, the L polynomial. RFC 7801 §3.2 defines field Q as GF(2)[x]/p(x) with
p(x) = x^8 + x^7 + x^6 + x + 1, i.e. **0x1C3**. That is the field §4.2's linear
transformation l is computed in. It is NOT the TKlog representation field
(0x11D), and AES brings a third (0x11B). All three are named in
`src/gost/field.ts`; nothing there has a default modulus.

The §4.2 coefficient list, a_15 down to a_0:
148, 32, 133, 16, 194, 192, 1, 251, 1, 192, 194, 16, 133, 32, 148, 1.

ERRATA — the brief's INV-1 needs correcting. EID 4660 does exist and is
Verified, but it is **Editorial** and applies to **§3.2**: "belonging to Z" ->
"belonging to Q" in the definition of delta. It changes no value and no vector.
The erratum that matters for implementation is **EID 6928** (Technical, status
**Reported**, not Verified), against §4.2: the published text reads
`148*delta(a_15) + 32*delta(a_15)` — a_15 twice, a_14 never. The RFC's own §5
vectors do not reproduce under the literal text, which `kuznyechik.test.ts`
demonstrates rather than asserts. So "the errata-incorporated rendering" is
right, but the erratum to cite is 6928.

RFC 6986 prints the S-box in **§6.2** "Nonlinear Bijections of Binary Vector
Sets". Both RFCs' tables were extracted separately from their own plain text and
are byte-identical; pi[0] = 252 = 0xFC = cstt, as §1.6 predicts.

PORT HAZARD, resolved. In Perrin's SAGE script `int(F.fetch_int(x)._log_repr())`
gives the multiplicative identity the log representative **255, not 0**. With 0,
the x = 1 branch computes kappa(16) — outside kappa's 4-bit domain — pi(1) comes
out 0xFC instead of 0xEE, and the result collides with pi(0). The tell that 255
is right: kappa's argument is then exactly 1..15 on that branch and 0..15
overall. This is the §1.6 "log of the identity element" hazard.

§1.4 AES TOGGLE — the brief's phrasing is right but a naive implementation of it
would ship something false. "The coset selector run over AES shows no
corresponding partition" is correct; "AES's cosets do not land on additive
cosets" is NOT. All 17 of AES's cosets DO land on additive cosets of some
4-dimensional space, because a multiplicative coset of F*_16 already is a
4-dimensional subspace minus zero, inversion permutes those, and AES's affine
layer is GF(2)-linear. The real measurement is how many DISTINCT spaces the 17
landing sets use: pi uses 2 (sixteen cosets on the subfield F_16 itself, plus
the a = 1 exception on span(lambda)), AES uses 17. Only pi's tiles the output.
That count is what the page displays and what `claims.spec.ts` checks.

§1.4 PANE 3c vs NON-GOALS. §1.4 describes Bannier's result as a "backdoor
condition", but the non-goals forbid the word in shipped copy. The stricter
reading wins: the condition is named and described without it, and
`claims.spec.ts` enforces the absence of backdoor, dishonest and malicious
across all three panes with every disclosure open.

CATALOG GREPS (reported, not acted on — no catalog file was edited).
- `CATEGORIES` in `crypto-lab/index.html` holds 16 chips: FOUNDATIONS,
  ENCRYPTION, SIGNATURES, KEY EXCHANGE, PROTOCOLS, MPC & THRESHOLD, PRIVACY,
  ZERO-KNOWLEDGE, HOMOMORPHIC, HASHING & KDFS, RANDOMNESS, POST-QUANTUM,
  ATTACKS, REAL-WORLD SYSTEMS, STEGANOGRAPHY, HISTORICAL. No new chip is needed.
  Proposed placement: `data-category="FOUNDATIONS | REAL-WORLD SYSTEMS"` in the
  Cryptanalysis section. ATTACKS is the tempting chip and is wrong here — the
  non-goals rule out framing this as an attack.
- Existing coverage that overlaps: `crypto-lab-world-ciphers` (Kuznyechik
  encrypt/decrypt plus "S-box analysis", accent #ffb84d) and
  `crypto-lab-world-hashes` (Streebog). Neither touches S-box structure
  recovery, NUMS as a checkable property, or the TKlog. No "first" or "only"
  phrasing was drafted, in this repo or for the card.
- `crypto-lab-hidden-bit` exists on GitHub (a security-game lab: IND-CPA,
  CCA2, EUF-CMA). It is unrelated in subject, so no copy patterns were reused
  and the rename away from "hidden-box" collides with nothing.

ACCENT. Assigned centrally as #9f88ff and set on `:root` in `src/styles.css`.
