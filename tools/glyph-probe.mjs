// Draw the invented characters the generator proposes, so they can be looked at:
//   node tools/glyph-probe.mjs 川 花火 漢字   ->  tools/glyph-probe.html
// G sets the pupil's level (default 2). Each row is the real word, then the
// invented spellings, at worksheet size.
import fs from 'fs';
import path from 'path';
import kuromoji from 'kuromoji';
import { fileURLToPath } from 'url';
import { init, generate } from '../src/distractors.js';
import { setStrokes, cellSvg, canDraw } from '../src/glyph.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
init(read('assets/data/kanji.json'), read('assets/data/kanji-parts.json'));
setStrokes(read('assets/data/kanji-strokes.json'));

const words = process.argv.slice(2);
const G = +(process.env.G || 2);
kuromoji.builder({ dicPath: path.join(root, 'node_modules/kuromoji/dict') }).build((e, tok) => {
  if (e) throw e;
  const isWord = (s) => {
    const t = tok.tokenize(s);
    return t.length === 1 && t[0].word_type === 'KNOWN' && t[0].surface_form === s;
  };
  const cell = (c) => (c.ch ? c.ch : cellSvg(c, { style: 'vertical-align:-.12em' }) || '<b style="color:#c00">×</b>');
  const box = (c, tag) => `<span style="display:inline-flex;align-items:center;border:1px solid ${tag ? '#e0b4b4' : '#ccc'};
    border-radius:5px;padding:2px 6px;font-size:30px;white-space:nowrap;background:${tag ? '#fff8f8' : '#fff'}">${c.cells.map(cell).join('')}</span>`;
  const rows = [];
  for (const w of words) {
    const reading = tok.tokenize(w).map(t => (t.reading && t.reading !== '*' ? t.reading : t.surface_form)).join('');
    const { answer, wrong } = generate(w, reading, { maxGrade: G, isWord, made: true, canDraw, limit: 60 });
    const made = wrong.filter(c => c.made).slice(0, 6);
    rows.push(`<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
      <span style="width:6em;color:#666;font-size:13px">${w}（${reading}）</span>${box(answer, 0)}
      <span style="color:#ccc">|</span>${made.map(c => box(c, 1)).join('') || '<span style="color:#999;font-size:13px">なし</span>'}</div>`);
  }
  const out = path.join(here, 'glyph-probe.html');
  fs.writeFileSync(out, `<body style="font-family:'Hiragino Sans',sans-serif;margin:0;padding:16px;background:#fff">
<div style="font-size:12px;color:#888;margin-bottom:10px">grade ${G} ・ 左が正しい語、右が作った字</div>${rows.join('')}</body>`);
  console.log(out);
});
