# Sleeve Check

Rebuild the Kuznyechik and Streebog S-box from four recovered constants and
watch it match the published table byte for byte.

**Live demo:** https://systemslibrarian.github.io/crypto-lab-sleeve-check/

---

## What It Is

An interactive lab about π, the 256-byte substitution table shared by two
Russian standards: the block cipher **Kuznyechik** (GOST R 34.12-2015, RFC 7801)
and the hash function **Streebog** (GOST R 34.11-2012, RFC 6986). GOST published
that table as a plain list of numbers and gave no account of where it came from.
In 2019 Léo Perrin showed it falls out of four small constants and a few lines
of finite-field arithmetic — a structure he named the **TKlog**.

This lab runs all three parts of that story against real code:

- a complete, standard-compliant **Kuznyechik** implementation, checked against
  the worked examples in RFC 7801 §5 before anything else happens;
- the **TKlog generator**, ported line by line from Perrin's SAGE script, which
  rebuilds all 256 bytes from `s`, four λ vectors and `cstt` — and never sees
  the published table;
- the **coset partition** that the rebuild exposes, next to the **AES S-box**
  as a nothing-up-my-sleeve control.

**Security model.** Nothing here is an attack. No key is recovered, no
distinguisher is built, no ciphertext is read. Recovering the structure behind a
table is evidence about a design process, and that is all this lab claims.
Perrin, who recovered the structure, reports finding no attack that leverages
these properties.

**Not production crypto — a teaching demo.** Everything is real: the cipher, the
generator, the field arithmetic and the partition analysis all compute for
actual. But it runs entirely in the browser, has no backend, and is built to be
read rather than deployed.

## Exhibits

1. **The Cipher.** One LSX round stepped as `state → X[Kᵢ] → S → L`, with
   changed bytes marked, over any of the nine round keys. A separate control
   runs the full encryption — nine LSX rounds plus a final round-key XOR, on ten
   round keys — and the decryption, against the pinned RFC 7801 §5 fixtures.
   Panes 2 and 3 stay locked until this passes.
2. **The Table.** Two 16×16 grids. The left is π as RFC 7801 §4.1 prints it; the
   right starts empty and fills from the four constants. Matches settle green;
   mismatches go red, carry a `≠`, and are listed by index.
3. **The reuse claim, executed.** The same generated array is diffed against the
   Streebog S-box of RFC 6986 §6.2 as well. One generator, two standards.
4. **The coset view.** The 255 non-zero inputs split into 17 multiplicative
   cosets of the subfield F₁₆. Select one and watch its 15 members land, as a
   set, on an additive coset of a 4-dimensional space. A running tally counts
   how many *distinct* spaces the 17 cosets use.
5. **The AES control.** The same selector over the AES S-box, built here from
   its FIPS 197 definition: `S(0) = b` and `S(x) = A·x⁻¹ ⊕ b`. π uses 2 landing
   spaces; AES uses 17. See *What Can Go Wrong* for why the naive version of
   that comparison is wrong.
6. **Break it yourself.** Edit `s`, any λ vector or `cstt` and the rebuilt grid
   diverges live, with the broken constraint named. Switch the coset view to
   your version and the partition goes with it.
7. **The Claim.** The sourced record of what the designers have said and when; a
   movable scale that puts 2⁻¹⁶⁰¹ beside a run of lottery wins; and the gap
   between the shape π has and the shape a structural condition of Bannier's
   kind would require.

## When to Use It

- To see what "nothing up my sleeve" means as a *property you can check* rather
  than a slogan.
- To understand why a standard's design rationale is part of the standard.
- To learn how a real S-box is specified, and what a KAT is actually for.
- **Do NOT use this code for anything.** The Kuznyechik implementation is
  written for inspection, not for security: it is not constant-time, it makes no
  attempt to resist side channels, and it handles keys as ordinary arrays in
  browser memory. If you need Kuznyechik, use a reviewed library.
- **Do NOT read this lab as a claim about intent or motive.** It reports what
  the table does and attributes every judgement to whoever made it.

## Live Demo

https://systemslibrarian.github.io/crypto-lab-sleeve-check/

Run the RFC vectors, rebuild the table, sweep the coset selector across π and
then across AES, then break a constant and watch every green verdict retire at
once.

## What Can Go Wrong

- **The naive AES comparison is false.** "Each coset lands on an additive coset
  of some 4-dimensional space" is true of the AES S-box too — a multiplicative
  coset of F\*₁₆ already *is* a 4-dimensional subspace with zero removed,
  inversion permutes those, and AES's affine layer is GF(2)-linear. All 17 of
  AES's cosets pass that test. The real distinction is how many *distinct*
  spaces the landing sets use: π uses 2, AES uses 17. Only the first is a
  partition. A lab that shipped the naive test would report a contrast that is
  not there, so the tally is what the page counts.
