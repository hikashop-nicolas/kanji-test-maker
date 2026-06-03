// Pure: layout -> standalone vertical-writing HTML (preview + PDF via print).
// Right-to-left flex row (space-between) so sentences fill the page width.
// Text flows at its natural pitch (tight); the answer boxes live in a parallel
// column and are positioned (with push-down) so they never overlap.
import { layoutBoxes } from './model.js';

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function runHtml(r) {
  if (r.t === 'plain') return `<span class="plain">${esc(r.s)}</span>`;
  if (r.t === 'kana') return `<span class="plain">${esc(r.s)}</span>`; // reading in place of kanji
  if (r.t === 'furi') return `<ruby>${esc(r.base)}<rt>${esc(r.rt)}</rt></ruby>`;
  return `<span class="read">${esc(r.s)}</span>`; // 'read' (tested word, side-lined)
}

function sentenceHtml(col, fontPitchMm, boxSize, answers) {
  const num = `<span class="num">${esc(col.number)}</span>`;
  const text = `<div class="col">${num}${col.runs.map(runHtml).join('')}</div>`;
  const pos = layoutBoxes(col.boxes, fontPitchMm, boxSize, 1, 190); // 190mm = --colH
  const boxes = pos.map((p, i) => {
    const ans = answers ? `<span class="ans">${esc(col.boxes[i].answer || '')}</span>` : '';
    return `<span class="box" style="top:${p.top.toFixed(2)}mm;height:${p.height.toFixed(2)}mm">${ans}</span>`;
  }).join('');
  return `<div class="sentence">${text}<div class="boxcol">${boxes}</div></div>`;
}

// Title (class/lesson/name) shows only on the first page; the points/seal boxes
// show only on the last page (both together when there is a single page).
function titleHtml(h, extras, isFirst, isLast) {
  const showText = isFirst;
  const showBoxes = extras && isLast;
  if (!showText && !showBoxes) return '';
  const lesson = h.lesson ? `<span class="num">${esc(h.lesson)}</span>` : '';
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
  const header = layout.header || { pre: '', lesson: '', post: '' };

  const answers = !!opts.answers;
  const total = layout.pageCount || layout.pages.length;
  const imageHtml = layout.image ? `<img class="pimg" src="${layout.image}" alt="">` : '';
  const pages = layout.pages.map((p, idx) => {
    const cols = p.columns.map(c => sentenceHtml(c, fontPitchMm, boxSize, answers)).join('');
    const pnum = total > 1 ? `<div class="pnum">${idx + 1} / ${total}</div>` : '';
    return `<section class="page">${titleHtml(header, layout.extras, idx === 0, idx === total - 1)}${cols}${imageHtml}${pnum}</section>`;
  }).join('');

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;700&family=Klee+One:wght@400;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Zen+Maru+Gothic:wght@400;500;700&family=Kaisei+Tokumin:wght@400;700&family=Yuji+Syuku&display=swap');
  ${opts.fontFace || ''}
  @page { size: A4 landscape; margin: 8mm; }
  html,body { margin:0; padding:0; }
  .page {
    position: relative;
    display: flex; flex-direction: row-reverse; justify-content: space-between;
    align-items: flex-start;
    font-family: ${JSON.stringify(font)}, "Hiragino Mincho ProN", serif;
    font-size: ${fontSize}pt;
    --box: ${boxSize}mm;
    --colH: 190mm;
    box-sizing: border-box; padding: 1.5mm 6mm;
    width: 281mm; height: 193mm; overflow: hidden;
  }
  .page + .page { page-break-before: always; }
  .sentence { display: flex; flex-direction: row-reverse; align-items: flex-start; }
  .col { writing-mode: vertical-rl; line-height: 1.0; height: var(--colH); }
  /* when a sentence wraps to extra columns, start them below the circled number
     (level with the first character), not at the very top; and give the columns
     a little gap so a tested word's side line never touches the next column. */
  .sentence .col { text-indent: calc(1.5em + 1.2mm) hanging; line-height: 1.3; }
  .title { display: flex; flex-direction: column; align-items: flex-end; height: var(--colH); font-weight: bold; }
  .ttext { writing-mode: vertical-rl; line-height: 1.0; font-size: ${titleFontSize}pt; height: 100%; }
  .title.with-extras .ttext { height: auto; flex: 1 1 auto; }
  .tspacer { flex: 1 1 auto; }
  /* points (点) + parent's-seal (印) boxes, at the bottom of the title column */
  .tboxes { display: flex; flex-direction: column; gap: 3mm; align-items: center; padding-bottom: 4mm; }
  .tb { display: flex; flex-direction: column; align-items: center; gap: 1mm; }
  .tb-label { writing-mode: horizontal-tb; font-size: 3.4mm; }
  .tb-box { width: 14mm; height: 14mm; border: 1.4px solid #222; box-sizing: border-box; }
  /* optional bottom-left image and the multi-page counter */
  .pimg { position: absolute; left: 4mm; bottom: 2mm; max-width: 42mm; max-height: 28mm; }
  .pnum { position: absolute; left: 2.5mm; top: 1mm; font-size: 3mm; color: #666; font-family: Arial, sans-serif; }
  /* tested word: a side line on the RIGHT of the characters (vertical 傍線) */
  .read { border-right: 1.6px solid #333; padding-right: 1px; }
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
