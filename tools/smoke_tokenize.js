const kuromoji = require('kuromoji');
const path = require('path');
const dicPath = path.join(__dirname, '..', 'node_modules', 'kuromoji', 'dict');
const sentences = [
  '絵の具で、花の絵をかく。',
  '春休みに、雪がふった。',
  '絵画教室にかよう。',
  '知人と行列のできるレストランにいく。',
  '小さいころの思い出。',
];
kuromoji.builder({ dicPath }).build((err, tok) => {
  if (err) { console.error('ERR', err); process.exit(1); }
  for (const s of sentences) {
    const toks = tok.tokenize(s);
    const parts = toks.map(t => `${t.surface_form}[${t.reading||'?'}|${t.pos}]`);
    console.log(s, '\n  ', parts.join(' '));
  }
});
