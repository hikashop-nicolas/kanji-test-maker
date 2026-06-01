import kuromoji from 'kuromoji'; import path from 'path'; import {fileURLToPath} from 'url';
import { normalizeTokens, buildLayout } from '../src/model.js';
const dic = path.join(path.dirname(fileURLToPath(import.meta.url)),'..','node_modules','kuromoji','dict');
kuromoji.builder({dicPath:dic}).build((e,tok)=>{
  const tokens = normalizeTokens(tok.tokenize('学校の図書室で本を読む。'));
  const ws = { header:{}, options:{}, sentences:[{tokens, mode:'kaki'}] };
  const col = buildLayout(ws).pages[0].columns[0];
  console.log('runs:', col.runs.map(r=>r.t==='plain'?r.s:`[READ:${r.s}]`).join(' '));
  console.log('boxes:', JSON.stringify(col.boxes));
});
