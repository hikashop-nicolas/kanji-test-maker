// Validate the authored example sentences (the curated, grade-pure supplement).
//
// authored-sentences.json = { "1": ["…", …], "2": […], …, "secondary": […] }
// Each sentence under grade key G must contain ONLY kanji at or below grade G
// (every kanji jouyou, grade <= G; "secondary" allows up to grade 8). This is
// the deterministic curation gate: it guarantees a grade-N worksheet built from
// these sentences never shows an above-grade kanji.
//
// Run:  node tools/validate-authored.mjs [grade]   (grade optional: 1..6 or secondary)
// Exits non-zero if any sentence fails, so it can gate a commit.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const KANJI = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'data', 'kanji.json'), 'utf8'));
const gradeOf = ch => (KANJI[ch] ? KANJI[ch].g : null); // null = not jouyou
const HAN = /\p{Script=Han}/gu;
const MIN_LEN = 4, MAX_LEN = 32;

const authoredPath = path.join(__dirname, 'authored-sentences.json');
if (!fs.existsSync(authoredPath)) { console.error('no authored-sentences.json yet'); process.exit(0); }
const authored = JSON.parse(fs.readFileSync(authoredPath, 'utf8'));

const only = process.argv[2];                 // optional grade to check
const ceil = name => (name === 'secondary' ? 8 : parseInt(name, 10));
const gradeKanji = name => Object.keys(KANJI).filter(c => KANJI[c].g === (name === 'secondary' ? 8 : parseInt(name, 10)));

let failed = 0;
for (const name of Object.keys(authored)) {
  if (name.startsWith('_')) continue;
  if (only && name !== only) continue;
  const G = ceil(name);
  const list = authored[name];
  const seen = new Set();
  const covered = new Set();
  let ok = 0;
  console.log(`\n=== grade ${name} (ceiling ${G}) — ${list.length} sentences ===`);
  for (const t of list) {
    const problems = [];
    const len = [...t].length;
    if (len < MIN_LEN || len > MAX_LEN) problems.push(`length ${len}`);
    if (/[A-Za-z]/.test(t)) problems.push('latin text');
    if (seen.has(t)) problems.push('duplicate'); else seen.add(t);
    const kanji = [...new Set(t.match(HAN) || [])];
    if (!kanji.length) problems.push('no kanji');
    const over = kanji.filter(c => { const g = gradeOf(c); return g == null || g > G; });
    if (over.length) problems.push('above grade: ' + over.map(c => `${c}(${gradeOf(c) ?? '×'})`).join(' '));
    if (problems.length) { failed++; console.log(`  ✗ ${t}  — ${problems.join('; ')}`); }
    else { ok++; kanji.forEach(c => covered.add(c)); }
  }
  const target = gradeKanji(name);
  const miss = target.filter(c => !covered.has(c));
  console.log(`  ok ${ok}/${list.length}; grade-${name} kanji covered ${target.length - miss.length}/${target.length}`);
  if (miss.length) console.log(`  uncovered grade-${name} kanji (${miss.length}): ${miss.join(' ')}`);
}
if (failed) { console.error(`\n${failed} sentence(s) failed validation`); process.exit(1); }
console.log('\nall authored sentences valid');
