// Example-sentence scoring + candidate building for the lesson picker.
// Pure logic (no DOM, no tokenizer). The scorer implements the i+1 ranking
// agreed in plan.md 10.5: reward kanji the student already knows, penalise
// kanji from grades above the lesson, weighted by grade distance.

import { gradeOf } from './lesson.js?v=2';

const FILE = name => `assets/data/lesson-kanji/grade-${name}.json`;
const gradeFileName = g => (g === 8 ? 'secondary' : String(g));
const cache = {}; // name -> index object

async function loadIndex(name) {
  if (cache[name]) return cache[name];
  try {
    const res = await fetch(FILE(name));
    if (res.ok) { cache[name] = await res.json(); return cache[name]; }
  } catch (e) { /* transient failure: fall through */ }
  // do NOT cache a failed load, so a later search retries instead of being
  // stuck returning 0 sentences for everything in this grade.
  return {};
}

// Score one sentence given its text, kanji set, the lesson set, the baseline
// level G, and levelOf (school grade by default, or JLPT difficulty in JLPT
// mode). The i+1 ranking: reward kanji the student already knows, penalise
// kanji above the lesson level, weighted by distance; then a readability
// counterweight (kana ratio, kanji-run penalty, length).
export function scoreSentence(text, kanjiSet, lessonSet, G, levelOf = gradeOf) {
  let score = 0;
  for (const j of kanjiSet) {
    if (lessonSet.has(j)) { score += 4; continue; }
    const g = levelOf(j);
    if (g != null && g <= G) score += Math.max(1, 3 - (G - g));
    else score += -5 * (((g != null) ? g : (G + 3)) - G);
  }
  const chars = [...text];
  const len = chars.length;
  const kana = (text.match(/[ぁ-ん]/g) || []).length;
  score += 2 * (kana / Math.max(1, len));        // kana ratio: easier reading
  let run = 0;
  for (const c of chars) {                        // penalise 3+ kanji in a row
    if (/\p{Script=Han}/u.test(c)) { run++; if (run >= 3) score -= 1.5; }
    else run = 0;
  }
  return score - 0.08 * len;
}

// bigram Jaccard similarity, for dropping near-duplicate candidates.
function bigrams(s) {
  const a = [...s], g = new Set();
  for (let i = 0; i < a.length - 1; i++) g.add(a[i] + a[i + 1]);
  return g;
}
function similar(aSet, bSet, th = 0.6) {
  let inter = 0;
  for (const x of aSet) if (bSet.has(x)) inter++;
  return inter / (aSet.size + bSet.size - inter || 1) >= th;
}

// Does the sentence stay within the level ceiling (no kanji above G)?
export function withinLevel(kanjiSet, G, levelOf = gradeOf) {
  for (const j of kanjiSet) {
    const g = levelOf(j);
    if (g == null || g > G) return false;
  }
  return true;
}

// Build ranked candidates per selected lesson kanji.
//   lessonKanji: array of chosen kanji (non-jouyou ones have no sentences)
//   G: baseline level (number, in the scale of opts.levelOf)
//   opts: { hideAboveLevel, perKanji, levelOf } (levelOf defaults to school grade)
// returns [{ kanji, sentences: [{ t, k, score }] }] in lessonKanji order.
export async function buildCandidates(lessonKanji, G, opts = {}) {
  const perKanji = opts.perKanji || 20;
  const levelOf = opts.levelOf || gradeOf;
  const lessonSet = new Set(lessonKanji);

  // load the one index file per distinct grade among the chosen kanji
  const names = new Set();
  for (const ch of lessonKanji) { const g = gradeOf(ch); if (g != null) names.add(gradeFileName(g)); }
  const indices = {};
  await Promise.all([...names].map(async n => { indices[n] = await loadIndex(n); }));

  const out = [];
  for (const ch of lessonKanji) {
    const g = gradeOf(ch);
    if (g == null) { out.push({ kanji: ch, sentences: [], note: 'jouyou外' }); continue; }
    const pool = indices[gradeFileName(g)][ch] || [];
    let rows = pool.map(([t, k]) => ({ t, k, score: scoreSentence(t, k, lessonSet, G, levelOf) }));
    if (opts.hideAboveLevel) rows = rows.filter(r => withinLevel(r.k, G, levelOf));
    rows.sort((a, b) => b.score - a.score);
    // greedily keep the top, skipping near-duplicates of already-kept sentences
    const kept = [], sigs = [];
    for (const r of rows) {
      const sig = bigrams(r.t);
      if (sigs.some(s => similar(sig, s))) continue;
      kept.push(r); sigs.push(sig);
      if (kept.length >= perKanji) break;
    }
    out.push({ kanji: ch, sentences: kept });
  }
  return out;
}
