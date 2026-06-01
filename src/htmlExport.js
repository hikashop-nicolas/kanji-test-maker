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
    `<span class="box" style="top:calc(${b.offset} * var(--cell));height:calc(${b.cells} * var(--bh))"></span>`
  ).join('');
  const boxcol = `<div class="boxcol">${boxes}</div>`;
  return text + boxcol; // text on the right, box column to its left
}

export function buildHtml(layout, opts = {}) {
  const font = opts.font || layout.font || 'Hiragino Mincho ProN';
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
    font-size: 16pt; line-height: 1.0;
    --cell: 1em;     /* vertical advance of one reading character */
    --bh: 1.5em;     /* height of one writing cell (a bit taller than text) */
    --colH: 168mm;
    box-sizing: border-box; padding: 4mm 6mm;
    height: 178mm; width: 278mm; overflow: hidden;
  }
  .page + .page { page-break-before: always; }
  .col { margin-left: 2mm; height: var(--colH); }
  .title { font-weight: bold; margin-left: 7mm; }
  .num { margin-bottom: 1mm; }
  /* tested word: a side line on the RIGHT of the characters (vertical 傍線) */
  .read { border-right: 1.6px solid #333; padding-right: 1px; }
  .boxcol {
    position: relative; width: 1.7em; height: var(--colH); margin-left: 4mm;
  }
  .box {
    position: absolute; right: .1em; width: 1.5em;
    border: 1.4px solid #222; box-sizing: border-box;
  }
</style></head><body>${pages}</body></html>`;
}
