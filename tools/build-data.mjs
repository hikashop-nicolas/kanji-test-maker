// Build the kanji index the lesson picker uses.
//
// Source: KANJIDIC2 (EDRDG, CC BY-SA 4.0). We extract only the jouyou kanji
// (grades 1-6 and the "secondary" grade-8 set) with the fields the picker
// needs: grade, stroke count, classical radical, on/kun readings, meanings.
//
// Output: assets/data/kanji.json, a flat map  literal -> { g, s, rad, on, kun, mean }
// kept small (~2,100 entries) so the static app loads it once.
//
// Run:  node tools/build-data.mjs   (downloads + caches KANJIDIC2 on first run)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const cacheDir = path.join(__dirname, 'data-cache');
const outDir = path.join(root, 'assets', 'data');
const KANJIDIC_URL = 'https://www.edrdg.org/kanjidic/kanjidic2.xml.gz';

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

function parseKanji(xml) {
  const blocks = xml.split('<character>').slice(1);
  const map = {};
  for (const b of blocks) {
    const grade = parseInt((b.match(/<grade>(\d+)<\/grade>/) || [])[1], 10);
    if (!KEEP_GRADES.has(grade)) continue;
    const literal = (b.match(/<literal>(.+?)<\/literal>/) || [])[1];
    if (!literal) continue;
    const strokes = parseInt((b.match(/<stroke_count>(\d+)<\/stroke_count>/) || [])[1], 10);
    const rad = parseInt(
      (b.match(/<rad_value rad_type="classical">(\d+)<\/rad_value>/) || [])[1], 10);
    // on = katakana, kun = hiragana (kept with the . / - okurigana markers).
    const on = all(b, 'reading', a => /r_type="ja_on"/.test(a));
    const kun = all(b, 'reading', a => /r_type="ja_kun"/.test(a));
    // English meanings only (entries with no m_lang attribute).
    const mean = all(b, 'meaning', a => !/m_lang=/.test(a)).slice(0, 4);
    map[literal] = { g: grade, s: strokes || 0, rad: rad || 0, on, kun, mean };
  }
  return map;
}

const xml = await ensureKanjidic();
const map = parseKanji(xml);

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'kanji.json');
fs.writeFileSync(outPath, JSON.stringify(map));

// report
const byGrade = {};
for (const k in map) byGrade[map[k].g] = (byGrade[map[k].g] || 0) + 1;
console.log(`wrote ${outPath}  (${Object.keys(map).length} kanji, ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
console.log('by grade:', JSON.stringify(byGrade));
