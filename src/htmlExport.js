// Pure: layout -> standalone vertical-writing HTML (preview + PDF via print).
// The page is a right-to-left flex row (space-between) so sentences fill the
// page width. Each sentence = a text column (natural pitch, tested words
// side-lined on the right) plus a box column to its left whose boxes align to
// their word; box width and per-cell height come from the box-size setting.

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function runHtml(r) {
  if (r.t === 'plain') return `<span class="plain">${esc(r.s)}</span>`;
  return `<span class="read">${esc(r.s)}</span>`;
}

function sentenceHtml(col) {
  const num = `<span class="num">${esc(col.number)}</span>`;
  const text = `<div class="col">${num}${col.runs.map(runHtml).join('')}</div>`;
  const boxes = col.boxes.map(b =>
    `<span class="box" style="top:calc(${b.offset} * var(--cell));height:calc(${b.cells} * var(--box))"></span>`
  ).join('');
  const boxcol = `<div class="boxcol">${boxes}</div>`;
  return `<div class="sentence">${text}${boxcol}</div>`;
}

export function buildHtml(layout, opts = {}) {
  const font = opts.font || layout.font || 'Hiragino Mincho ProN';
  const fontSize = layout.fontSize || 18;            // pt
  const boxSize = layout.boxSize || 10;              // mm per writing cell
  const titleFontSize = layout.titleFontSize || fontSize;
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
    --box: ${boxSize}mm;    /* answer box: width and per-cell height */
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
  /* sentence number: a plain number drawn inside a circle (works for any value) */
  .num {
    display: inline-block; box-sizing: border-box;
    width: 1.5em; height: 1.5em; line-height: 1.36em; text-align: center;
    border: 1.6px solid #222; border-radius: 50%; font-size: .82em;
    text-combine-upright: all; margin-bottom: 1.5mm;
  }
  .boxcol { position: relative; width: var(--box); height: var(--colH); margin-right: 2mm; }
  .box {
    position: absolute; right: 0; width: var(--box);
    border: 1.4px solid #222; box-sizing: border-box;
  }
</style></head><body>${pages}</body></html>`;
}
