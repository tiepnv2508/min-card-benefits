// Weekly link check (CI): fetches every card's imageUrl and issuer page url
// the way a phone would (iPhone UA, no Referer) and writes a Markdown report
// to link-report.md. Exit code 1 if any IMAGE is broken — apps show those, so
// they matter most. Page failures are listed separately, and bot-blocked
// responses (401 / 403 / 429 — bank sites often block datacenter IPs) go in
// their own section so they never read as a data problem. A discontinued
// card's page is not checked at all (the issuer pulled it; cardholders keep
// the card, so its image still is).
//
// It also catches images whose URL still works but whose CONTENT changed —
// issuers swap promo art ("50,000 BONUS POINTS" badges) in under the same
// path. Every image's pixel size, byte size and sha256 is kept in
// image-fingerprints.json; a changed size for an unchanged URL goes to
// image-changes.md for review (see contentChanged).
// A card whose imageUrl was edited (or is new) is fingerprinted silently —
// a human just picked that image.
//
//   node scripts/check-links.mjs           check + record new fingerprints
//   node scripts/check-links.mjs --accept  also accept every changed image

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });

const ACCEPT = process.argv.includes('--accept');
// "Too small" is judged in pixels, not bytes: a legitimate flat card can be
// tiny (US Bank serves the Amazon Business cards at 150×94 / 1.8 KB), while
// the things worth catching — a 1×1 tracking pixel, a placeholder — are a
// few pixels wide. Bytes are only the fallback for formats whose header we
// can't parse (SVG, AVIF).
const MIN_IMAGE_WIDTH = 100;
const MIN_UNKNOWN_BYTES = 1000;
// Bot protection, not a broken link — reported, never counted as a failure.
const BLOCKED = /^HTTP (401|403|429)$/;
const FP_FILE = join(ROOT, 'image-fingerprints.json');
const baseline = existsSync(FP_FILE) ? JSON.parse(readFileSync(FP_FILE, 'utf8')) : {};

// Pixel size from the file header (PNG / JPEG / WebP / GIF); null otherwise.
function dimensions(b) {
  const u8 = new Uint8Array(b);
  const dv = new DataView(b);
  if (u8[0] === 0x89 && u8[1] === 0x50) return [dv.getUint32(16), dv.getUint32(20)];
  if (u8[0] === 0x47 && u8[1] === 0x49) return [dv.getUint16(6, true), dv.getUint16(8, true)];
  if (u8[0] === 0xff && u8[1] === 0xd8) {
    for (let i = 2; i + 9 < u8.length; ) {
      if (u8[i] !== 0xff) { i++; continue; }
      const m = u8[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return [dv.getUint16(i + 7), dv.getUint16(i + 5)];
      i += 2 + dv.getUint16(i + 2);
    }
    return null;
  }
  if (String.fromCharCode(...u8.slice(8, 12)) === 'WEBP') {
    const kind = String.fromCharCode(...u8.slice(12, 16));
    if (kind === 'VP8 ') return [dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff];
    if (kind === 'VP8L') {
      const v = dv.getUint32(21, true);
      return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
    }
    if (kind === 'VP8X') {
      const w = 1 + (u8[24] | (u8[25] << 8) | (u8[26] << 16));
      const h = 1 + (u8[27] | (u8[28] << 8) | (u8[29] << 16));
      return [w, h];
    }
  }
  return null;
}

const fingerprints = {};

// The raw hash is too strict: some CDNs serve byte-different copies of the
// same art from different edges (Chase: identical size, different sha256 on
// alternating fetches). A real swap — promo badge, new design — changes the
// pixel size or the file size, so compare those. The byte tolerance is 5%:
// Bilt's CDN alternated between a 77 KB and a 78 KB rendition of the same
// 500×317 art (2026-10-26, ~2% apart), which the old 1% flagged every week.
// A promo overlay on the same canvas adds far more than that; a redesign
// usually changes the pixel size as well.
const contentChanged = (a, b) =>
  a.width !== b.width || a.height !== b.height || Math.abs(a.bytes - b.bytes) / a.bytes > 0.05;

async function check(url, wantImage, id) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ctrl.signal });
    const type = res.headers.get('content-type') ?? '';
    const body = await res.arrayBuffer();
    if (!res.ok) return `HTTP ${res.status}`;
    if (!wantImage) return null;
    if (!type.startsWith('image/')) return `not an image (${type || 'no type'})`;
    const dims = dimensions(body);
    if (dims && dims[0] < MIN_IMAGE_WIDTH) return `too small (${dims[0]}×${dims[1]} px)`;
    if (!dims && body.byteLength < MIN_UNKNOWN_BYTES) return `too small (${body.byteLength} B, unparsed format)`;
    const sha256 = createHash('sha256').update(new Uint8Array(body)).digest('hex');
    const [width, height] = dims ?? [null, null];
    fingerprints[id] = { url, sha256, bytes: body.byteLength, width, height };
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
  if (card.imageUrl) jobs.push({ rel, id: card.id, kind: 'image', url: card.imageUrl });
  // A discontinued card's page is expected to vanish (Aviator Red: Barclays
  // 404s since the AA portfolio moved to Citi) — checking it only adds noise.
  if (card.url && !card.discontinued) jobs.push({ rel, kind: 'page', url: card.url });
}

