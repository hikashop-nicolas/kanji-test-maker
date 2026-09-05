// Harness: build worksheets from fixed sentence sets over a spread of settings
// and dump the HTML, so the page layout can be checked without going through
// the app. tools/layout-check.html renders them and looks for overlaps.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import kuromoji from 'kuromoji';
import { normalizeTokens, buildLayout } from '../src/model.js';
import { buildHtml } from '../src/htmlExport.js';

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

kuromoji.builder({ dicPath: path.join(root, 'node_modules', 'kuromoji', 'dict') }).build((err, tok) => {
  if (err) throw err;
  const tokenized = {};
  for (const [k, lines] of Object.entries(SETS)) tokenized[k] = lines.map(s => normalizeTokens(tok.tokenize(s)));
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
  fs.writeFileSync(path.join(out, 'cases.json'), JSON.stringify(names));
});