- **The log of the identity element.** In the port, `log_α(1)` must be taken as
  **255, not 0**. Both name the same field element, but with 0 the x = 1 branch
  hands κ an argument outside its 4-bit domain, π(1) comes out 0xFC instead of
  0xEE, and the "permutation" collides with π(0). This is the single easiest
  thing in the lab to get subtly wrong, and `tklog.test.ts` executes the wrong
  branch to prove it.
- **The a = 1 coset is not like the others.** Coset 0 — the subfield's own
  multiplicative group — lands on a coset of the span of the λ vectors rather
  than of F₁₆, and the f ⊕ g split does not hold there. The exhibit says so
  rather than letting the selector imply uniformity.
- **RFC 7801 §4.2 has a typo.** As published it reads `148*delta(a_15) +
  32*delta(a_15)` — a₁₅ twice, a₁₄ never. Erratum **EID 6928** (Technical,
  status *Reported*) corrects the second to a₁₄, and the RFC's own §5 vectors do
  not reproduce without that correction. The RFC's one *Verified* erratum, EID
  4660, is editorial and unrelated: it fixes "belonging to Z" to "belonging to
  Q" in the §3.2 definition of δ.
- **Two fields, and they are not interchangeable.** π is a TKlog over
  F₂[X]/(X⁸+X⁴+X³+X²+1) — Perrin's representation choice, not GOST's, since GOST
  specified no field at all. Kuznyechik's linear layer lives in the *different*
  field of RFC 7801 §3.2, x⁸+x⁷+x⁶+x+1. AES brings a third. Nothing in
  `src/gost/field.ts` has a default modulus.
- **Byte equality identifies the function, not the history.** Two earlier
  decompositions also reproduce π exactly (EUROCRYPT 2016; ToSC 2016(2)), and
  none of the three carries a signature saying which one was run.

## Real-World Usage

Kuznyechik and Streebog are the Russian Federation's national standards for
block encryption and hashing, and both have been pushed for ISO/IEC
standardization. The S-box question is therefore not academic: it is an argument
about what a standards body should require of a submission. Perrin's own
recommendation is that, until the designers give a detailed account of their
complete design process, these algorithms should not be used or standardized.

The wider pattern — a constant nobody can explain, inside a standard everybody
is asked to trust — is why the "nothing up my sleeve" convention exists at all,
and why AES's S-box is specified as *invert, then apply this affine map* rather
than as a table.

## How to Run Locally

```bash
npm install
npm run verify       # everything: unit, build, all Playwright projects, count check
```

Or piece by piece:

```bash
npm run dev            # http://localhost:5173/crypto-lab-sleeve-check/
npm test               # unit + KAT suite (Vitest)
npm run build          # typecheck, then production build
npm run test:a11y      # axe WCAG 2.1 A/AA gate against the production build
npm run test:claims    # the claims suite
npm run test:flows     # the critical path in Chromium, Firefox, WebKit, mobile
npm run test:mutation  # re-prove that the tests bite (see below)
npm run check:links    # re-check that every cited source still resolves
```

`test:flows` needs the other engines: `npx playwright install firefox webkit`.

## Related Demos

