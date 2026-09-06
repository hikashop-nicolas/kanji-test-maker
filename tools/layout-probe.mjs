// Harness: build worksheets from fixed sentence sets over a spread of settings
// and dump the HTML, so the page layout can be checked without going through
// the app. tools/layout-check.html renders them and looks for overlaps.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import kuromoji from 'kuromoji';
import { normalizeTokens, joinInflections, buildLayout } from '../src/model.js';
import { buildHtml } from '../src/htmlExport.js';
import { init as initDistractors, generate as generateChoices } from '../src/distractors.js';
import { setStrokes, cellSvg } from '../src/glyph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const out = process.argv[2] || path.join(root, 'tools', 'lay');
fs.mkdirSync(out, { recursive: true });

const SETS = {
  // a scanned two-page lesson, as the OCR gives it back
  lesson: [
    '物語を読んで、感想文を書く。', '運動会で一番になる人を予想する。', '空想の世界では動物たちと話せる。',
    '黒板の文字をノートに写しとる。', '水たまりに青い空が写る。', '遠足の写真を見る。', '真夏の日差しはきつい。',
    '真っ黒な犬。', '店の前に行列ができる。', '長い列車が鉄橋をわたる。', '一列にならんで歩く。',
    'ひざから出血する。', '手当てをして血を止める。', '鼻血が出る。',
    '暗い道を歩く。', '絵にひめられた暗号をとく。', '文章を暗記する。', '石橋をたたいてわたる。', '歩道橋をわたる。',
  ],
  // sentences with far more tested words than one column of boxes holds
  many: [
    '運動会の写真を見て、感想文を書いた黒板の文字を予想する。',
    '長い列車が鉄橋をわたる、遠足の写真を見る、真夏の日差しはきつい。',
    '物語を読んで、感想文を書く。',
    '空想の世界では動物たちと話せる。',
    '一列にならんで歩く。',
    '手当てをして血を止める。',
  ],
};

// a stand-in for the teacher's logo, at two shapes: the reserved corner is the
// picture's own, not the box it is allowed to fill
const png = (w, h) => ({
  image: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#69c"/></svg>`),
  imageDims: { w, h },
});

const CASES = [];
for (const set of Object.keys(SETS)) {
  for (const blankPos of ['column', 'inline']) {
    for (const rows of [1, 2, 3]) CASES.push({ set, blankPos, rows });
    CASES.push({ set, blankPos, rows: 1, fontSize: 12, boxSize: 7 });
    CASES.push({ set, blankPos, rows: 1, fontSize: 26, boxSize: 15 });
    CASES.push({ set, blankPos, rows: 2, mode: 'yomi' });
    CASES.push({ set, blankPos, rows: 1, extras: true });
    CASES.push({ set, blankPos, rows: 2, header: false });
    CASES.push({ set, blankPos, rows: 2, auto: false, perPage: 8 });
    CASES.push({ set, blankPos, rows: 1, image: png(300, 120) });
    CASES.push({ set, blankPos, rows: 2, image: png(120, 300) });
  }
}

// the multiple-choice sheets go through the same sweep: a question is a column
// like any other, and the checker's job here is that nothing runs off the sheet
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
initDistractors(readJson('assets/data/kanji.json'), readJson('assets/data/kanji-parts.json'));
setStrokes(readJson('assets/data/kanji-strokes.json'));
const CHOICE_WORDS = [
  ['日記', 'にっき'], ['昼食', 'ちゅうしょく'], ['顔色', 'かおいろ'], ['教科書', 'きょうかしょ'],
  ['花火', 'はなび'], ['記念', 'きねん'], ['昼休み', 'ひるやすみ'], ['教室', 'きょうしつ'],
  ['顔つき', 'かおつき'], ['生け花', 'いけばな'], ['大人', 'おとな'], ['川', 'かわ'],
];
const CHOICE_CASES = [
  { name: 'choice-4', count: 4, made: false },
  { name: 'choice-5', count: 5, made: false },
  { name: 'choice-4-made', count: 4, made: true },
  { name: 'choice-5-made-f14', count: 5, made: true, fontSize: 14 },
  { name: 'choice-4-made-image', count: 4, made: true, image: png(300, 120) },
  { name: 'choice-4-noheader', count: 4, made: false, header: false },
];

