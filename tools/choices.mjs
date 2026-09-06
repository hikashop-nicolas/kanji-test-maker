// What the multiple-choice generator makes of a word, and why:
//   node tools/choices.mjs 漢字 自転車 花火
//   G=2 MADE=1 node tools/choices.mjs 学校
// G sets the pupil's level (default 4), MADE=1 allows invented characters.
import fs from 'fs';
import path from 'path';
import kuromoji from 'kuromoji';
import { fileURLToPath } from 'url';
import { init, generate, splitReading, choiceText } from '../src/distractors.js';
import { setStrokes, canDraw } from '../src/glyph.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/kanji.json'), 'utf8'));
const P = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/kanji-parts.json'), 'utf8'));
init(K, P);
if (process.env.MADE) setStrokes(JSON.parse(fs.readFileSync(path.join(root, 'assets/data/kanji-strokes.json'), 'utf8')));

const words = process.argv.slice(2);
const G = +(process.env.G || 4), made = !!process.env.MADE;
kuromoji.builder({ dicPath: path.join(root, 'node_modules/kuromoji/dict') }).build((e, tok) => {
  if (e) throw e;
  const isWord = (s) => {
    const t = tok.tokenize(s);
    return t.length === 1 && t[0].word_type === 'KNOWN' && t[0].surface_form === s;
  };
  for (const w of words) {
    const reading = tok.tokenize(w).map(t => (t.reading && t.reading !== '*' ? t.reading : t.surface_form)).join('');
    const split = splitReading(w, reading);
    const { wrong } = generate(w, reading, { maxGrade: G, isWord, made, canDraw, limit: 10 });
    const op = c => { const m = c.cells.find(x => !x.ch); return m ? `作:${m.op}${m.part ? '/' + m.part : ''}` : ''; };
    const tag = c => (c.made ? op(c) : c.sound && c.shape ? '⁑' : c.sound ? '音' : '形');
    console.log(`${w} (${reading})${split ? '' : '  [reading does not split]'}`);
    console.log('   ' + (wrong.map(c => `${choiceText(c)}${tag(c)}`).join('  ') || '(nothing)'));
  }
});
