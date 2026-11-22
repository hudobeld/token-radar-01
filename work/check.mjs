// Gate self-check for the token-radar entry (read-only: never writes to out/).
// Usage: node work/check.mjs <out-dir> <snapshot.json>
// Checks the same seven rows the sealed scorer checks, plus the dashboard
// source cap (64 KiB) and the dossier byte-for-byte rebuild.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const out = process.argv[2] ?? 'out';
const snapPath = process.argv[3];
if (!snapPath) { process.stderr.write('usage: node work/check.mjs <out-dir> <snapshot.json>\n'); process.exit(2); }

const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const snapSlugs = new Set(snap.protocols.map((p) => p.slug));
const watch = snap.watchlist;

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS ${name} ${detail}`); }
  else { fail++; console.log(`FAIL ${name} ${detail}`); }
}

// 1. dashboard_files
const dashDir = join(out, 'dashboard');
const dashFiles = readdirSync(dashDir).filter((f) => statSync(join(dashDir, f)).isFile());
const dashBytes = dashFiles.reduce((n, f) => n + statSync(join(dashDir, f)).size, 0);
const hasHtml = dashFiles.includes('index.html');
const hasCss = dashFiles.some((f) => f.endsWith('.css'));
const hasJs = dashFiles.some((f) => f.endsWith('.js'));
let badNet = null;
for (const f of dashFiles) {
  const text = readFileSync(join(dashDir, f), 'utf8');
  if (text.includes('https://') || text.includes('http://')) { badNet = f; break; }
}
check('dashboard_files', hasHtml && hasCss && hasJs && dashFiles.length <= 400 && dashBytes <= 4_194_304 && badNet === null,
  `${dashFiles.length} files, ${dashBytes} bytes, html=${hasHtml} css=${hasCss} js=${hasJs}, network-addr=${badNet ?? 'none'}`);

// dashboard source cap
check('dashboard_source_64k', dashBytes <= 65536, `${dashBytes} bytes`);

// 2. board_file + 3. sorted_by_value + 4. coverage + 5. farm_steps
const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
const rows = board.rows;
let boardOk = Array.isArray(rows) && rows.length >= 100 && rows.length <= 4000;
let boardDetail = `${rows.length} rows`;
const seenSlugs = new Set();
let rankOk = true;
let orderOk = true;
let farmOk = true;
let allSame = rows.length >= 2;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (!snapSlugs.has(r.slug) || seenSlugs.has(r.slug) || typeof r.name !== 'string' || !r.name) { boardOk = false; boardDetail += ` bad-row@${i}`; break; }
  seenSlugs.add(r.slug);
  if (r.rank !== i + 1) rankOk = false;
  if (i > 0 && r.implied_value_usd > rows[i - 1].implied_value_usd) orderOk = false;
  if (i > 0 && r.implied_value_usd !== rows[0].implied_value_usd) allSame = false;
  if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) { boardOk = false; boardDetail += ` bad-value@${i}`; break; }
  const steps = r.farm_steps;
  if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) { farmOk = false; boardDetail += ` bad-steps@${i}`; break; }
  for (const s of steps) {
    const t = s.trim();
    if (t.length < 20 || t.length > 600 || !/Cost: /.test(t) || !/Time: /.test(t)) { farmOk = false; boardDetail += ` bad-step-len@${i}`; break; }
  }
  if (!farmOk) break;
}
check('board_file', boardOk, boardDetail);
check('sorted_by_value', rankOk && orderOk && !allSame, `ranks 1..${rows.length}=${rankOk}, non-rising=${orderOk}, all-same=${allSame}`);
const missing = watch.filter((s) => !seenSlugs.has(s));
check('coverage', missing.length === 0, `${watch.length - missing.length}/${watch.length} watchlist covered${missing.length ? ', missing: ' + missing.slice(0, 5).join(',') : ''}`);
check('farm_steps', farmOk, `all rows 3-12 steps of 20-600 chars ending Cost:/Time:`);

// 6. screenshots
const shotDir = join(out, 'screenshots');
const shots = readdirSync(shotDir).filter((f) => !f.startsWith('.'));
let shotsOk = shots.length >= 3 && shots.length <= 4;
let shotDetail = '';
for (const f of shots) {
  const buf = readFileSync(join(shotDir, f));
  const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
  const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
  let w = 0, h = 0;
  if (isPng && buf.length >= 24) { w = buf.readUInt32BE(16); h = buf.readUInt32BE(20); }
  if (isJpg) {
    let i = 2;
    while (i < buf.length - 1) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  const long = Math.max(w, h), short = Math.min(w, h);
  const ok = (isPng || isJpg) && buf.length <= 524_288 && long <= 1440 && short >= 800;
  if (!ok) shotsOk = false;
  shotDetail += `${f} ${buf.length}B ${w}x${h} ${isPng ? 'png' : isJpg ? 'jpg' : '???'}; `;
}
check('screenshots', shotsOk, shotDetail.trim());

// 7. dossier_matches
const dossier = readFileSync(join(out, 'dossier.json'));
const rebuilt = Buffer.from(buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
check('dossier_matches', Buffer.compare(dossier, rebuilt) === 0 && dossier.length <= 1_572_864, `${dossier.length} bytes, byte-identical=${Buffer.compare(dossier, rebuilt) === 0}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
