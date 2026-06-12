// Build the example-sentence index the lesson picker ranks.
//
// Source: Tatoeba Japanese sentences (CC BY 2.0 FR). To raise quality we keep
// only sentences whose AUTHOR is a native/fluent Japanese speaker (self-rated
// skill 4-5 in user_languages) OR that have recorded audio (a strong vetting
// signal); other sentences (intermediate/beginner/unknown authors, no audio)
// are dropped. Native + audio sentences are ranked first. Within that, we keep
// only sentences whose every kanji is jouyou (so each is gradeable and
// readable), within length bounds, with no embedded latin text.
//
// A relaxed fallback pass (any author) fills the few rare kanji that no
// quality-gated sentence covers, so the picker still has 1-2 examples.
//
// The index is grouped by the GRADE OF THE KANJI: selecting a grade in the app
// loads one file, and each kanji in it already carries its candidate sentences.
// Per kanji we keep up to PER_KANJI candidates (best quality first, then lowest
// max-grade, then shortest); the browser re-scores them with the lesson context.
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
const BASE = 'https://downloads.tatoeba.org/exports';
const DETAILED_URL = `${BASE}/per_language/jpn/jpn_sentences_detailed.tsv.bz2`;
const USERLANG_URL = `${BASE}/user_languages.tar.bz2`;
const AUDIO_URL = `${BASE}/sentences_with_audio.tar.bz2`;

const KANJI_RE = /\p{Script=Han}/gu;  // includes supplementary-plane kanji (e.g. 𠮟)
const MIN_LEN = 5, MAX_LEN = 30;   // Japanese chars
const PER_KANJI = 60;              // candidate sentences kept per kanji
const MIN_LEVEL = 4;               // keep authors self-rated >= fluent (4) or native (5)

// download + decompress a .bz2 to `out` (cached)
function ensureBz2(url, out) {
  const dst = path.join(cacheDir, out);
  if (fs.existsSync(dst)) return dst;
  const bz2 = dst + '.bz2';
  console.log('downloading', path.basename(url), '...');
  execSync(`curl -sL "${url}" -o "${bz2}"`);
  execSync(`bunzip2 -kf "${bz2}"`);
  return dst;
}
// download + extract a single member from a .tar.bz2 (cached)
function ensureTarBz2(url, member) {
  const dst = path.join(cacheDir, member);
  if (fs.existsSync(dst)) return dst;
  const tar = path.join(cacheDir, path.basename(url));
  console.log('downloading', path.basename(url), '...');
  execSync(`curl -sL "${url}" -o "${tar}"`);
  execSync(`tar -xjf "${tar}" -C "${cacheDir}" "${member}"`);
  return dst;
}

fs.mkdirSync(cacheDir, { recursive: true });
const detailedTsv = ensureBz2(DETAILED_URL, 'jpn_sentences_detailed.tsv');
const userLangCsv = ensureTarBz2(USERLANG_URL, 'user_languages.csv');
const audioCsv = ensureTarBz2(AUDIO_URL, 'sentences_with_audio.csv');

// username -> best self-rated Japanese skill level (5 native .. 0 none)
const jpnLevel = new Map();
for (const line of fs.readFileSync(userLangCsv, 'utf8').split('\n')) {
  const c = line.split('\t');
  if (c[0] !== 'jpn') continue;
  const lvl = parseInt(c[1], 10);
  if (Number.isNaN(lvl)) continue;            // '\N' / blank = unspecified
  const user = c[2];
  if (!jpnLevel.has(user) || lvl > jpnLevel.get(user)) jpnLevel.set(user, lvl);
}
console.log(`jpn speakers rated: ${jpnLevel.size}`);

// sentence ids that have recorded audio (a strong quality signal)
const audioIds = new Set();
for (const line of fs.readFileSync(audioCsv, 'utf8').split('\n')) {
  const id = line.slice(0, line.indexOf('\t'));
  if (id) audioIds.add(id);
}
console.log(`sentences with audio: ${audioIds.size}`);

const KANJI = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'data', 'kanji.json'), 'utf8'));
const gradeOf = ch => (KANJI[ch] ? KANJI[ch].g : null); // null = not jouyou

const lines = fs.readFileSync(detailedTsv, 'utf8').split('\n');

