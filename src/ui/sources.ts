/**
 * Every primary source this lab cites, declared once.
 *
 * Two reasons this is a registry rather than links written inline where they
 * are needed. First, a claim and its source drift apart the moment they live in
 * different places -- the bibliography stays right while the sentence it
 * supports quietly stops matching it. Second, it lets `e2e/claims.spec.ts`
 * assert coverage mechanically: every dated record entry and every named
 * technical claim must carry a link, and every id here must appear in the
 * on-page bibliography. For a lab whose whole subject is auditability, the
 * prose has to be as auditable as the bytes.
 *
 * Every URL below was fetched and its title checked while this file was
 * written. `npm run check:links` re-checks them on demand; it is deliberately
 * NOT in the CI gate, because a source going offline is not a reason to stop
 * shipping a correct page.
 */

export interface Source {
  /** Short label for an inline link. */
  readonly label: string;
  readonly href: string;
  /** Full citation, for the bibliography. */
  readonly cite: string;
}

export const SOURCES = {
  rfc7801: {
    label: 'RFC 7801',
    href: 'https://www.rfc-editor.org/rfc/rfc7801.txt',
    cite: 'RFC 7801 — GOST R 34.12-2015 “Kuznyechik”, Dolmatov ed., March 2016. The S-box is §4.1, the linear transformation §4.2, the worked examples §5.',
  },
  rfc6986: {
    label: 'RFC 6986',
    href: 'https://www.rfc-editor.org/rfc/rfc6986.txt',
    cite: 'RFC 6986 — GOST R 34.11-2012 “Streebog”. The same S-box table is printed in §6.2.',
  },
  eid4660: {
    label: 'erratum EID 4660',
    href: 'https://www.rfc-editor.org/errata/eid4660',
    cite: 'RFC 7801 erratum EID 4660 — Verified, Editorial. Corrects “belonging to Z” to “belonging to Q” in the §3.2 definition of δ. It changes no value.',
  },
  eid6928: {
    label: 'erratum EID 6928',
    href: 'https://www.rfc-editor.org/errata/eid6928',
    cite: 'RFC 7801 erratum EID 6928 — Reported, Technical. Corrects §4.2’s second coefficient from δ(a₁₅) to δ(a₁₄). Without it the RFC’s own §5 vectors do not reproduce.',
  },
  tosc2019: {
    label: 'Perrin, ToSC 2019(1)',
    href: 'https://tosc.iacr.org/index.php/ToSC/article/view/7405',
    cite: 'Léo Perrin, “Partitions in the S-Box of Streebog and Kuznyechik”, IACR Transactions on Symmetric Cryptology 2019(1), 302–329. The TKlog, the partition, and the counting argument.',
  },
  eprint2019092: {
    label: 'eprint 2019/092',
    href: 'https://eprint.iacr.org/2019/092',
    cite: 'The same paper as an ePrint preprint: IACR Cryptology ePrint Archive, Report 2019/092.',
  },
  faq: {
    label: 'Perrin’s FAQ',
    href: 'https://who.paris.inria.fr/Leo.Perrin/pi.html',
    cite: 'Léo Perrin, “On the S-Box of Streebog and Kuznyechik” — the FAQ, the SAGE script this lab ports (§2.1.1), the designers’ stated position (§2.1), the no-attack statement (§2.4) and the dated Updates entries (§3). Last updated 19 February 2020.',
  },
  eprint2019528: {
    label: 'Bonnetain–Perrin–Tian, eprint 2019/528',
    href: 'https://eprint.iacr.org/2019/528',
    cite: 'Xavier Bonnetain, Léo Perrin, Shizhu Tian, “Anomalies and Vector Space Search: Tools for S-Box Reverse-Engineering”, ePrint 2019/528 — the paper addressing the coincidence argument.',
  },
  eurocrypt2016: {
    label: 'EUROCRYPT 2016',
    href: 'https://eprint.iacr.org/2016/071',
    cite: 'Alex Biryukov, Léo Perrin, Aleksei Udovenko, “Reverse-Engineering the S-box of Streebog, Kuznyechik and STRIBOBr1”, EUROCRYPT 2016. ePrint 2016/071. The first decomposition.',
  },
  tosc2016: {
    label: 'Perrin–Udovenko, ToSC 2016(2)',
    href: 'https://tosc.iacr.org/index.php/ToSC/article/view/567',
    cite: 'Léo Perrin, Aleksei Udovenko, “Exponential S-Boxes: a Link Between the S-Boxes of BelT and Kuznyechik/Streebog”, IACR Transactions on Symmetric Cryptology 2016(2), 99–124. The second decomposition.',
  },
  bannier: {
    label: 'Bannier, Bodin, Filiol, eprint 2016/493',
    href: 'https://eprint.iacr.org/2016/493',
    cite: 'Arnaud Bannier, Nicolas Bodin, Eric Filiol, “Partition-Based Trapdoor Ciphers”, ePrint 2016/493 — the published form of the structural condition set out in Bannier’s 2017 ENSAM thesis, which is what Perrin cites.',
  },
  fips197: {
    label: 'FIPS 197',
    href: 'https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.197-upd1.pdf',
    cite: 'FIPS 197 (updated) — the AES specification. §5.1.1 gives the S-box as an inversion followed by one fixed GF(2)-affine map, which is the control this lab uses.',
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

/** Every id, so the bibliography and the coverage test cannot drift apart. */
export const SOURCE_IDS = Object.keys(SOURCES) as SourceId[];
