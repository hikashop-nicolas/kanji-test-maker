// What kuromoji made of a sentence, what joinInflections did to it, and the
// boxes that come out:  node tools/tok.mjs "<sentence>" ["<sentence>" ...]
import path from 'path'; import { fileURLToPath } from 'url';
import kuromoji from 'kuromoji';
import { joinInflections, normalizeTokens } from '../src/model.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINES = process.argv.slice(2);
kuromoji.builder({ dicPath: path.join(root, 'node_modules', 'kuromoji', 'dict') }).build((e, tok) => {
  if (e) throw e;
  for (const line of LINES) {
    console.log('== ' + line);
    const raw = tok.tokenize(line);
    console.log('  raw    ' + raw.map(t => t.surface_form).join(' / '));
    const joined = joinInflections(raw);
    console.log('  joined ' + joined.map(t => t.surface_form).join(' / '));
    console.log('  boxes  ' + normalizeTokens(joined).filter(t => t.hasKanji).map(t => `${t.surface}(${t.reading})`).join(' '));
  }
});
