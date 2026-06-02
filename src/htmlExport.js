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
  const pos = layoutBoxes(col.boxes, fontPitchMm, boxSize, 1);
  const boxes = pos.map((p, i) => {
    const ans = answers ? `<span class="ans">${esc(col.boxes[i].answer || '')}</span>` : '';
    return `<span class="box" style="top:${p.top.toFixed(2)}mm;height:${p.height.toFixed(2)}mm">${ans}</span>`;
  }).join('');
  return `<div class="sentence">${text}<div class="boxcol">${boxes}</div></div>`;
}

function titleHtml(h) {
  const lesson = h.lesson ? `<span class="num">${esc(h.lesson)}</span>` : '';
  return `<div class="title col">${esc(h.pre)}${lesson}${esc(h.post)}</div>`;
}

export function buildHtml(layout, opts = {}) {
  const font = opts.font || layout.font || 'Hiragino Mincho ProN';
  const fontSize = layout.fontSize || 18;            // pt
  const boxSize = layout.boxSize || 10;              // mm per writing cell
  const titleFontSize = layout.titleFontSize || fontSize;
  const fontPitchMm = fontSize * 0.35278;            // one full-width cell, mm
  const header = layout.header || { pre: '', lesson: '', post: '' };

  const answers = !!opts.answers;
  const pages = layout.pages.map(p => {
    const cols = p.columns.map(c => sentenceHtml(c, fontPitchMm, boxSize, answers)).join('');
    return `<section class="page">${titleHtml(header)}${cols}</section>`;
  }).join('');

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;700&family=Klee+One:wght@400;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Zen+Maru+Gothic:wght@400;500;700&family=Kaisei+Tokumin:wght@400;700&family=Yuji+Syuku&display=swap');
  ${opts.fontFace || ''}
  @page { size: A4 landscape; margin: 8mm; }
  html,body { margin:0; padding:0; }
  .page {
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
  .title { writing-mode: vertical-rl; line-height: 1.0; height: var(--colH); font-weight: bold; font-size: ${titleFontSize}pt; }
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
