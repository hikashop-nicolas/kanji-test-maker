// Build the word lists the multiple-choice picker offers.
//
// A choice sheet tests words, not sentences, so it needs a list of words per
// kanji rather than the sentence index. Rather than a new source, the words are
// taken out of the corpus already built for the sentence picker: tokenize every
// example sentence of a kanji and keep the words that contain it, commonest
// first. A word a teacher recognises from the corpus is a word the corpus can
// also illustrate, so the two stay in step.
//
// Dropped: conjugated forms (通っ, 教え, which are the same word bent by
// grammar), proper nouns, anything with a kanji outside the app's set, and
// anything over four characters.
//
// Output: assets/data/lesson-words/grade-{1..6,secondary}.json
//         each = { "記": [["日記","ニッキ"], ...], ... }
//
// Run:  node tools/build-words.mjs   (after build-sentences.mjs)
import fs from 'fs';
import path from 'path';
import kuromoji from 'kuromoji';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'assets', 'data', 'lesson-kanji');
const outDir = path.join(root, 'assets', 'data', 'lesson-words');
const GRADES = ['1', '2', '3', '4', '5', '6', 'secondary'];
const PER_KANJI = 30;          // words offered per kanji
const MAX_LEN = 4;             // characters

const K = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'data', 'kanji.json'), 'utf8'));
const HAN = /\p{Script=Han}/u;
const CLEAN = /^[\p{Script=Han}ぁ-ゖァ-ヴー]+$/u;

const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: path.join(root, 'node_modules', 'kuromoji', 'dict') })
    .build((err, tok) => (err ? reject(err) : resolve(tok)));
});

fs.mkdirSync(outDir, { recursive: true });
let totalWords = 0, totalBytes = 0;
for (const g of GRADES) {
  const data = JSON.parse(fs.readFileSync(path.join(srcDir, `grade-${g}.json`), 'utf8'));
  const out = {};
  for (const [kanji, rows] of Object.entries(data)) {
    const count = new Map();
    for (const [text] of rows) {
      for (const t of tokenizer.tokenize(text)) {
        const s = t.surface_form;
        if (!s.includes(kanji) || s.length > MAX_LEN || !CLEAN.test(s)) continue;
        if (!t.reading || t.reading === '*') continue;
        if (t.pos_detail_1 === '固有名詞') continue;
        // a verb or adjective written in a bent form is the same word, and the
        // sheet should test the word
        if ((t.pos === '動詞' || t.pos === '形容詞') && s !== t.basic_form) continue;
        if ([...s].some(c => HAN.test(c) && !K[c])) continue;
        const key = s + '\t' + t.reading;
        count.set(key, (count.get(key) || 0) + 1);
      }
    }
    const words = [...count.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
      .slice(0, PER_KANJI)
      .map(([key]) => key.split('\t'));
    if (words.length) out[kanji] = words;
  }
  const json = JSON.stringify(out);
  fs.writeFileSync(path.join(outDir, `grade-${g}.json`), json);
  const n = Object.values(out).reduce((a, b) => a + b.length, 0);
  totalWords += n; totalBytes += json.length;
  console.log(`grade-${g}.json  ${String(Object.keys(out).length).padStart(4)} kanji  ${String(n).padStart(5)} words  ${(json.length / 1024).toFixed(0)} KB`);
}
console.log(`total ${totalWords} words, ${(totalBytes / 1024).toFixed(0)} KB`);
