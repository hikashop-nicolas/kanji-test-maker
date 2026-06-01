// Node harness: tokenize sample sentences, build a worksheet, emit HTML + DOCX.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import kuromoji from 'kuromoji';
import * as docx from 'docx';
import { normalizeTokens, buildLayout } from '../src/model.js';
import { buildHtml } from '../src/htmlExport.js';
import { buildDocx } from '../src/docxExport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dicPath = path.join(root, 'node_modules', 'kuromoji', 'dict');

// Sample input: teacher-typed sentences (kanji where they want kanji shown).
const RAW = [
  '絵の具で、花の絵をかく。',
  '春休みに、雪がふった。',
  '絵画教室にかよう。',
  '知人と行列のできるレストランにいく。',
  '小さいころの思い出。',
  'まえのほうから、大きないぬをつれた人がやってくる。',
];

kuromoji.builder({ dicPath }).build(async (err, tok) => {
  if (err) throw err;
  const sentences = RAW.map((s, i) => {
    const tokens = normalizeTokens(tok.tokenize(s));
    // demo: sentence 6 (index 5) in yomi mode, the rest kaki
    return { tokens, mode: i === 5 ? 'yomi' : 'kaki' };
  });

  const worksheet = {
    header: { classCode: 'ＣＥ一', title: 'こんしゅうのかん字', lessonNo: '⑬', nameLabel: '名まえ' },
    options: { perPage: 10, font: 'Hiragino Mincho ProN' },
    sentences,
  };

  const layout = buildLayout(worksheet);

  fs.writeFileSync(path.join(root, 'tools', 'out.html'), buildHtml(layout));
  const buf = await docx.Packer.toBuffer(buildDocx(layout, docx));
  fs.writeFileSync(path.join(root, 'tools', 'out.docx'), buf);
  console.log('wrote tools/out.html and tools/out.docx');

  // quick text dump so we can sanity-check selections/readings without rendering
  for (let i = 0; i < layout.pages[0].columns.length; i++) {
    const c = layout.pages[0].columns[i];
    console.log(c.number, c.runs.map(r => r.t === 'plain' ? r.s : `[${r.show}|box:${r.cells}]`).join(''));
  }
});
