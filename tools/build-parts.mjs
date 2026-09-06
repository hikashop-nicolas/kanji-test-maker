// Build the component and stroke data the multiple-choice sheets need.
//
// Source: KanjiVG (CC BY-SA 3.0), which gives every kanji as an ordered list of
// stroke paths grouped by component, each group tagged with what it is
// (kvg:element) and where it sits (kvg:position). Two files come out of it:
//
//   assets/data/kanji-parts.json    { 漢: [["氵","left"],["𦰩","right"]], ... }
//     small, loaded with the app: it drives the shape-based wrong answers
//     (which kanji are the same but for one component) and decides which
//     fabrication suits a kanji.
//
//   assets/data/kanji-strokes.json  { 漢: { s: [path...], g: [[el,pos,at,n]] } }
//     ~2 MB, fetched only when a sheet invents characters: the strokes to draw,
//     and which of them belong to each top-level component.
//
// Only the kanji in assets/data/kanji.json are kept (KANJIDIC's jouyou + JLPT
// set), which KanjiVG covers completely.
//
// Run:  node tools/build-parts.mjs   (downloads + caches KanjiVG on first run)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const cacheDir = path.join(__dirname, 'data-cache');
const outDir = path.join(root, 'assets', 'data');
const KANJIVG_URL = 'https://github.com/KanjiVG/kanjivg/releases/download/r20250816/kanjivg-20250816.xml.gz';

async function ensureKanjiVG() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const p = path.join(cacheDir, 'kanjivg.xml');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  console.log('downloading KanjiVG ...');
  const res = await fetch(KANJIVG_URL);
  if (!res.ok) throw new Error(`KanjiVG download failed: ${res.status}`);
  const xml = zlib.gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8');
  fs.writeFileSync(p, xml);
  console.log(`cached ${p} (${(xml.length / 1e6).toFixed(1)} MB)`);
  return xml;
}

// Every <path> of a kanji, in writing order.
function strokesOf(block) {
  return [...block.matchAll(/<path id="([^"]+)"[^>]* d="([^"]+)"/g)].map(m => ({ id: m[1], d: m[2] }));
}

// The depth-1 groups of a kanji: what it is made of at the top level. A group
// with neither element nor phon (a bare grouping) is reported as '?', which
// makes the kanji ineligible rather than silently wrong.
function topGroups(block, strokes) {
  const index = new Map(strokes.map((s, i) => [s.id, i]));
  const tags = [...block.matchAll(/<(\/?)g\b([^>]*)>|<path id="([^"]+)"/g)];
  const out = [];
  let depth = 0, cur = null;
  for (const m of tags) {
    if (m[3]) { if (cur) cur.ids.push(index.get(m[3])); continue; }
    if (m[1]) { depth--; if (depth === 1 && cur) { out.push(cur); cur = null; } continue; }
    depth++;
    if (depth !== 2) continue;                       // depth 1 is the kanji itself
    const el = /kvg:element="([^"]+)"/.exec(m[2]) || /kvg:phon="([^"]+)"/.exec(m[2]);
    const pos = /kvg:position="([^"]+)"/.exec(m[2]);
    cur = { el: el ? el[1] : '?', pos: pos ? pos[1] : '', ids: [] };
  }
  if (cur) out.push(cur);
  // strokes have to be contiguous for the [at, n] form; KanjiVG writes them in
  // order, so this only guards against a malformed entry
  return out.filter(g => g.ids.length && g.ids[g.ids.length - 1] - g.ids[0] === g.ids.length - 1);
}

const xml = await ensureKanjiVG();
const K = JSON.parse(fs.readFileSync(path.join(outDir, 'kanji.json'), 'utf8'));

const parts = {}, strokes = {};
let seen = 0, missing = [];
const re = /<kanji id="kvg:kanji_([0-9a-f]+)">([\s\S]*?)<\/kanji>/g;
const blocks = new Map();
let m;
while ((m = re.exec(xml))) {
  const ch = String.fromCodePoint(parseInt(m[1], 16));
  if (!blocks.has(ch)) blocks.set(ch, m[2]);        // the first entry is the plain form
}
for (const ch of Object.keys(K)) {
  const block = blocks.get(ch);
  if (!block) { missing.push(ch); continue; }
  seen++;
  const ss = strokesOf(block);
  const gs = topGroups(block, ss);
  if (gs.length > 1 && !gs.some(g => g.el === '?')) parts[ch] = gs.map(g => [g.el, g.pos]);
  strokes[ch] = {
    s: ss.map(s => s.d),
    g: gs.map(g => [g.el, g.pos, g.ids[0], g.ids.length]),
  };
}

fs.mkdirSync(outDir, { recursive: true });
const pj = JSON.stringify(parts), sj = JSON.stringify(strokes);
fs.writeFileSync(path.join(outDir, 'kanji-parts.json'), pj);
fs.writeFileSync(path.join(outDir, 'kanji-strokes.json'), sj);
console.log(`kanji-parts.json   ${Object.keys(parts).length} kanji with a component split, ${(pj.length / 1024).toFixed(0)} KB`);
console.log(`kanji-strokes.json ${Object.keys(strokes).length} kanji, ${(sj.length / 1e6).toFixed(1)} MB`);
if (missing.length) console.log(`no KanjiVG entry for ${missing.length}: ${missing.slice(0, 20).join('')}`);
