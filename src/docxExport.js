// layout + the docx library -> a docx Document.
// Each sentence = two vertical cells: a text cell (readings side-lined) and a
// box cell to its left, whose boxes are pushed down with leading ideographic
// spaces so each box sits next to its word. Page orientation only + explicit
// row height / cell widths (the vertical content collapses otherwise).

import { circledExtended } from './model.js';

const VERT = 'TOP_TO_BOTTOM_RIGHT_TO_LEFT';
const ROW_H  = 10650; // column height, twips (~188mm, near the page limit)
const MM = 56.7;      // twips per mm
const CONTENT_TW = 16838 - 1200; // A4 landscape width minus L/R margins, twips

export function buildDocx(layout, docx) {
  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, TextDirection, PageOrientation, HeightRule,
    VerticalAlign, UnderlineType,
  } = docx;

  const fontSize = layout.fontSize || 16;       // pt
  const boxMm = layout.boxSize || 8;            // mm per writing cell
  const halfPt = Math.round(fontSize * 2);      // docx run size unit
  const fontTw = Math.round(fontSize * 20);     // glyph advance, twips
  const titleHalf = Math.round((layout.titleFontSize || fontSize) * 2);
  const CELL_TW = fontTw;                        // column pitch = font advance
  const BOX_TW = Math.round(boxMm * MM);        // box cell height = box-size setting
  const BOX_INNER = Math.round(boxMm * MM);     // box width = box-size setting
  const BOX_W = BOX_INNER + 160;                // box column width
  const TEXT_W = fontTw + 240;                  // text column width (one glyph + margin)
  const charSpace = 0;                           // text uses its natural pitch

  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: none, bottom: none, left: none, right: none };
  const solid = { style: BorderStyle.SINGLE, size: 6, color: '222222' };
  const allBorders = { top: solid, bottom: solid, left: solid, right: solid };
  const font = layout.font || 'Hiragino Mincho ProN';
  const text = (s, extra = {}) => new TextRun({ text: s, font, size: halfPt, characterSpacing: charSpace, ...extra });

  // A box-column cell is a nested 1-column table: alternating spacer rows
  // (no border) and box rows (bordered), heights given in twips so offsets
  // track the text pitch while boxes use the writing-cell size. Table cell
  // borders render reliably (unlike run borders).
  const innerRow = (borders, twips) => new TableRow({
    height: { value: Math.max(1, Math.round(twips)), rule: HeightRule.EXACT },
    children: [new TableCell({
      borders, width: { size: BOX_INNER, type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children: [new Paragraph({ spacing: { before: 0, after: 0, line: 1, lineRule: 'exact' }, children: [] })],
    })],
  });

  function makeCell(children, width) {
    return new TableCell({
      textDirection: TextDirection[VERT],
      verticalAlign: VerticalAlign.TOP,
      width: { size: width, type: WidthType.DXA },
      borders: noBorders,
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      children,
    });
  }

  function textCell(col) {
    const kids = [];
    if (col.number) kids.push(text(circledExtended(col.number)));
    for (const r of col.runs) {
      if (r.t === 'plain') kids.push(text(r.s));
      else kids.push(text(r.s, { underline: { type: UnderlineType.SINGLE, color: '333333' } }));
    }
    return makeCell([new Paragraph({ children: kids })], TEXT_W);
  }

  function boxCell(col) {
    const rows = [];
    let pos = 0; // current vertical position in twips
    for (const b of col.boxes) {
      const pad = b.offset * CELL_TW - pos;       // align box top to its word
      if (pad > 0) rows.push(innerRow(noBorders, pad));
      const boxH = b.cells * BOX_TW;
      rows.push(innerRow(allBorders, boxH));
      pos = b.offset * CELL_TW + boxH;
    }
    const children = rows.length
      ? [new Table({ width: { size: BOX_INNER, type: WidthType.DXA }, borders: noBorders, rows })]
      : [new Paragraph({ children: [] })];
    // default (horizontal) cell: the nested table's rows stack top-to-bottom and
    // align with the vertical text cell beside it.
    return new TableCell({
      verticalAlign: VerticalAlign.TOP,
      width: { size: BOX_W, type: WidthType.DXA },
      borders: noBorders,
      margins: { top: 60, bottom: 60, left: 40, right: 40 },
      children,
    });
  }

  function titleCell(headerText) {
    return makeCell([new Paragraph({ children: [new TextRun({ text: headerText, font, size: titleHalf, bold: true })] })], TEXT_W + 200);
  }

  const spacerCell = (w) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: noBorders,
    margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [new Paragraph({ children: [] })],
  });

  function pageTable(page) {
    const n = page.columns.length;
    // Distribute the leftover width as equal gaps so the sentences fill the page.
    const titleW = TEXT_W + 200;
    const used = n * (TEXT_W + BOX_W) + titleW;
    const gap = Math.max(120, Math.round((CONTENT_TW - used) / Math.max(1, n)));
    // visual left-to-right: [box_n, text_n, gap, ..., box_1, text_1, gap, title]
    const cells = [];
    for (let i = n - 1; i >= 0; i--) {
      cells.push(boxCell(page.columns[i]), textCell(page.columns[i]), spacerCell(gap));
    }
    cells.push(titleCell(page.header));
    return new Table({
      width: { size: CONTENT_TW, type: WidthType.DXA },
      borders: noBorders,
      rows: [new TableRow({ height: { value: ROW_H, rule: HeightRule.ATLEAST }, children: cells })],
    });
  }

  const sections = layout.pages.map(page => ({
    properties: { page: {
      size: { orientation: PageOrientation.LANDSCAPE },
      margin: { top: 600, bottom: 600, left: 600, right: 600 },
    }},
    children: [pageTable(page)],
  }));

  return new Document({ sections });
}