- [crypto-lab-world-ciphers](https://systemslibrarian.github.io/crypto-lab-world-ciphers/)
  — Kuznyechik side by side with Camellia, ARIA, SM4 and AES.
- [crypto-lab-world-hashes](https://systemslibrarian.github.io/crypto-lab-world-hashes/)
  — Streebog alongside SM3, Kupyna, SHA-256 and SHA-3.
- [crypto-lab-aes-modes](https://systemslibrarian.github.io/crypto-lab-aes-modes/)
  — what the AES S-box is used inside.

## Build & Verify

**177 tests, all executed in CI: 91 Vitest + 31 Playwright claims + 17 verdict-coverage checks + 36 cross-browser flow runs + 2 axe gates.**
`npm run check:counts` re-derives these numbers from the runners and fails if this sentence drifts.
It is a step in the CI gate as well as in `npm run verify`, so the sentence cannot go stale on
`main` with nothing red.

Known-answer tests and their fixture files:

| Fixture | Source | Checked in |
|---|---|---|
| `src/gost/vectors.ts` | RFC 7801 §5.1–§5.6: S, R and L chains; all 32 round constants' first 8; all 10 round keys; every intermediate encryption state; both test vectors | `src/gost/kuznyechik.test.ts` |
| `src/gost/reference.ts` | RFC 7801 §4.1 (π, π⁻¹) and RFC 6986 §6.2 (π), transcribed separately from each RFC's text | `src/gost/reference.test.ts` |
| `src/gost/aes.ts` | FIPS 197 spot checks | `src/gost/aes.test.ts` |

The invariants the architecture embodies, and where each is enforced:

- **INV-1** — encrypt and decrypt match RFC 7801 §5 → `kuznyechik.test.ts`
- **INV-2** — `tklog(i) === pi[i]` for all 256 i, Hamming distance strictly 0 →
  `tklog.test.ts`
- **INV-3** — the same generated array equals the RFC 6986 S-box, byte for byte
  → `tklog.test.ts`
- **INV-4** — perturbing any entry of `s`, any λ vector or `cstt` makes INV-2
  and INV-3 fail → `tklog.test.ts` and `e2e/claims.spec.ts`
- **INV-5** — the generator and the published table live in separate modules
  that do not import each other → `moduleGraph.test.ts`, which reads the source
  text rather than trusting a comment
- **INV-6** — every negative claim in shipped copy carries a scope test, and the
  no-attack finding is attributed to Perrin → `e2e/claims.spec.ts`
- **INV-7** — the two GOST polynomials are pinned separately and neither has a
  default → `field.test.ts`, `kuznyechik.test.ts`
- **INV-8** — nothing in the UI implies GOST specified a field for π →
  `e2e/claims.spec.ts`

The accessibility gate scans the production build through `vite preview` at 1280
and 380 pixels, driving every state the lab renders — both lock cards, the
stepped round, the passing KAT, the empty and the filled grid, the coset view on
π and on AES, and every failure state reachable by breaking a constant. Zero
WCAG 2.1 A/AA violations, and axe's `incomplete` bucket is asserted too.

### Cross-browser and layout evidence

`e2e/flows.spec.ts` runs the critical path in Chromium, Firefox, WebKit and a
Pixel 5 viewport, and adds the geometry assertions axe cannot make. That
distinction is not theoretical: this lab shipped a mobile hero with **190px of
dead space** under it — the fleet template's `flex: 1 1 22rem` becoming a
*height* once the container turned into a column — and it passed both the axe
gate and the reflow check the whole time. Zero violations and zero horizontal
overflow are necessary and not sufficient.

### Every rendered verdict, and how coverage of them is taken

This lab renders ten outcomes, and each one carries a `data-verdict` marker in
the DOM:

| marker | what it reports | mutation that proves it can go red |
|---|---|---|
| `kat-encrypt` | encrypt reaches the RFC 7801 §5.5 ciphertext | `kat-encrypt-verdict` |
| `kat-decrypt` | decrypt recovers the §5.6 plaintext | `kat-decrypt-verdict` |
| `diff-verdict` | Hamming distance of the rebuild against RFC 7801 §4.1 | `diff-verdict-canned` |
| `reuse-verdict` | the same rebuild against the RFC 6986 S-box | `reuse-verdict-canned` |
| `miss-list` | which inputs differ, by name | `miss-list-canned` |
| `coset-verdict` | whether the selected coset still lands on an additive coset | `coset-verdict-canned` |
| `space-tally` | how many distinct landing spaces the 17 cosets use | `space-tally-threshold` |
| `constraint-msg` | which generator precondition the edited constants broke | `constraint-msg-silenced` |
| `standing-verdict` | the pane 3 summary of panes 1 and 2 | `verdict-retirement` |
| `scale-compare` | whether the lottery run has got rarer than the coincidence | `scale-compare-branch` |

A rendered **number** is a claim on exactly the same terms, and it is the easier
one to ship unchecked, because a number does not look like a claim. The three
the counting argument turns on carry `data-claim` markers, are in the same
coverage loop, and each has a mutation of its own:

| marker | what it measures | mutation that proves it can lie |
|---|---|---|
| `lottery-runs` | the position the scale is at | `lottery-runs-pinned` |
| `lottery-probability` | that many consecutive wins, as a power of two | `lottery-probability-pinned` |
| `tklog-probability` | the ratio of the two counts the page prints | `tklog-probability-pinned` |

Each of those carries a `data-value` beside the sentence it renders, and the
owning test asserts both. A mutation that pins one while the other keeps moving
is the measurement version of a canned verdict.

**Coverage is derived by walking the rendered page, not from those tables.**
`driveEveryState` in `e2e/verdicts.spec.ts` is the DENOMINATOR both coverage
rules enumerate over, so it visits **every option of every control that changes
what renders, each control on its own** — both lock cards, all nine round keys,
the four stages of a stepped round, the passing KAT, the empty and the filled
grid, all three boxes, all seventeen cosets, all three ways the constants can
break a precondition, and all eighty positions of the probability scale. Option
counts are read from the controls, not written down here, so a select that grows
an option grows the walk with it. Anything renderable only at a value the walk
skips would sit outside the set the rules judge, which is the same
discovered-rather-than-declared defect one level up.

Over that walk, the first check collects every `data-verdict` and `data-claim`
it finds and fails if any of them has no mutation in
`scripts/mutation-ledger.json`. It fails in the other direction too, when the
ledger names a marker the page has stopped rendering. And it fails if a mutation
record's owning test does not assert its marker through `expectVerdict` /
`expectClaim` in `e2e/verdict-assert.ts` — the helper that checks a marker's
text, its `data-tone`, its pass/fail class and its mark glyph in one call. A
text-only kill is not evidence: the tone, the class and the tick all survive it,
so the marker goes on reporting success in every channel a reader can see except
the sentence.

A second check fails on verdict **wording** (`PASS`, `MISMATCH`, `NO COSET` and
the rest, upper case and whole-word), verdict **styling** (`.verdict`,
`.is-pass`, `.is-fail`, `[data-tone]`) or a rendered **measurement** (a
digit-plus-unit, or a bare number in the stats grid) outside a marked subtree.
The first two are scanned across `#app` — hero, panes and footer, not just the
exhibit panes. The third is scanned in result regions only: the page's own
`role="status"` / `aria-live` regions plus the stats grid, the coset detail and
the step caption. Static prose is deliberately out of scope, because "a 16-byte
block" in an explanatory paragraph is not a claim the run produces. Together
they stop the easy way around the first check: bolting a raw banner, or a raw
number, onto the page and simply not marking it. All three detectors are
themselves watched failing — three tests inject the exact defect, an unmarked
banner, an unmarked number and a marker absent from the ledger, and require each
detector to report it.

The ledger is data, in `scripts/mutation-ledger.json`, precisely so the runner
and the coverage check read the same list. Two copies of a list is how a verdict
ends up covered on paper and uncovered in fact.

### Proving the tests bite

`npm run test:mutation` replays the §4.1c mutation ledger in
`scripts/mutation-ledger.json` through the runner in `scripts/mutation.mjs`.
For each entry it inverts one thing in the source, requires the **build to
succeed** and the **bundle hash to change** (so the mutation demonstrably reached
the browser), runs the test that owns it, and requires that test to fail *naming*
the finding — then restores and checks the hash comes back. It refuses to start
on a dirty tree, because a run that dies mid-check otherwise strands an inverted
condition in a file that also holds real work.

A mutation that leaves every test green is reported as a **dead oracle**, and it
is evidence about the source rather than the tests. That is how the redundant
size check in `additiveCosetOf` was found and deleted (`d2ff0ff`) instead of
being given a test that could not fail.

### Source traceability

Every primary source is declared once in `src/ui/sources.ts` and rendered both
beside the sentence it supports and in the on-page bibliography. The claims
suite asserts that every dated record entry carries a link, that each named
technical claim links its source where the claim is made, and that nothing is
cited without appearing in the bibliography. `npm run check:links` re-checks
that all twelve still resolve; it is deliberately outside the CI gate, because a
source going offline is not a reason to stop shipping a correct page.

### Accessibility beyond the gate

`docs/assistive-technology.md` lists what is automated and gating, and carries
the manual screen-reader script. **That manual pass has not been run**, and the
document says so rather than implying coverage automation cannot provide.

## References

- RFC 7801 — GOST R 34.12-2015 "Kuznyechik", Dolmatov ed., March 2016.
- RFC 6986 — GOST R 34.11-2012 "Streebog".
- Léo Perrin, *Partitions in the S-Box of Streebog and Kuznyechik*, IACR ToSC
  2019(1), 302–329 — [eprint 2019/092](https://eprint.iacr.org/2019/092).
- Léo Perrin, *On the S-Box of Streebog and Kuznyechik* — the FAQ and the SAGE
  script this lab ports:
  https://who.paris.inria.fr/Leo.Perrin/pi.html
- Biryukov, Perrin, Udovenko, *Reverse-Engineering the S-box of Streebog,
  Kuznyechik and STRIBOBr1*, EUROCRYPT 2016 —
  [eprint 2016/071](https://eprint.iacr.org/2016/071).
- Perrin, Udovenko, *Exponential S-boxes: a link between the S-boxes of BelT and
  Kuznyechik/Streebog*, IACR ToSC 2016(2), 99–124.
- Bonnetain, Perrin, Tian, *Anomalies and Vector Space Search* —
  [eprint 2019/528](https://eprint.iacr.org/2019/528).
- FIPS 197 — the AES S-box, used here as the control.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
