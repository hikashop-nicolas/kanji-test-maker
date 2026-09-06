// Pure: layout -> standalone vertical-writing HTML (preview + PDF via print).
// Right-to-left flex row (space-between) so sentences fill the page width.
// Text flows at its natural pitch (tight); the answer boxes live in a parallel
// column and are positioned (with push-down) so they never overlap.
import { layoutBoxes, leadMm, imageSpaceMm } from './model.js';
import { cellSvg } from './glyph.js';

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 'column' layout: the tested word is shown inline (side-lined) and its answer
// box lives in a parallel column (see sentenceHtml).
// a character that does not exist is drawn, at the size of one of its neighbours
function glyphHtml(cell) {
  return cellSvg(cell, { cls: 'gl' }) || `<span class="plain">${esc(cell.draw || '\u3013')}</span>`;
}

function runHtml(r) {
  if (r.t === 'glyph') return glyphHtml(r.cell);
  if (r.t === 'plain') return `<span class="plain">${esc(r.s)}</span>`;
  if (r.t === 'kana') return `<span class="plain">${esc(r.s)}</span>`; // reading in place of kanji
  if (r.t === 'furi') return `<ruby>${esc(r.base)}<rt>${esc(r.rt)}</rt></ruby>`;
  return `<span class="read">${esc(r.s)}</span>`; // 'read' (tested word, side-lined)
}

// 'inline' layout (the Japanese norm): the blank box sits in the sentence flow
// where the word goes, with the reading as furigana to its right; 読み shows the
// side-lined kanji with a blank reading slot to its right.
function inlineRunHtml(r, answers) {
  if (r.t === 'glyph') return glyphHtml(r.cell);
  // on a choice sheet the answer key rings the label of the right spelling
  if (r.hit && answers) return `<span class="hit">${esc(r.s)}</span>`;
  if (r.t === 'plain' || r.t === 'kana') return `<span class="plain">${esc(r.s)}</span>`;
  if (r.t === 'furi') return `<ruby>${esc(r.base)}<rt>${esc(r.rt)}</rt></ruby>`;
  if (r.t !== 'read') return '';
  if (r.mode === 'yomi') {
    const cells = Math.max(1, r.cells || 1);
    const slot = answers ? esc(r.answer || '') : '';
    return `<span class="yunit"><span class="ykk">${esc(r.surface)}</span><span class="yslot" style="height:calc(${cells}em + 4px)">${slot}</span></span>`;
  }
  const chars = answers ? [...(r.answer || '')] : null;
  let cells = '';
  for (let i = 0; i < r.cells; i++) {
    const a = chars && chars[i] ? `<span class="a">${esc(chars[i])}</span>` : '';
    cells += `<span class="ibox">${a}</span>`;
  }
  return `<span class="tunit"><span class="bgrp">${cells}</span><span class="tread">${esc(r.reading || '')}</span></span>`;
}

function sentenceHtml(col, fontPitchMm, boxSize, answers, inline, colH) {
  const num = `<span class="num">${esc(col.number)}</span>`;
  if (inline) {
    const text = `<div class="col">${num}${col.runs.map(r => inlineRunHtml(r, answers)).join('')}</div>`;
    // a sentence with blank cells in it sets its lines as wide as a cell, so the
    // writing between the cells sits on the same axis they do
    return `<div class="sentence${col.boxes.length ? ' boxed' : ''}">${text}</div>`;
  }
  const text = `<div class="col">${num}${col.runs.map(runHtml).join('')}</div>`;
  // colH mm = --colH; the boxes start below the circled number, like the text
  const pos = layoutBoxes(col.boxes, fontPitchMm, boxSize, 1, colH, leadMm(fontPitchMm));
  // a sentence with more tested words than one column of boxes holds gets a
  // second column beside it (0 sits against the text)
  const wide = pos.length ? pos[pos.length - 1].col + 1 : 1;
  const boxes = pos.map((p, i) => {
    const ans = answers ? `<span class="ans">${esc(col.boxes[i].answer || '')}</span>` : '';
    const right = p.col ? `right:calc(${p.col} * (var(--box) + 1mm));` : '';
    return `<span class="box" style="${right}top:${p.top.toFixed(2)}mm;height:${p.height.toFixed(2)}mm">${ans}</span>`;
  }).join('');
  const w = `width:calc(${wide} * var(--box) + ${wide - 1}mm)`;
  return `<div class="sentence">${text}<div class="boxcol" style="${w}">${boxes}</div></div>`;
}

