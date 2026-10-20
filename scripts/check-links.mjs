// Weekly link check (CI): fetches every card's imageUrl and issuer page url
// the way a phone would (iPhone UA, no Referer) and writes a Markdown report
// to link-report.md. Exit code 1 if any IMAGE is broken — apps show those, so
// they matter most. Page failures are listed separately: bank sites often
// block datacenter IPs, so a failing page can be a false positive.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });

async function check(url, wantImage) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctrl.signal });
    const type = res.headers.get('content-type') ?? '';
    const body = await res.arrayBuffer();
    if (!res.ok) return `HTTP ${res.status}`;
    if (wantImage && !type.startsWith('image/')) return `not an image (${type || 'no type'})`;
    if (wantImage && body.byteLength < 3000) return `too small (${body.byteLength} B)`;
    return null;
  } catch (e) {
    return e.name === 'AbortError' ? 'timeout' : `error: ${e.message}`;
  } finally {
    clearTimeout(t);
  }
}

const jobs = [];
for (const file of walk(join(ROOT, 'cards'))) {
  const card = JSON.parse(readFileSync(file, 'utf8'));
  const rel = relative(ROOT, file);
  if (card.imageUrl) jobs.push({ rel, kind: 'image', url: card.imageUrl });
  if (card.url) jobs.push({ rel, kind: 'page', url: card.url });
}

const failures = [];
const queue = [...jobs];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let j; (j = queue.shift()); ) {
      const why = await check(j.url, j.kind === 'image');
      if (why) failures.push({ ...j, why });
    }
  }),
);

const images = failures.filter((f) => f.kind === 'image').sort((a, b) => a.rel.localeCompare(b.rel));
const pages = failures.filter((f) => f.kind === 'page').sort((a, b) => a.rel.localeCompare(b.rel));
const row = (f) => `| \`${f.rel}\` | ${f.why} | ${f.url} |`;
const report = [
  `Checked ${jobs.length} links on ${new Date().toISOString().slice(0, 10)}.`,
  '',
  `## Broken card images (${images.length})`,
  images.length ? '| File | Problem | URL |\n|---|---|---|\n' + images.map(row).join('\n') : 'None 🎉',
  '',
  `## Issuer pages that failed (${pages.length})`,
  'Often bot-blocking of CI IPs — confirm in a browser before changing data.',
  '',
  pages.length ? '| File | Problem | URL |\n|---|---|---|\n' + pages.map(row).join('\n') : 'None 🎉',
  '',
].join('\n');
writeFileSync(join(ROOT, 'link-report.md'), report);
console.log(report);
process.exit(images.length ? 1 : 0);
