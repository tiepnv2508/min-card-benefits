// One-off helper (kept for re-runs on new files): marks always-on perks
// `autoApplied: true` by name. Review the diff — names are heuristics.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const AUTO = /status|elite\b|elite night|gold elite|platinum elite|honors (silver|gold|diamond)|emerald|sterling|five star|mqd headstart|club membership|club access|lounge access|lounge collection|priority pass|dashpass membership|apple (music|tv)|checked bags|flight discount|companion pass boost|anniversary (points|miles|avios|bonus|status|flying blue|onekeycash|5,000)|^\d[\d,]* anniversary|anniversary .*points|monthly miles|mosaic/i;
const NOT = /free night|certificate|companion (fare|ticket|coupon|certificate|award)|pass(es)? ?$|passes|voucher|coupon|upgrade|credit|\$\d+ spend|spend free/i;
// Always-on despite matching NOT ("credit" / "pass" in the name).
const ALWAYS = /^\d* ?elite night credits$|^priority pass$/i;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let n = 0;
for (const f of walk('cards')) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  let changed = false;
  for (const b of j.benefits) {
    if (b.type !== 'perk' || 'autoApplied' in b) continue;
    if ((AUTO.test(b.name) && !NOT.test(b.name)) || ALWAYS.test(b.name)) {
      // keep key order: insert after enrollmentRequired/inApp if present
      const o = {}; let placed = false;
      for (const [k, v] of Object.entries(b)) { o[k] = v; if (!placed && (k === 'enrollmentRequired')) { o.autoApplied = true; placed = true; } }
      if (!placed) o.autoApplied = true;
      Object.keys(b).forEach((k) => delete b[k]); Object.assign(b, o);
      changed = true; n++;
    }
  }
  if (changed) writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
}
console.log('autoApplied set on', n, 'perks');
