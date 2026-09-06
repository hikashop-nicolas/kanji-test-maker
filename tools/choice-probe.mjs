// Build a real multiple-choice sheet and write it out, without the interface:
//   node tools/choice-probe.mjs 漢字 花火 自転車 ...   -> tools/choice-probe.html
// G sets the level (default 2), MADE=1 allows invented characters, ANS=1 writes
// the answer key, N sets the number of choices (default 4), DOCX=1 also writes
// tools/choice-probe.docx (drawing the glyphs with headless Chrome, which is
// what the browser does with a canvas).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import kuromoji from 'kuromoji';
import * as docx from 'docx';
import { fileURLToPath } from 'url';
import { init, generate } from '../src/distractors.js';
import { setStrokes, cellSvg, canDraw } from '../src/glyph.js';
import { buildLayout } from '../src/model.js';
import { buildHtml } from '../src/htmlExport.js';
import { buildDocx } from '../src/docxExport.js';


const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
init(read('assets/data/kanji.json'), read('assets/data/kanji-parts.json'));
const G = +(process.env.G || 2), made = !!process.env.MADE;
const N = +(process.env.N || 4), answers = !!process.env.ANS;
if (made) setStrokes(read('assets/data/kanji-strokes.json'));

const words = process.argv.slice(2);
kuromoji.builder({ dicPath: path.join(root, 'node_modules/kuromoji/dict') }).build((e, tok) => {
  if (e) throw e;
  const isWord = (s) => {
    const t = tok.tokenize(s);
    return t.length === 1 && t[0].word_type === 'KNOWN' && t[0].surface_form === s;
  };
  const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const questions = words.map((w, i) => {
    const reading = tok.tokenize(w).map(t => (t.reading && t.reading !== '*' ? t.reading : t.surface_form)).join('');
    const { answer, wrong } = generate(w, reading, { maxGrade: G, isWord, made, canDraw, limit: 20 });
    const choices = wrong.slice(0, N - 1);
    const at = i % Math.max(1, Math.min(N, choices.length + 1));
    choices.splice(at, 0, answer);
    return { word: w, reading: kata2hira(reading), choices, answerAt: at };
  });
  const layout = buildLayout({
    mode: 'choice',
    header: { pre: 'こんしゅうのかんじ', lesson: '1', post: '　なまえ（　　　　　　　　　　）' },
    options: { autoPerPage: true, fontSize: 18, font: 'Hiragino Sans' },
    questions,
  });
  const out = path.join(here, 'choice-probe.html');
  fs.writeFileSync(out, buildHtml(layout, { font: 'Hiragino Sans', answers, glyph: (c, hit) => cellSvg(c, { cls: hit ? 'gl hit' : 'gl' }) }));
  console.log(`${out}  ${layout.pageCount} page(s), ${questions.length} questions`);
  if (process.env.DOCX) {
    rasterize(layout);
    const doc = buildDocx(layout, docx, [], { answers });
    const dp = path.join(here, 'choice-probe.docx');
    docx.Packer.toBuffer(doc).then(b => { fs.writeFileSync(dp, b); console.log(dp); });
  }
});

// Draw every glyph run to a PNG, the way the browser does with a canvas. Here
// it is headless Chrome, one small page per distinct glyph.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
function rasterize(layout) {
  const px = Math.round((layout.fontSize || 18) * 96 / 72) * 3;   // 3x for print
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktm-glyph-'));
  const runs = [];
  for (const page of layout.pages) {
    for (const band of (page.bands || [])) {
      for (const col of band.columns) for (const r of col.runs) if (r.t === 'glyph') runs.push(r);
    }
  }
  runs.forEach((r, i) => {
    const svg = cellSvg(r.cell, { width: px, height: px, color: '#000' });
    fs.writeFileSync(path.join(dir, `g${i}.svg`), svg);
  });
  runs.forEach((r, i) => {
    const f = path.join(dir, `g${i}.svg`), png = path.join(dir, `g${i}.png`);
    execFileSync(CHROME, ['--headless', '--disable-gpu', `--screenshot=${png}`,
      `--window-size=${px},${px}`, '--hide-scrollbars', '--default-background-color=00000000', f],
      { stdio: 'ignore' });
    r.png = fs.readFileSync(png);
  });
  console.log(`drew ${runs.length} glyphs at ${px}px`);
}
