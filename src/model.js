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
// Each token: { surface, reading(hiragana), hasKanji, state }
// state: 'plain' | 'test' | 'furigana' | 'kana' (see sentenceColumn).
export function normalizeTokens(tokens) {
  return tokens.map(t => {
    const surface = t.surface_form !== undefined ? t.surface_form : t.surface;
    const readingKata = t.reading && t.reading !== '*' ? t.reading : '';
    const k = hasKanji(surface);
    // Reading in hiragana. For katakana words (e.g. レストラン) this yields the
    // hiragana (れすとらん), so in 書き mode the student writes the katakana.
    let reading = kataToHira(readingKata);
    if (!reading) reading = k ? '' : kataToHira(surface);
    return { surface, reading, hasKanji: k, state: k ? 'test' : 'plain' };
  });
}

// A token's state, tolerant of the older `selected` boolean.
export function tokenState(t) {
  if (t.state) return t.state;
  return t.selected ? 'test' : 'plain';
}

// ASCII letters/digits -> full-width, so they sit upright in vertical writing
// (e.g. 小1 -> 小１) in both the PDF and the .docx.
export function toFullWidth(s) {
  return (s || '').replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
}

// Header parts for the title column. The lesson number is kept separate so the
// exporters can draw a circle around it (like the sentence numbers).
export function headerParts(header = {}) {
  const cls = header.classCode || '';
  const title = header.title || 'こんしゅうのかんじ';
  const lesson = (header.lessonNo ?? '').toString().trim();
  const name = header.nameLabel || 'なまえ';
  return {
    pre: toFullWidth(`${cls}　${title}`),
    lesson,                                  // drawn circled by the exporters
    post: toFullWidth(`　${name}（　　　　　　　　　　）`),
  };
}

// Box positions in a column: each box sits at its word's position but is pushed
// down so boxes never overlap. Text stays tight; only the boxes get spacing.
// pitch = text cell size, cellHeight = box cell size, in the caller's units.
// maxHeight: if the stack would overflow the column, boxes are pushed UP into
// the empty space before them (so the last box still fits on the page).
export function layoutBoxes(boxes, pitch, cellHeight, gap = 0, maxHeight = Infinity) {
  let prevBottom = -Infinity;
  const pos = boxes.map(b => {
    const top = Math.max(b.offset * pitch, prevBottom + gap);
    const height = b.cells * cellHeight;
    prevBottom = top + height;
    return { top, height };
  });
  // overflow: walk backward, pulling each box up just enough to fit under the
  // running ceiling, consuming the slack between boxes without overlapping.
  if (pos.length && prevBottom > maxHeight) {
    let ceil = maxHeight;
    for (let i = pos.length - 1; i >= 0; i--) {
      if (pos[i].top + pos[i].height > ceil) pos[i].top = ceil - pos[i].height;
      if (pos[i].top < 0) pos[i].top = 0; // never above the column top
      ceil = pos[i].top - gap;
    }
  }
  return pos;
}

