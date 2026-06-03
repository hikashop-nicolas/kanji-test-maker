// Build the kanji index the lesson picker uses.
//
// Sources: KANJIDIC2 (EDRDG, CC BY-SA 4.0) for grade / stroke count / classical
// radical / on-kun readings / meanings; davidluzgouveia/kanji-data (MIT) for the
// reconstructed JLPT level (jlpt_new, N5..N1). We keep every jouyou kanji plus
// any kanji that carries a JLPT level (so the N5..N1 lists are complete).
//
// Output: assets/data/kanji.json, a flat map
//   literal -> { g, s, rad, on, kun, mean, j }   (g = school grade or null;
//   j = JLPT N number 5..1, omitted when none)
//
// Run:  node tools/build-data.mjs   (downloads + caches the sources on first run)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const cacheDir = path.join(__dirname, 'data-cache');
const outDir = path.join(root, 'assets', 'data');
const KANJIDIC_URL = 'https://www.edrdg.org/kanjidic/kanjidic2.xml.gz';
const KANJIDATA_URL = 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json';

// Grades we keep. 1-6 = kyouiku (taught per school year); 8 = the remaining
// jouyou learned in secondary school. 9/10 are jinmeiyou (names), out of scope.
const KEEP_GRADES = new Set([1, 2, 3, 4, 5, 6, 8]);

async function ensureKanjidic() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const xmlPath = path.join(cacheDir, 'kanjidic2.xml');
  if (fs.existsSync(xmlPath)) return fs.readFileSync(xmlPath, 'utf8');
  console.log('downloading KANJIDIC2 ...');
  const res = await fetch(KANJIDIC_URL);
  if (!res.ok) throw new Error(`KANJIDIC2 download failed: ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  const xml = zlib.gunzipSync(gz).toString('utf8');
  fs.writeFileSync(xmlPath, xml);
  console.log(`cached ${xmlPath} (${(xml.length / 1e6).toFixed(1)} MB)`);
  return xml;
}

// Pull every <tag>...</tag> body, optionally filtered by an attribute match.
function all(block, tag, attrTest) {
  const re = new RegExp(`<${tag}([^>]*)>([^<]*)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(block))) {
    if (!attrTest || attrTest(m[1])) out.push(m[2]);
  }
  return out;
}

async function ensureKanjiData() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const p = path.join(cacheDir, 'kanji-data.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  console.log('downloading kanji-data (JLPT levels) ...');
  const res = await fetch(KANJIDATA_URL);
  if (!res.ok) throw new Error(`kanji-data download failed: ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(p, text);
  return JSON.parse(text);
}

function parseKanji(xml, jlpt) {
  const blocks = xml.split('<character>').slice(1);
  const map = {};
  for (const b of blocks) {
    const literal = (b.match(/<literal>(.+?)<\/literal>/) || [])[1];
    if (!literal) continue;
    const grade = parseInt((b.match(/<grade>(\d+)<\/grade>/) || [])[1], 10);
    const j = jlpt[literal] && jlpt[literal].jlpt_new; // N number 5..1, or undefined
    // keep jouyou kanji and any kanji that carries a JLPT level
    if (!KEEP_GRADES.has(grade) && !j) continue;
    const strokes = parseInt((b.match(/<stroke_count>(\d+)<\/stroke_count>/) || [])[1], 10);
    const rad = parseInt(
      (b.match(/<rad_value rad_type="classical">(\d+)<\/rad_value>/) || [])[1], 10);
    // on = katakana, kun = hiragana (kept with the . / - okurigana markers).
    const on = all(b, 'reading', a => /r_type="ja_on"/.test(a));
    const kun = all(b, 'reading', a => /r_type="ja_kun"/.test(a));
    // English meanings only (entries with no m_lang attribute).
    const mean = all(b, 'meaning', a => !/m_lang=/.test(a)).slice(0, 4);
    const entry = { g: KEEP_GRADES.has(grade) ? grade : null, s: strokes || 0, rad: rad || 0, on, kun, mean };
    if (j) entry.j = j;
    map[literal] = entry;
  }
  return map;
}

const xml = await ensureKanjidic();
const jlpt = await ensureKanjiData();
const map = parseKanji(xml, jlpt);

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'kanji.json');
fs.writeFileSync(outPath, JSON.stringify(map));

// report
const byGrade = {};
const byJlpt = {};
for (const k in map) {
  byGrade[map[k].g] = (byGrade[map[k].g] || 0) + 1;
  if (map[k].j) byJlpt['N' + map[k].j] = (byJlpt['N' + map[k].j] || 0) + 1;
}
console.log(`wrote ${outPath}  (${Object.keys(map).length} kanji, ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
console.log('by grade:', JSON.stringify(byGrade));
console.log('by JLPT:', JSON.stringify(byJlpt));
