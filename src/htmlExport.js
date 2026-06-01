// Pure: layout -> standalone vertical-writing HTML (preview + PDF via print).
// The page is a horizontal flex row (reading right to left) whose items are
// distributed with space-between, so the sentences fill the page width based on
// how many there are. Each sentence is the text column plus a box column (to
// its left) aligned on a shared cell grid (pitch = box size).

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
  return `<div class="sentence">${text}${boxcol}</div>`;
}

export function buildHtml(layout, opts = {}) {
  const font = opts.font || layout.font || 'Hiragino Mincho ProN';
  const fontSize = layout.fontSize || 18; // pt
  const boxSize = layout.boxSize || 10;   // mm per writing cell
  const pages = layout.pages.map(p => {
    const header = `<div class="title col">${esc(p.header)}</div>`;
    const cols = p.columns.map(sentenceHtml).join('');
    return `<section class="page">${header}${cols}</section>`;
  }).join('');

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>
  ${opts.fontFace || ''}
  @page { size: A4 landscape; margin: 8mm; }
  html,body { margin:0; padding:0; }
  .page {
    display: flex; flex-direction: row-reverse; justify-content: space-between;
    align-items: flex-start;
    font-family: ${JSON.stringify(font)}, "Hiragino Mincho ProN", serif;
    font-size: ${fontSize}pt;
    --cell: 1em;            /* column pitch = the font's natural advance */
    --bw: ${boxSize}mm;     /* answer-box width (the box-size setting) */
    --colH: 182mm;
    box-sizing: border-box; padding: 4mm 6mm;
    width: 281mm; height: 192mm; overflow: hidden;
  }
  .page + .page { page-break-before: always; }
  .sentence { display: flex; flex-direction: row-reverse; align-items: flex-start; }
  /* vertical text, natural pitch so a sentence stays in one column */
  .col { writing-mode: vertical-rl; line-height: 1.0; height: var(--colH); }
  .title { writing-mode: vertical-rl; line-height: 1.0; height: var(--colH); font-weight: bold; }
  /* tested word: a side line on the RIGHT of the characters (vertical 傍線) */
  .read { border-right: 1.6px solid #333; padding-right: 1px; }
  .boxcol { position: relative; width: var(--bw); height: var(--colH); margin-right: 2mm; }
  .box {
    position: absolute; right: 0; width: var(--bw);
    border: 1.4px solid #222; box-sizing: border-box;
  }
</style></head><body>${pages}</body></html>`;
}
