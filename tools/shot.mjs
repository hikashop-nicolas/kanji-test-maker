// The worksheet page used in the README: builds the same sheet the app builds,
// as a standalone HTML file. Print it and turn it into an image with
//
//   node tools/shot.mjs /tmp/sheet.html
//   chrome --headless --print-to-pdf=/tmp/sheet.pdf --no-pdf-header-footer \
//          --virtual-time-budget=9000 file:///tmp/sheet.html
//   qlmanage -t -s 2136 -o . /tmp/sheet.pdf
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
import kuromoji from 'kuromoji';
import { normalizeTokens, joinInflections, buildLayout } from '../src/model.js';
import { buildHtml } from '../src/htmlExport.js';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2] || path.join(root, 'tools', 'shot.html');
const RAW = [
  '今日の公園は雪が多いね。',
  '新聞によれば明日は雪だそうです。',
  '月曜から金曜までずっと雪でした。',
  '後で校庭に雪だるまを作ろうよ。',
  '学校は雪のため休校になった。',
  '来年の夏は海外へ行きます。',
  '今夜は星が少しも見えない。',
  '台風の間、電気が止まった。',
  '海の水はしょっぱいと思う。',
  '星空を長くながめていた。',
];
kuromoji.builder({ dicPath: path.join(root, 'node_modules', 'kuromoji', 'dict') }).build((err, tok) => {
  if (err) throw err;
  const layout = buildLayout({
    header: { classCode: '小2', title: 'こんしゅうのかんじ', lessonNo: '13', nameLabel: 'なまえ' },
    options: { autoPerPage: true, rows: 1, font: 'Klee One', fontSize: 18, boxSize: 10, blankPos: 'inline' },
    sentences: RAW.map(s => ({ tokens: normalizeTokens(joinInflections(tok.tokenize(s))), mode: 'kaki' })),
  });
  fs.writeFileSync(out, buildHtml(layout));
  console.log(out);
});