// index[kanji] = [{ t, k, mg, len, q }]   q = quality rank (higher = better)
const index = {};
let kept = 0, total = 0;
const seen = new Set();

// parse one detailed line -> { id, text, q } or null if it fails the gate.
// q: native author = 3, fluent = 2; +1 if it has audio (so audio'd native = 4).
function gate(line) {
  const c = line.split('\t');
  if (c.length < 4) return null;
  const id = c[0], text = (c[2] || '').trim(), user = c[3];
  if (!text) return null;
  const lvl = jpnLevel.get(user);
  const audio = audioIds.has(id);
  if (!((lvl != null && lvl >= MIN_LEVEL) || audio)) return null; // author/audio gate
  const q = (lvl === 5 ? 3 : lvl === 4 ? 2 : 0) + (audio ? 1 : 0);
  return { id, text, q };
}

for (const line of lines) {
  const g = gate(line);
  if (!g) continue;
  total++;
  const { text, q } = g;

  const len = [...text].length;
  if (len < MIN_LEN || len > MAX_LEN) continue;
  if (/[A-Za-z]/.test(text)) continue;        // skip embedded romaji / English
  if (seen.has(text)) continue;

  const kanji = text.match(KANJI_RE);
  if (!kanji || !kanji.length) continue;

  const set = [...new Set(kanji)];
  let maxGrade = 0, ok = true;
  for (const ch of set) {
    const gr = gradeOf(ch);
    if (gr == null) { ok = false; break; }    // every kanji must be jouyou
    if (gr > maxGrade) maxGrade = gr;
  }
  if (!ok) continue;

  seen.add(text);
  kept++;
  const rec = { t: text, k: set.join(''), mg: maxGrade, len, q };
  for (const ch of set) (index[ch] = index[ch] || []).push(rec);
}

// Authored supplement: original sentences for rare kanji with no Tatoeba
// example. Ranked above everything (q = 9) so they lead when present.
const manualPath = path.join(__dirname, 'manual-sentences.json');
if (fs.existsSync(manualPath)) {
  const manual = JSON.parse(fs.readFileSync(manualPath, 'utf8'));
  let n = 0;
  for (const ch of Object.keys(manual)) {
    if (ch.startsWith('_') || !KANJI[ch]) continue;
    for (const t of manual[ch]) {
      const set = [...new Set(t.match(KANJI_RE) || [])];
      (index[ch] = index[ch] || []).push({ t, k: set.join(''), mg: KANJI[ch].g, len: [...t].length, q: 9 });
      n++;
    }
  }
  console.log(`merged ${n} authored sentences from manual-sentences.json`);
}

// Fallback pass: a few rare kanji never appear in a quality-gated sentence. For
// those, relax to ANY author, allow up to one non-jouyou kanji and a longer
// sentence, so the picker still has 1-2 examples.
const empty = new Set(Object.keys(KANJI).filter(ch => KANJI[ch].g != null && !index[ch]));
if (empty.size) {
  const RELAX_MAX = 40, RELAX_NEED = 2;
  for (const line of lines) {
    if (!empty.size) break;
    const c = line.split('\t');
    if (c.length < 3) continue;
    const text = (c[2] || '').trim();
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
    for (const ch of set) { const gr = gradeOf(ch); if (gr == null) nonJouyou++; else if (gr > maxGrade) maxGrade = gr; }
    if (nonJouyou > 1) continue;                 // at most one out-of-list kanji
    seen.add(text);
    const rec = { t: text, k: set.join(''), mg: maxGrade || 8, len, q: -1 };
    for (const ch of targets) {
      (index[ch] = index[ch] || []).push(rec);
      if (index[ch].length >= RELAX_NEED) empty.delete(ch);
    }
  }
}

// per kanji: best quality first, then easiest (low max-grade), then shortest
fs.mkdirSync(outDir, { recursive: true });
const groups = {}; // gradeName -> { kanji: [[t,k],...] }
let withCandidates = 0;
for (const ch of Object.keys(index)) {
  const g = gradeOf(ch);
  const name = g === 8 ? 'secondary' : String(g);
  let arr = index[ch];
  arr.sort((a, b) => b.q - a.q || a.mg - b.mg || a.len - b.len || a.t.localeCompare(b.t));
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

console.log(`kept ${kept} quality-gated sentences; kanji with >=1 candidate ${withCandidates}/2136`);
console.table(report);
