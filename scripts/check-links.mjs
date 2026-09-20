#!/usr/bin/env node
/**
 * Check that every primary source this lab cites still resolves.
 *
 * Deliberately NOT part of the CI gate. A source going offline is a citation
 * problem, not a reason to stop shipping a correct page, and a gate that fails
 * on someone else's outage is a gate people learn to ignore. Run it when you
 * touch `src/ui/sources.ts`, or on a schedule.
 */

import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = readFileSync(`${ROOT}src/ui/sources.ts`, 'utf8');
const entries = [...src.matchAll(/^\s{2}(\w+):\s*\{[\s\S]*?href:\s*'([^']+)'/gm)].map((m) => ({
  id: m[1],
  href: m[2],
}));

if (entries.length === 0) {
  console.error('No sources parsed out of src/ui/sources.ts -- the shape has changed.');
  process.exit(2);
}

let bad = 0;
for (const { id, href } of entries) {
  let status = 'ERR';
  try {
    // Some of these hosts refuse HEAD (the RFC editor answers 405), so GET, and
    // read nothing: the status line is the whole result.
    const res = await fetch(href, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    status = String(res.status);
    if (!res.ok) bad++;
  } catch (err) {
    bad++;
    status = `ERR ${err.name}`;
  }
  console.log(`${status.padEnd(9)} ${id.padEnd(16)} ${href}`);
}
console.log(`\n${entries.length - bad}/${entries.length} sources resolved.`);
process.exit(bad ? 1 : 0);