// Title (class/lesson/name) shows on the first page only, and not at all on a
// sheet with no heading; the points/seal boxes show on the last page (both
// together when there is a single page).
function titleHtml(h, extras, showText, isLast) {
  const showBoxes = extras && isLast;
  if (!showText && !showBoxes) return '';
  const lesson = showText && h.lesson ? `<span class="num">${esc(h.lesson)}</span>` : '';
  const text = showText
    ? `<div class="ttext">${esc(h.pre)}${lesson}${esc(h.post)}</div>`
    : `<div class="tspacer"></div>`;
  const boxes = showBoxes
    ? `<div class="tboxes">` +
      `<div class="tb"><span class="tb-label">点</span><span class="tb-box"></span></div>` +
      `<div class="tb"><span class="tb-label">印</span><span class="tb-box"></span></div>` +
      `</div>`
    : '';
  return `<div class="title${showBoxes ? ' with-extras' : ''}">${text}${boxes}</div>`;
}

export function buildHtml(layout, opts = {}) {
  const font = opts.font || layout.font || 'Hiragino Mincho ProN';
  const fontSize = layout.fontSize || 18;            // pt
  const boxSize = layout.boxSize || 10;              // mm per writing cell
  const titleFontSize = layout.titleFontSize || fontSize;
  const fontPitchMm = fontSize * 0.35278;            // one full-width cell, mm
  const header = layout.header; // null when the sheet carries no heading

  const answers = !!opts.answers;
  const inline = (layout.blankPos || 'inline') === 'inline';
  const total = layout.pageCount || layout.pages.length;
  const colH = layout.colH || 190;                   // one band's column height, mm
  const bandGap = layout.bandGap != null ? layout.bandGap : 5;
  const imageHtml = layout.image ? `<img class="pimg" src="${layout.image}" alt="">` : '';
  // the image is drawn over the sheet, so the bottom band stops short of it
  const imageSpace = layout.image
    ? `<div class="ispace" style="width:${imageSpaceMm(layout.imageDims).toFixed(1)}mm"></div>` : '';
  const pages = layout.pages.map((p, idx) => {
    const bands = p.bands || [{ columns: p.columns }];
    // the title heads the first band of the first page; the points/seal boxes
    // sit in the last band of the last page
    const html = bands.map((b, bi) => {
      const cols = b.columns.map(c => sentenceHtml(c, fontPitchMm, boxSize, answers, inline, colH)).join('');
      const title = titleHtml(header, layout.extras,
        !!header && idx === 0 && bi === 0, idx === total - 1 && bi === bands.length - 1);
      const space = bi === bands.length - 1 ? imageSpace : '';
      return `<div class="band">${title}${cols}${space}</div>`;
    }).join('');
    const pnum = total > 1 ? `<div class="pnum">${idx + 1} / ${total}</div>` : '';
    return `<section class="page">${html}${imageHtml}${pnum}</section>`;
  }).join('');

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;700&family=Klee+One:wght@400;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Zen+Maru+Gothic:wght@400;500;700&family=Kaisei+Tokumin:wght@400;700&family=Yuji+Syuku&display=swap');
  ${opts.fontFace || ''}
  @page { size: A4 landscape; margin: 8mm; }
  html,body { margin:0; padding:0; }
  /* on-screen (preview) only: pages look like sheets on a desk. The parent
     scales the body to fit the panel width; print is unaffected. */
  @media screen {
    html, body { overflow: hidden; }  /* no scrollbars; the parent sizes the iframe to fit */
    body { background: #e9ecf1; padding: 10px; box-sizing: border-box; }
    .page { box-shadow: 0 1px 8px rgba(0,0,0,.18); margin: 0 auto; }
    .page + .page { margin-top: 6mm; }
  }
  .page {
    position: relative;
    display: flex; flex-direction: column;
    font-family: ${JSON.stringify(font)}, "Hiragino Mincho ProN", serif;
    font-size: ${fontSize}pt;
    --box: ${boxSize}mm;
    --colH: ${colH}mm;
    box-sizing: border-box; padding: 1.5mm 6mm;
    width: 281mm; height: 193mm; overflow: hidden;
  }
  /* one band of sentence columns, right to left across the page */
  .band {
    display: flex; flex-direction: row-reverse; justify-content: space-between;
    align-items: flex-start; height: var(--colH);
  }
  .band + .band { margin-top: ${bandGap}mm; }
  .page + .page { page-break-before: always; }
  .sentence { display: flex; flex-direction: row-reverse; align-items: flex-start; }
  .col { writing-mode: vertical-rl; line-height: 1.0; height: var(--colH); }
  /* when a sentence wraps to extra columns, start them below the circled number
     (level with the first character), not at the very top; and give the columns
     a little gap so a tested word's side line never touches the next column. */
  .sentence .col { text-indent: calc(1.2em + 1.2mm) hanging; line-height: 1.3; }
  .sentence.boxed .col { line-height: max(1.3em, var(--box)); }
  .title { display: flex; flex-direction: column; align-items: flex-end; height: var(--colH); font-weight: bold; }
  .ttext { writing-mode: vertical-rl; line-height: 1.0; font-size: ${titleFontSize}pt; height: 100%; }
  .title.with-extras .ttext { height: auto; flex: 1 1 auto; }
  .tspacer { flex: 1 1 auto; }
  /* points (点) + parent's-seal (印) boxes, at the bottom of the title column */
  .tboxes { display: flex; flex-direction: column; gap: 3mm; align-items: center; padding-bottom: 4mm; }
  .tb { display: flex; flex-direction: column; align-items: center; gap: 1mm; }
  .tb-label { writing-mode: horizontal-tb; font-size: 3.4mm; }
  .tb-box { width: 14mm; height: 14mm; border: 1.4px solid #222; box-sizing: border-box; }
  /* optional bottom-left image and the multi-page counter. The sentences stop
     short of the image: .ispace holds its corner of the bottom band open. */
  .pimg { position: absolute; left: 4mm; bottom: 2mm; max-width: 42mm; max-height: 28mm; }
  .ispace { flex: 0 0 auto; }
  .pnum { position: absolute; left: 2.5mm; top: 1mm; font-size: 3mm; color: #666; font-family: Arial, sans-serif; }
  /* tested word: a side line on the RIGHT of the characters (vertical 傍線) */
  .read { border-right: 1.6px solid #333; padding-right: 1px; }
  /* ---- inline blank cells (文中 / the Japanese norm) ----
     a tested word becomes boxes stacked down the column with the reading set as
     furigana to their right. The boxes keep to the right of their line, level
     with the text around them, and the room for the reading is kept on the
     LEFT: that is where the reading of the line to the left lands, so a wrapped
     sentence never sets its reading on top of its own boxes. */
  .tunit { position: relative; display: inline-block; writing-mode: horizontal-tb; vertical-align: top;
           padding-left: calc(.5em + .5mm); }
  .bgrp { display: flex; flex-direction: column; }
  .ibox { width: var(--box); height: var(--box); border: 1.4px solid #222; box-sizing: border-box;
          display: flex; align-items: center; justify-content: center; }
  .ibox .a { writing-mode: vertical-rl; line-height: 1; font-size: calc(var(--box) * 0.72); color: #c0392b; }
  .tread { position: absolute; left: 100%; top: 50%; transform: translateY(-50%);
           writing-mode: vertical-rl; line-height: 1; font-size: .5em; color: #333;
           margin-left: .3mm; white-space: nowrap; }
  /* 読み: the kanji is shown (side-lined); an empty reading box hangs at its right,
     sized to the reading length. The pupil writes the furigana there; the answer
     key fills it red. Without the box the empty slot collapsed and no blank showed. */
  .yunit { position: relative; display: inline-block; writing-mode: vertical-rl; vertical-align: top;
           padding-left: calc(.75em + .8mm); }
  .ykk { border-right: 1.6px solid #333; padding-right: 1px; }
  .yslot { position: absolute; left: 100%; top: 0; margin-left: .6mm;
           box-sizing: border-box; width: 1.5em; border: 1.2px solid #999;
           display: flex; align-items: flex-start; justify-content: center;
           writing-mode: vertical-rl; line-height: 1; font-size: .5em; color: #c0392b; white-space: nowrap; }
  /* an invented character: drawn at the ink size of a real one, upright in the
     line like any kanji (see docs/CHOICE_PLAN.md 8) */
  .gl { width: 1em; height: 1em; display: inline-block; vertical-align: middle; color: inherit; }
  /* answer key on a choice sheet: a ring round the right label */
  .hit {
    writing-mode: horizontal-tb;
    display: inline-flex; align-items: center; justify-content: center;
    box-sizing: border-box; width: 1.35em; height: 1.35em;
    border: 1.6px solid #c0392b; border-radius: 50%; color: #c0392b;
    font-size: .8em; vertical-align: middle;
  }
  /* furigana: ruby to the right of the kanji in vertical writing */
  ruby { ruby-position: over; }
  rt { font-size: .5em; font-weight: normal; }
  /* a plain number drawn inside a circle. Forced to a horizontal box with a
     fixed font so the circle/centering is the same whatever the body font is. */
  .num {
    writing-mode: horizontal-tb;
    display: inline-flex; align-items: center; justify-content: center;
    box-sizing: border-box; width: 1.5em; height: 1.5em;
    border: 1.6px solid #222; border-radius: 50%;
    font-family: Arial, "Helvetica Neue", sans-serif; font-size: .8em; font-weight: 600;
    margin-bottom: 1.2mm;
  }
  .boxcol { position: relative; width: var(--box); height: var(--colH); margin-right: 2mm; }
  .box {
    position: absolute; right: 0; width: var(--box);
    border: 1.4px solid #222; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
  }
  /* answer-key text inside the box (vertical, sized to the box) */
  .box .ans {
    writing-mode: vertical-rl; line-height: 1;
    font-size: calc(var(--box) * 0.74); color: #c0392b;
  }
</style></head><body>${pages}</body></html>`;
}
