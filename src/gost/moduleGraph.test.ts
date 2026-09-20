import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * INV-5, enforced rather than described.
 *
 * "Generator and reference table live in separate code paths and separate
 * modules. The verifier must never import the lab's generator, and the lab must
 * never import the RFC table into the generator path."
 *
 * A comment saying so drifts the first time somebody adds a convenient import.
 * This reads the source text and fails when it happens.
 */

const DIR = new URL('.', import.meta.url).pathname;

function importsOf(file: string): string[] {
  const src = readFileSync(join(DIR, file), 'utf8');
  return [...src.matchAll(/(?:^|\n)\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

describe('INV-5 -- the generator and the reference table stay apart', () => {
  it('tklog.ts does not import the published table, directly or via kuznyechik', () => {
    const imports = importsOf('tklog.ts');
    expect(imports).not.toContain('./reference');
    expect(imports).not.toContain('./kuznyechik');
    expect(imports).not.toContain('./diff');
  });

  it('kuznyechik.ts -- the verifier -- does not import the generator', () => {
    const imports = importsOf('kuznyechik.ts');
    expect(imports).not.toContain('./tklog');
    expect(imports).toContain('./reference');
  });

  it('field.ts, the shared floor, imports neither side', () => {
    const imports = importsOf('field.ts');
    expect(imports).toEqual([]);
  });

  it('diff.ts is the comparison site and imports neither side itself', () => {
    // It compares whatever it is handed; the caller supplies both arrays.
    expect(importsOf('diff.ts')).toEqual([]);
  });

  it('no module outside the comparison sites holds both paths at once', () => {
    const allowed = new Set(['diff.ts']);
    const offenders: string[] = [];
    for (const file of readdirSync(DIR)) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts') || allowed.has(file)) continue;
      const imports = importsOf(file);
      if (imports.includes('./reference') && imports.includes('./tklog')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('the AES control depends only on the field, never on either GOST path', () => {
    const imports = importsOf('aes.ts');
    expect(imports).toEqual(['./field']);
  });
});