// Turn one sentence into:
//   runs:  the text column (no boxes), kinds:
//          { t:'plain', s }        verbatim text
//          { t:'read', s }         a tested word, side-lined (reading in kaki,
//                                  the kanji in yomi); gets an answer box
//          { t:'kana', s }         kanji replaced by its hiragana reading (for
//                                  words above the grade); no box, no line
//          { t:'furi', base, rt }  kanji kept, with furigana (ruby) alongside
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
    const st = tokenState(toks[i]);
    if (st === 'plain') {
      // full-width so ASCII digits/letters sit upright in vertical writing
      runs.push({ t: 'plain', s: toFullWidth(toks[i].surface) });
      pos += toks[i].surface.length;
      i++;
      continue;
    }
    // Merge consecutive tokens sharing a state, so an adjacent split like
    // 図書 + 室 becomes one 図書室 unit (box, furigana, or kana together).
    let surface = '', reading = '';
    while (i < toks.length && tokenState(toks[i]) === st) {
      surface += toks[i].surface;
      reading += (toks[i].reading || toks[i].surface);
      i++;
    }
    if (st === 'kana') {
      const s = reading || surface; // show the reading in place of the kanji
      runs.push({ t: 'kana', s });
      pos += s.length;
    } else if (st === 'furigana') {
      runs.push({ t: 'furi', base: surface, rt: reading || '' });
      pos += surface.length; // ruby sits alongside; base keeps the column pitch
    } else { // 'test'
      const show = mode === 'yomi' ? surface : (reading || surface);
      const answer = mode === 'yomi' ? (reading || surface) : surface; // what goes in the box
      const cells = mode === 'yomi'
        ? Math.max(1, (reading || surface).length) // write the reading
        : Math.max(1, surface.length);              // write the whole word
      // s/show drive the side-column layout; surface/reading/answer/cells drive
      // the inline layout (boxes in the sentence flow with the reading alongside).
      runs.push({ t: 'read', s: show, mode, surface, reading: reading || '', answer, cells });
      boxes.push({ offset: pos, cells, answer });
      pos += show.length; // text stays tight; boxes get their spacing separately
    }
  }
  return { number: index + 1, runs, boxes, length: pos };
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ---- auto pagination -----------------------------------------------------
// How wide a sentence sits on the page, and how far it runs down its column.
// The numbers mirror the HTML export's CSS (htmlExport.js) and were checked
// against the rendered page: a text column is 1.3em wide, the box column adds
// the box size plus its 2mm margin, and in 文中 mode the boxes set the width
// whenever they are wider than the text.
const PAGE_W_MM = 281, PAGE_PAD_MM = 6; // .page width and its left/right padding
const EXTRAS_W_MM = 14;                 // the 点 / 印 boxes beside the title
const COL_GAP_MM = 2;                   // keep neighbouring sentences apart

function columnWidthMm(wrap, pitch, boxSize, inline) {
  return inline
    ? Math.max(1.3 * pitch, boxSize) * wrap
    : 1.3 * pitch * wrap + boxSize + 2;
}

// A trailing 。 is allowed to hang past the end of the column, so it does not
// count towards the height.
function columnRunMm(col, pitch, boxSize, inline) {
  let h = 1.2 * pitch; // the circled number
  let last = '';
  for (const r of col.runs) {
    if (r.t === 'read') { h += inline ? Math.max(1, r.cells) * boxSize : r.s.length * pitch; last = inline ? '' : r.s; }
    else if (r.t === 'furi') { h += r.base.length * pitch; last = r.base; }
    else { h += r.s.length * pitch; last = r.s; }
  }
  if (/[。！？]$/.test(last)) h -= pitch;
  return h;
}

// Spread the sentences over the fewest whole pages they fit on, evenly rather
// than cramming the first band and leaving the last one nearly empty. The first
// band also carries the title column and the last one the points/seal boxes, so
// any odd sentence out goes to a band in between.
function autoBands(cols, widthOf, rows, titleW, extrasW) {
  if (!cols.length) return [{ columns: [] }];
  const avail = PAGE_W_MM - 2 * PAGE_PAD_MM;
  const fits = (bands) => bands.every((b, i) => {
    const reserve = (i === 0 ? titleW : 0) + (i === bands.length - 1 ? extrasW : 0);
    return b.reduce((w, c) => w + widthOf(c) + COL_GAP_MM, reserve) <= avail;
  });
  for (let B = rows; B <= cols.length; B += rows) {
    const base = Math.floor(cols.length / B), extra = cols.length % B;
    if (!base) break; // more bands than sentences
    const bands = [];
    let i = 0;
    for (let b = 0; b < B; b++) {
      const n = base + (b >= 1 && b <= extra ? 1 : 0);
      bands.push(cols.slice(i, i + n));
      i += n;
    }
    if (i === cols.length && fits(bands)) return bands.map(columns => ({ columns }));
  }
  return cols.map(c => ({ columns: [c] })); // last resort: one sentence per band
}