const failures = [];
const queue = [...jobs];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let j; (j = queue.shift()); ) {
      const why = await check(j.url, j.kind === 'image', j.id);
      if (why) failures.push({ ...j, why });
    }
  }),
);

const images = failures.filter((f) => f.kind === 'image').sort((a, b) => a.rel.localeCompare(b.rel));
const allPages = failures.filter((f) => f.kind === 'page').sort((a, b) => a.rel.localeCompare(b.rel));
const pages = allPages.filter((f) => !BLOCKED.test(f.why));
const blocked = allPages.filter((f) => BLOCKED.test(f.why));
const row = (f) => `| \`${f.rel}\` | ${f.why} | ${f.url} |`;
const table = (rows) => (rows.length ? '| File | Problem | URL |\n|---|---|---|\n' + rows.map(row).join('\n') : 'None 🎉');
const report = [
  `Checked ${jobs.length} links on ${new Date().toISOString().slice(0, 10)}.`,
  '',
  `## Broken card images (${images.length})`,
  table(images),
  '',
  `## Issuer pages that failed (${pages.length})`,
  'Confirm in a browser before changing data — a 404 can mean the card moved issuer or was retired (set `discontinued`, never delete the file).',
  '',
  table(pages),
  '',
  `## Issuer pages that blocked the check (${blocked.length})`,
  'HTTP 401 / 403 / 429 from bot protection on CI IPs. Not a data problem; listed for the record.',
  '',
  table(blocked),
  '',
].join('\n');
writeFileSync(join(ROOT, 'link-report.md'), report);
console.log(report);

// ---- content changes -------------------------------------------------------
const relById = Object.fromEntries(jobs.filter((j) => j.kind === 'image').map((j) => [j.id, j.rel]));
const changed = [];
const next = {};
for (const id of Object.keys(relById).sort()) {
  const now = fingerprints[id];
  const before = baseline[id];
  if (!now) {
    if (before) next[id] = before; // broken this week — keep the old record
    continue;
  }
  if (before && before.url === now.url && contentChanged(before, now) && !ACCEPT) {
    changed.push({ id, rel: relById[id], before, now });
    next[id] = before; // stays flagged until accepted
  } else {
    next[id] = now;
  }
}
writeFileSync(FP_FILE, JSON.stringify(next, null, 2) + '\n');

const size = (f) => `${f.width ?? '?'}×${f.height ?? '?'}, ${Math.round(f.bytes / 1024)} KB`;
const changes = [
  `${changed.length} card image(s) changed content under the same URL (${new Date().toISOString().slice(0, 10)}).`,
  '',
  'Issuers sometimes swap in promo art (bonus badges, "NEW OFFER" ribbons). Look at each one:',
  '- **Still a clean, flat card?** Run the *link-check* workflow with **accept** ticked.',
  '- **Promo / lifestyle art?** Find a clean image or remove `imageUrl` from the card file.',
  '',
  ...changed.map(
    (c) => `### \`${c.rel}\`\nWas ${size(c.before)} → now ${size(c.now)}\n\n<img src="${c.now.url}" width="320">\n`,
  ),
].join('\n');
writeFileSync(join(ROOT, 'image-changes.md'), changes);
if (changed.length) console.log(changes);

process.exit(images.length ? 1 : 0);