kuromoji.builder({ dicPath: path.join(root, 'node_modules', 'kuromoji', 'dict') }).build((err, tok) => {
  if (err) throw err;
  const isWord = (w) => {
    const t = tok.tokenize(w);
    return t.length === 1 && t[0].word_type === 'KNOWN' && t[0].surface_form === w;
  };
  const tokenized = {};
  for (const [k, lines] of Object.entries(SETS)) tokenized[k] = lines.map(s => normalizeTokens(joinInflections(tok.tokenize(s))));
  const names = [];
  CASES.forEach((c, i) => {
    const worksheet = {
      header: { show: c.header !== false, classCode: 'CM1', title: 'こんしゅうのかんじ', lessonNo: '1', nameLabel: 'なまえ' },
      options: {
        autoPerPage: c.auto !== false, perPage: c.perPage || 10, rows: c.rows, font: 'Klee One',
        fontSize: c.fontSize || 18, boxSize: c.boxSize || 10, blankPos: c.blankPos, extras: !!c.extras,
        ...(c.image || {}),
      },
      sentences: tokenized[c.set].map(tokens => ({ tokens, mode: c.mode || 'kaki' })),
    };
    const layout = buildLayout(worksheet);
    const name = `${String(i).padStart(2, '0')}-${c.set}-${c.blankPos}-r${c.rows}` +
      (c.fontSize ? `-f${c.fontSize}` : '') + (c.mode ? `-${c.mode}` : '') +
      (c.extras ? '-extras' : '') + (c.header === false ? '-noheader' : '') + (c.auto === false ? '-fixed' : '') +
      (c.image ? `-image${c.image.imageDims.w}x${c.image.imageDims.h}` : '');
    // drop the webfont import: the checker only measures, and waiting on the
    // network for every page makes the sweep crawl
    const html = buildHtml(layout).replace(/@import url\('https:[^']*'\);/, '');
    fs.writeFileSync(path.join(out, `${name}.html`), html);
    names.push(name);
    console.log(`${name}: ${layout.pages.length} pages, ${layout.pages.map(p => p.bands.map(b => b.columns.length).join('+')).join(' | ')}`);
  });

  CHOICE_CASES.forEach((c) => {
    const questions = CHOICE_WORDS.map(([word, reading], qi) => {
      const { answer, wrong } = generateChoices(word, reading, {
        maxGrade: 2, isWord, made: c.made, limit: 20,
      });
      const used = wrong.slice(0, c.count - 1);
      const at = qi % (used.length + 1);
      used.splice(at, 0, answer);
      return { reading, choices: used, answerAt: at };
    });
    const layout = buildLayout({
      mode: 'choice',
      header: c.header === false ? { show: false } : { classCode: '小2', title: 'こんしゅうのかんじ', lessonNo: '1', nameLabel: 'なまえ' },
      options: { autoPerPage: true, font: 'Klee One', fontSize: c.fontSize || 18, ...(c.image || {}) },
      questions,
    });
    const html = buildHtml(layout, { glyph: (cell, hit) => cellSvg(cell, { cls: hit ? 'gl hit' : 'gl' }) })
      .replace(/@import url\('https:[^']*'\);/, '');
    fs.writeFileSync(path.join(out, `${c.name}.html`), html);
    names.push(c.name);
    console.log(`${c.name}: ${layout.pages.length} pages, ${questions.length} questions`);
  });

  fs.writeFileSync(path.join(out, 'cases.json'), JSON.stringify(names));
});
