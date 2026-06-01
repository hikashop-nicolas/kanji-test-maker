// Pure: layout -> standalone vertical-writing HTML (preview + PDF via print).
// Each sentence is two adjacent columns: the text column (tested words side-lined
// on the right) and, to its left, a box column whose boxes align with their word.

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function runHtml(r) {
  if (r.t === 'plain') return `<span class="plain">${esc(r.s)}</span>`;
  return `<span class="read">${esc(r.s)}</span>`;
}

function sentenceHtml(col) {
  const num = col.number ? `<span class="num">${esc(col.number)}</span>` : '';
  const text = `<div class="col">${num}${col.runs.map(runHtml).join('')}</div>`;
  const boxes = col.boxes.map(b =>
    `<span class="box" style="top:calc(${b.offset} * var(--cell));height:calc(${b.cells} * var(--cell))"></span>`
  ).join('');
  const boxcol = `<div class="boxcol">${boxes}</div>`;
  return text + boxcol; // text on the right, box column to its left
}

export function buildHtml(layout, opts = {}) {
  const font = opts.font || layout.font || 'Hiragino Mincho ProN';
  const fontSize = layout.fontSize || 16; // pt
  const boxSize = layout.boxSize || 8;    // mm per writing cell
  const pages = layout.pages.map(p => {
    const header = `<div class="col title">${esc(p.header)}</div>`;
    const cols = p.columns.map(sentenceHtml).join('');
    return `<section class="page">${header}${cols}</section>`;
  }).join('');

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
  ${opts.fontFace || ''}
  @page { size: A4 landscape; margin: 8mm; }
  html,body { margin:0; padding:0; height:auto; overflow:hidden; }
  .page {
    writing-mode: vertical-rl;
    font-family: ${JSON.stringify(font)}, "Hiragino Mincho ProN", serif;
    font-size: ${fontSize}pt; line-height: 1.0;
    --cell: ${boxSize}mm;   /* grid pitch = one writing cell (box size) */
    --colH: 168mm;
    box-sizing: border-box; padding: 4mm 6mm;
    height: 178mm; width: 278mm; overflow: hidden;
  }
  .page + .page { page-break-before: always; }
  /* every character advances by one grid cell, so text and boxes share a grid */
  .col { margin-left: 2mm; height: var(--colH); letter-spacing: max(0px, calc(var(--cell) - 1em)); }
  .title { font-weight: bold; margin-left: 7mm; letter-spacing: normal; }
  .num { letter-spacing: max(0px, calc(var(--cell) - 1em)); }
  /* tested word: a side line on the RIGHT of the characters (vertical 傍線) */
  .read { border-right: 1.6px solid #333; padding-right: 1px; }
  .boxcol {
    position: relative; width: var(--cell); height: var(--colH); margin-left: 3mm;
  }
  .box {
    position: absolute; right: 0; width: var(--cell);
    border: 1.4px solid #222; box-sizing: border-box;
  }
</style></head><body>${pages}</body></html>`;
}
