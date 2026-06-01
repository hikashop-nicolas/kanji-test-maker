// Pure worksheet model. No external dependencies (runs in Node and the browser).
// Turns tokenized sentences + per-sentence settings into an abstract layout that
// both the HTML and DOCX exporters consume.

const KANJI_RE = /[一-鿿㐀-䶿豈-﫿]/;
const CIRCLED = ['', '①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];

export function hasKanji(s) { return KANJI_RE.test(s || ''); }
export function countKanji(s) { return ((s || '').match(new RegExp(KANJI_RE.source, 'g')) || []).length; }

export function kataToHira(s) {
  return (s || '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function circled(n) { return CIRCLED[n] || `(${n})`; }

// Normalize a kuromoji token list into our token model.
// Each token: { surface, reading(hiragana), hasKanji, selected }
export function normalizeTokens(tokens) {
  return tokens.map(t => {
    const surface = t.surface_form !== undefined ? t.surface_form : t.surface;
    const readingKata = t.reading && t.reading !== '*' ? t.reading : '';
    const k = hasKanji(surface);
    return {
      surface,
      reading: kataToHira(readingKata) || (k ? '' : surface),
      hasKanji: k,
      selected: k, // auto-select kanji words
    };
  });
}

// Build the header line shown in the title column.
export function headerLine(header = {}) {
  const cls = header.classCode || '';
  const title = header.title || 'こんしゅうのかん字';
  const lesson = header.lessonNo || '';
  const name = header.nameLabel || '名まえ';
  return `${cls}　${title}${lesson}　${name}（　　　　　　　　　　）`.trim();
}

// Turn one sentence into:
//   runs:  the text column (no boxes), kinds:
//          { t:'plain', s }   verbatim text
//          { t:'read', s }    a tested word, shown side-lined (reading in kaki,
//                             the kanji in yomi)
//   boxes: answer boxes for a PARALLEL column, each aligned to its word:
//          { offset, cells }  offset = cell position (down the text column,
//                             counting the leading number) where the word starts
//   length: total cells in the text column (for sizing the box column)
function sentenceColumn(sentence, index) {
  const mode = sentence.mode || 'kaki';
  const toks = sentence.tokens;
  const runs = [];
  const boxes = [];
  let pos = 1; // the circled number occupies the first cell

  let i = 0;
  while (i < toks.length) {
    if (!toks[i].selected) {
      runs.push({ t: 'plain', s: toks[i].surface });
      pos += toks[i].surface.length;
      i++;
      continue;
    }
    // Merge a run of consecutive selected tokens into one tested word, so an
    // adjacent split like 図書 + 室 becomes a single 図書室 box.
    let surface = '', reading = '';
    while (i < toks.length && toks[i].selected) {
      surface += toks[i].surface;
      reading += (toks[i].reading || toks[i].surface);
      i++;
    }
    const show = mode === 'yomi' ? surface : (reading || surface);
    const cells = mode === 'yomi'
      ? Math.max(1, (reading || surface).length) // write the reading
      : Math.max(1, surface.length);              // write the whole word
    runs.push({ t: 'read', s: show });
    boxes.push({ offset: pos, cells });
    pos += show.length;
  }
  return { number: circled(index + 1), runs, boxes, length: pos };
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// worksheet: { header, options:{perPage, font}, sentences:[{tokens, mode}] }
export function buildLayout(worksheet) {
  const o = worksheet.options || {};
  const perPage = Math.max(1, o.perPage || 10);
  const font = o.font || 'Hiragino Mincho ProN';
  const fontSize = o.fontSize || 16; // pt
  const boxSize = o.boxSize || 8;    // mm, one writing cell
  const header = headerLine(worksheet.header);

  const sentences = worksheet.sentences.map((s, i) => sentenceColumn(s, i));

  const pages = chunk(sentences, perPage).map(group => ({
    header,
    columns: group,
  }));
  if (pages.length === 0) pages.push({ header, columns: [] });

  return { font, fontSize, boxSize, pages };
}
