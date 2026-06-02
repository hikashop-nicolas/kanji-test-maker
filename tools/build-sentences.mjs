// Build the example-sentence index the lesson picker ranks.
//
// Source: Tatoeba Japanese sentences (CC BY 2.0 FR). We keep only sentences
// whose every kanji is jouyou (so each is gradeable and readable), within
// length bounds, no embedded latin text.
//
// The index is grouped by the GRADE OF THE KANJI: selecting a grade in the app
// loads one file, and each kanji in it already carries its candidate sentences.
// Per kanji we keep up to PER_KANJI easiest sentences (lowest max-grade, then
// shortest); the browser re-scores them with the actual lesson context.
//
// Output: assets/data/lesson-kanji/grade-{1..6,secondary}.json
//         each = { "漢": [[text, "kanjiset"], ...], ... }
//
// Run:  node tools/build-data.mjs && node tools/build-sentences.mjs
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const cacheDir = path.join(__dirname, 'data-cache');
const outDir = path.join(root, 'assets', 'data', 'lesson-kanji');
const TATOEBA_URL = 'https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences.tsv.bz2';

const KANJI_RE = /\p{Script=Han}/gu;  // includes supplementary-plane kanji (e.g. 𠮟)
const MIN_LEN = 5, MAX_LEN = 30;   // Japanese chars
const PER_KANJI = 60;              // candidate sentences kept per kanji

function ensureTatoeba() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const tsv = path.join(cacheDir, 'jpn_sentences.tsv');
  if (fs.existsSync(tsv)) return tsv;
  const bz2 = path.join(cacheDir, 'jpn_sentences.tsv.bz2');
  console.log('downloading Tatoeba jpn sentences ...');
  execSync(`curl -sL "${TATOEBA_URL}" -o "${bz2}"`);
  execSync(`bunzip2 -kf "${bz2}"`);
  console.log(`cached ${tsv}`);
  return tsv;
}

const KANJI = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'data', 'kanji.json'), 'utf8'));
const gradeOf = ch => (KANJI[ch] ? KANJI[ch].g : null); // null = not jouyou

const tsv = ensureTatoeba();
const lines = fs.readFileSync(tsv, 'utf8').split('\n');

// index[kanji] = [{ t, k, mg, len }]
const index = {};
let kept = 0, total = 0;
const seen = new Set();

for (const line of lines) {
  const tab2 = line.indexOf('\t', line.indexOf('\t') + 1);
  if (tab2 < 0) continue;
  const text = line.slice(tab2 + 1).trim();
  if (!text) continue;
  total++;

  const len = [...text].length;
  if (len < MIN_LEN || len > MAX_LEN) continue;
  if (/[A-Za-z]/.test(text)) continue;        // skip embedded romaji / English
  if (seen.has(text)) continue;

  const kanji = text.match(KANJI_RE);
  if (!kanji || !kanji.length) continue;

  const set = [...new Set(kanji)];
  let maxGrade = 0, ok = true;
  for (const ch of set) {
    const g = gradeOf(ch);
    if (g == null) { ok = false; break; }     // every kanji must be jouyou
    if (g > maxGrade) maxGrade = g;
  }
  if (!ok) continue;

  seen.add(text);
  kept++;
  const rec = { t: text, k: set.join(''), mg: maxGrade, len };
  for (const ch of set) (index[ch] = index[ch] || []).push(rec);
}

// Authored supplement: original sentences for rare kanji with no Tatoeba
// example. Merged first so those kanji are covered before the relaxed fallback.
const manualPath = path.join(__dirname, 'manual-sentences.json');
if (fs.existsSync(manualPath)) {
  const manual = JSON.parse(fs.readFileSync(manualPath, 'utf8'));
  let n = 0;
  for (const ch of Object.keys(manual)) {
    if (ch.startsWith('_') || !KANJI[ch]) continue;
    for (const t of manual[ch]) {
      const set = [...new Set(t.match(KANJI_RE) || [])];
      (index[ch] = index[ch] || []).push({ t, k: set.join(''), mg: KANJI[ch].g, len: [...t].length });
      n++;
    }
  }
  console.log(`merged ${n} authored sentences from manual-sentences.json`);
}

// Fallback pass: a few rare (secondary) kanji never appear in a sentence that
// passes the strict filters. For those, relax to allow up to one non-jouyou
// kanji and a longer sentence, so the picker still has 1-2 examples.
const empty = new Set(Object.keys(KANJI).filter(ch => !index[ch]));
if (empty.size) {
  const RELAX_MAX = 40, RELAX_NEED = 2;
  for (const line of lines) {
    if (![...empty].some(() => true)) break;
    const tab2 = line.indexOf('\t', line.indexOf('\t') + 1);
    if (tab2 < 0) continue;
    const text = line.slice(tab2 + 1).trim();
    if (!text || seen.has(text)) continue;
    const len = [...text].length;
    if (len < MIN_LEN || len > RELAX_MAX) continue;
    if (/[A-Za-z]/.test(text)) continue;
    const kanji = text.match(KANJI_RE);
    if (!kanji) continue;
    const set = [...new Set(kanji)];
    const targets = set.filter(ch => empty.has(ch) && (index[ch] || []).length < RELAX_NEED);
    if (!targets.length) continue;
    let nonJouyou = 0, maxGrade = 0;
    for (const ch of set) { const g = gradeOf(ch); if (g == null) nonJouyou++; else if (g > maxGrade) maxGrade = g; }
    if (nonJouyou > 1) continue;                 // at most one out-of-list kanji
    seen.add(text);
    const rec = { t: text, k: set.join(''), mg: maxGrade || 8, len };
    for (const ch of targets) {
      (index[ch] = index[ch] || []).push(rec);
      if (index[ch].length >= RELAX_NEED) empty.delete(ch);
    }
  }
}

// per kanji: prefer easiest (low max-grade) then shortest, cap, store [t, k]
fs.mkdirSync(outDir, { recursive: true });
const groups = {}; // gradeName -> { kanji: [[t,k],...] }
let withCandidates = 0;
for (const ch of Object.keys(index)) {
  const g = gradeOf(ch);
  const name = g === 8 ? 'secondary' : String(g);
  let arr = index[ch];
  arr.sort((a, b) => a.mg - b.mg || a.len - b.len || a.t.localeCompare(b.t));
  arr = arr.slice(0, PER_KANJI).map(s => [s.t, s.k]);
  (groups[name] = groups[name] || {})[ch] = arr;
  if (arr.length) withCandidates++;
}

const report = {};
for (const name of Object.keys(groups)) {
  const file = path.join(outDir, `grade-${name}.json`);
  fs.writeFileSync(file, JSON.stringify(groups[name]));
  report[name] = { kanji: Object.keys(groups[name]).length, kb: +(fs.statSync(file).size / 1024).toFixed(0) };
}

console.log(`scanned ${total}, kept ${kept}, kanji with >=1 candidate ${withCandidates}/2136`);
console.table(report);
