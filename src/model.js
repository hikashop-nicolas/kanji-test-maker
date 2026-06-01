// Pure worksheet model. No external dependencies (runs in Node and the browser).
// Turns tokenized sentences + per-sentence settings into an abstract layout that
// both the HTML and DOCX exporters consume.

const KANJI_RE = /[一-鿿㐀-䶿豈-﫿]/;

export function hasKanji(s) { return KANJI_RE.test(s || ''); }
export function countKanji(s) { return ((s || '').match(new RegExp(KANJI_RE.source, 'g')) || []).length; }

export function kataToHira(s) {
  return (s || '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// Unicode circled number (used by the docx export; the HTML draws its own
// circle). Covers 1-50, falls back to a plain number.
export function circledExtended(n) {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1);
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21);
  if (n >= 36 && n <= 50) return String.fromCodePoint(0x32B1 + n - 36);
  return String(n);
}

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
function sentenceColumn(sentence, index, ratio) {
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
    // Reserve enough text cells that a box (taller than one text cell when the
    // box size exceeds the font) never overlaps the NEXT word's box. Only pad
    // when another box follows, otherwise the trailing text (e.g. the closing
    // 。) would be pushed away from the last word.
    const hasLaterBox = toks.slice(i).some(t => t.selected);
    const occupy = hasLaterBox ? Math.max(show.length, Math.ceil(cells * ratio)) : show.length;
    runs.push({ t: 'read', s: show });
    if (occupy > show.length) runs.push({ t: 'plain', s: '　'.repeat(occupy - show.length) });
    boxes.push({ offset: pos, cells });
    pos += occupy;
  }
  return { number: index + 1, runs, boxes, length: pos };
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
  const fontSize = o.fontSize || 18; // pt
  const boxSize = o.boxSize || 10;   // mm, one writing cell
  const header = headerLine(worksheet.header);

  const fontPitchMm = fontSize * 0.35278;
  const ratio = Math.max(1, boxSize / fontPitchMm); // box height in text-cell units
  const sentences = worksheet.sentences.map((s, i) => sentenceColumn(s, i, ratio));

  // The title shares the column height; shrink its font so the whole line
  // (class, lesson, name field) always fits in a single column.
  const COLH_PT = 182 / 0.35278;
  const titleFontSize = Math.min(fontSize, Math.max(8, Math.floor(COLH_PT * 0.96 / Math.max(1, header.length))));

  const pages = chunk(sentences, perPage).map(group => ({ header, columns: group }));
  if (pages.length === 0) pages.push({ header, columns: [] });

  return { font, fontSize, boxSize, titleFontSize, pages };
}
