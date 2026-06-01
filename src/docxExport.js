// layout + the docx library -> a docx Document.
// Each sentence = two vertical cells: a text cell (readings side-lined) and a
// box cell to its left, whose boxes are pushed down with leading ideographic
// spaces so each box sits next to its word. Page orientation only + explicit
// row height / cell widths (the vertical content collapses otherwise).

const VERT = 'TOP_TO_BOTTOM_RIGHT_TO_LEFT';
const TEXT_W = 820;   // text column width, twips
const BOX_W  = 760;   // box column width, twips
const BOX_INNER = 460;// inner box width, twips (~8mm)
const ROW_H  = 9300;  // column height, twips (~164mm)
const CELL_TW = 360;  // vertical advance of one character, twips (tuned to font size)

export function buildDocx(layout, docx) {
  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, TextDirection, PageOrientation, HeightRule,
    VerticalAlign, UnderlineType,
  } = docx;

  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: none, bottom: none, left: none, right: none };
  const solid = { style: BorderStyle.SINGLE, size: 6, color: '222222' };
  const allBorders = { top: solid, bottom: solid, left: solid, right: solid };
  const font = layout.font || 'Hiragino Mincho ProN';
  const text = (s, extra = {}) => new TextRun({ text: s, font, size: 32, ...extra });

  // A box-column cell is a nested 1-column table: alternating spacer rows
  // (no border, height = offset) and box rows (bordered, height = cells), with
  // EXACT row heights. Table cell borders render reliably (unlike run borders).
  const innerCell = (borders, h) => new TableCell({
    borders, width: { size: BOX_INNER, type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children: [new Paragraph({ spacing: { before: 0, after: 0, line: 1, lineRule: 'exact' }, children: [] })],
  });
  const innerRow = (borders, cells) => new TableRow({
    height: { value: Math.max(1, cells) * CELL_TW, rule: HeightRule.EXACT },
    children: [innerCell(borders, cells)],
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
    if (col.number) kids.push(text(col.number));
    for (const r of col.runs) {
      if (r.t === 'plain') kids.push(text(r.s));
      else kids.push(text(r.s, { underline: { type: UnderlineType.SINGLE, color: '333333' } }));
    }
    return makeCell([new Paragraph({ children: kids })], TEXT_W);
  }

  function boxCell(col) {
    const rows = [];
    let pos = 0;
    for (const b of col.boxes) {
      const pad = b.offset - pos;
      if (pad > 0) rows.push(innerRow(noBorders, pad));
      rows.push(innerRow(allBorders, b.cells));
      pos = b.offset + b.cells;
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
    return makeCell([new Paragraph({ children: [new TextRun({ text: headerText, font, size: 32, bold: true })] })], TEXT_W + 200);
  }

  function pageTable(page) {
    // visual left-to-right: [box_n, text_n, ..., box_1, text_1, title]
    const pairs = page.columns.map(c => [boxCell(c), textCell(c)]);
    pairs.reverse();
    const cells = pairs.flat();
    cells.push(titleCell(page.header));
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
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