// Split one page's columns into `rows` bands of near-equal width. An odd
// sentence out goes to a later band: the first one also carries the title
// column, so it has the least room.
function splitBands(cols, rows) {
  const base = Math.floor(cols.length / rows), extra = cols.length % rows;
  const bands = [];
  let i = 0;
  for (let b = 0; b < rows; b++) {
    const n = base + (b >= rows - extra ? 1 : 0);
    if (n) bands.push({ columns: cols.slice(i, i + n) });
    i += n;
  }
  return bands.length ? bands : [{ columns: [] }];
}

// the sentence columns fill this much of the page height, minus band gaps
const PAGE_COL_MM = 190;
const BAND_GAP_MM = 5;

// worksheet: { header, options:{perPage, font}, sentences:[{tokens, mode}] }
export function buildLayout(worksheet) {
  const o = worksheet.options || {};
  const perPage = Math.max(1, o.perPage || 10);
  // stack the sentences in this many bands down the page. Short sentences leave
  // the bottom half of a one-band page empty; two bands fill it.
  const rows = Math.max(1, Math.min(3, o.rows || 1));
  const font = o.font || 'Klee One';
  const fontSize = o.fontSize || 18; // pt
  const boxSize = o.boxSize || 10;   // mm, one writing cell
  const extras = !!o.extras;         // points + signature boxes under the name
  const image = o.image || null;     // bottom-left image (data URL)
  const imageDims = o.imageDims || null; // { w, h } natural size, for the .docx
  // blank-cell placement: 'inline' (boxes in the sentence flow, the Japanese
  // norm) or 'column' (boxes in a parallel column beside the sentence).
  const blankPos = o.blankPos === 'column' ? 'column' : 'inline';
  const header = headerParts(worksheet.header);
  const sentences = worksheet.sentences.map((s, i) => sentenceColumn(s, i));

  // The title shares the column height; shrink its font so the whole line
  // (class, lesson, name field) fits. When the extra boxes are on, the text
  // gets less of the column, so shrink a bit more to leave room below.
  // each page splits its sentences into `rows` bands, balanced so the last page
  // never leaves a whole band empty
  const colH = (PAGE_COL_MM - (rows - 1) * BAND_GAP_MM) / rows;
  let pages;
  if (o.autoPerPage) {
    // fit as many sentences as the page takes, rather than a fixed count
    const pitch = fontSize * 0.35278;
    const inline = blankPos === 'inline';
    const widthOf = (c) => columnWidthMm(
      Math.max(1, Math.ceil(columnRunMm(c, pitch, boxSize, inline) / colH)), pitch, boxSize, inline);
    // titleFontSize is at most fontSize, so this reserves enough for the title
    const bands = autoBands(sentences, widthOf, rows, extras ? EXTRAS_W_MM : pitch, extras ? EXTRAS_W_MM : 0);
    pages = chunk(bands, rows).map(bs => ({ bands: bs, columns: bs.flatMap(b => b.columns) }));
  } else {
    pages = chunk(sentences, perPage).map(group => ({ columns: group, bands: splitBands(group, rows) }));
  }
  if (pages.length === 0) pages.push({ columns: [], bands: [{ columns: [] }] });

  const headerLen = header.pre.length + (header.lesson ? 1 : 0) + header.post.length;
  const COLH_PT = (colH - 8) / 0.35278;
  // the title (first page) and the boxes (last page) only share a column when
  // there is a single page; otherwise the title keeps the full height.
  const fill = (extras && pages.length === 1) ? 0.70 : 0.96;
  const titleFontSize = Math.min(fontSize, Math.max(8, Math.floor(COLH_PT * fill / Math.max(1, headerLen))));

  return { font, fontSize, boxSize, titleFontSize, header, pages, extras, image, imageDims, blankPos,
    rows, colH, bandGap: BAND_GAP_MM, pageCount: pages.length };
}
