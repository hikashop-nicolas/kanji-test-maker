// layout + the docx library -> a docx Document.
// Each sentence = two vertical cells: a text cell (readings side-lined) and a
// box cell to its left, whose boxes are pushed down with leading ideographic
// spaces so each box sits next to its word. Page orientation only + explicit
// row height / cell widths (the vertical content collapses otherwise).

import { circledExtended, layoutBoxes } from './model.js';

const VERT = 'TOP_TO_BOTTOM_RIGHT_TO_LEFT';
const ROW_H  = 10650; // column height, twips (~188mm, near the page limit)
const MM = 56.7;      // twips per mm
const CONTENT_TW = 16838 - 1200; // A4 landscape width minus L/R margins, twips

// embeddedFonts: optional [{ name, data }] to embed the font in the .docx so it
// renders in Word without being installed (the lib obfuscates + writes the
// fontTable). Use for OFL fonts like Klee One / LINE Seed JP.
export function buildDocx(layout, docx, embeddedFonts = [], opts = {}) {
  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, TextDirection, PageOrientation, HeightRule,
    VerticalAlign, UnderlineType, ImportedXmlComponent, AlignmentType, LineRuleType,
    Footer, PageNumber, ImageRun, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom,
  } = docx;
  const answers = !!opts.answers; // fill the boxes with the answer (answer key)
  const inline = (layout.blankPos || 'inline') === 'inline'; // boxes in the flow vs a side column
  const extras = !!layout.extras; // points + seal boxes beside the title
  const total = layout.pageCount || layout.pages.length;
  const EX_MM = 14;                              // points/seal box size, mm
  const EX_TW = Math.round(EX_MM * 56.7);        // ... in twips
  const mmEmu = mm => Math.round(mm * 36000);    // mm -> EMU
  const mmPx = mm => Math.round(mm * 96 / 25.4); // mm -> px (docx image units)

  const fontSize = layout.fontSize || 16;       // pt
  const boxMm = layout.boxSize || 8;            // mm per writing cell
  const halfPt = Math.round(fontSize * 2);      // docx run size unit
  const fontTw = Math.round(fontSize * 20);     // glyph advance, twips
  const titleHalf = Math.round((layout.titleFontSize || fontSize) * 2);
  const CELL_TW = fontTw;                        // column pitch = font advance
  const BOX_TW = Math.round(boxMm * MM);        // box cell height = box-size setting
  const BOX_INNER = Math.round(boxMm * MM);     // box width = box-size setting
  const BOX_W = BOX_INNER + 160;                // box column width
  const ansHalf = Math.max(16, Math.round(boxMm * 4.4)); // answer glyph size (half-pt), sized to the box
  const boxHalf = Math.max(halfPt, Math.round(boxMm * 5.67)); // inline box glyph size (half-pt) ~ box-size mm
  const TEXT_W = fontTw + 240;                  // text column width (one glyph + margin)
  const INLINE_W = BOX_INNER + 300;             // inline sentence column width (fits the boxes)
  const charSpace = 0;                           // text uses its natural pitch

  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: none, bottom: none, left: none, right: none };
  const solid = { style: BorderStyle.SINGLE, size: 6, color: '222222' };
  const allBorders = { top: solid, bottom: solid, left: solid, right: solid };
  const font = layout.font || 'Hiragino Mincho ProN';
  const text = (s, extra = {}) => new TextRun({ text: s, font, size: halfPt, characterSpacing: charSpace, ...extra });

  // Furigana: a real w:ruby run (the lib has no Ruby type, so inject the XML).
  const xmlEsc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rtHalf = Math.max(10, Math.round(halfPt / 2));   // furigana size, half-pt
  function rubyRun(base, rt) {
    const rf = `<w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}"/>`;
    const xml =
      `<w:r><w:ruby>` +
      `<w:rubyPr><w:rubyAlign w:val="distributeSpace"/><w:hps w:val="${rtHalf}"/><w:hpsRaise w:val="${halfPt}"/><w:hpsBaseText w:val="${halfPt}"/><w:lid w:val="ja-JP"/></w:rubyPr>` +
      `<w:rt><w:r><w:rPr>${rf}<w:sz w:val="${rtHalf}"/><w:szCs w:val="${rtHalf}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(rt)}</w:t></w:r></w:rt>` +
      `<w:rubyBase><w:r><w:rPr>${rf}<w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(base)}</w:t></w:r></w:rubyBase>` +
      `</w:ruby></w:r>`;
    return ImportedXmlComponent.fromXmlString(xml);
  }

  // Inline tested word (文中 layout). 書き: a ruby whose base is the answer boxes
  // (bordered runs, empty or holding the answer) with the reading as furigana.
  // 読み: the kanji (side-lined) with the reading slot as the furigana.
  const rf = `<w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}"/>`;
  function inlineTestRun(r) {
    if (r.mode === 'yomi') {
      const rt = answers ? xmlEsc(r.answer || '') : '　'; // keep the slot height in the question
      const base = `<w:r><w:rPr>${rf}<w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/><w:u w:val="single" w:color="333333"/></w:rPr><w:t xml:space="preserve">${xmlEsc(r.surface)}</w:t></w:r>`;
      const xml = `<w:r><w:ruby><w:rubyPr><w:rubyAlign w:val="distributeSpace"/><w:hps w:val="${rtHalf}"/><w:hpsRaise w:val="${halfPt}"/><w:hpsBaseText w:val="${halfPt}"/><w:lid w:val="ja-JP"/></w:rubyPr>` +
        `<w:rt><w:r><w:rPr>${rf}<w:sz w:val="${rtHalf}"/><w:szCs w:val="${rtHalf}"/><w:color w:val="C0392B"/></w:rPr><w:t xml:space="preserve">${rt}</w:t></w:r></w:rt>` +
        `<w:rubyBase>${base}</w:rubyBase></w:ruby></w:r>`;
      return ImportedXmlComponent.fromXmlString(xml);
    }
    // Each cell is a literal box glyph (□), or the answer kanji in red on the key.
    // (A real run-border / w:bdr is ignored by some readers, so use a glyph.)
    const chars = answers ? [...(r.answer || '')] : null;
    let base = '';
    for (let i = 0; i < r.cells; i++) {
      const ch = chars && chars[i] ? xmlEsc(chars[i]) : '□';
      const col = chars && chars[i] ? '<w:color w:val="C0392B"/>' : '';
      base += `<w:r><w:rPr>${rf}<w:sz w:val="${boxHalf}"/><w:szCs w:val="${boxHalf}"/>${col}</w:rPr><w:t xml:space="preserve">${ch}</w:t></w:r>`;
    }
    const xml = `<w:r><w:ruby><w:rubyPr><w:rubyAlign w:val="center"/><w:hps w:val="${rtHalf}"/><w:hpsRaise w:val="${boxHalf}"/><w:hpsBaseText w:val="${boxHalf}"/><w:lid w:val="ja-JP"/></w:rubyPr>` +
      `<w:rt><w:r><w:rPr>${rf}<w:sz w:val="${rtHalf}"/><w:szCs w:val="${rtHalf}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(r.reading || '')}</w:t></w:r></w:rt>` +
      `<w:rubyBase>${base}</w:rubyBase></w:ruby></w:r>`;
    return ImportedXmlComponent.fromXmlString(xml);
  }

  // A box-column cell is a nested 1-column table: alternating spacer rows
  // (no border) and box rows (bordered), heights given in twips so offsets
  // track the text pitch while boxes use the writing-cell size. Table cell
  // borders render reliably (unlike run borders).
  const innerRow = (borders, twips, ansText) => new TableRow({
    height: { value: Math.max(1, Math.round(twips)), rule: HeightRule.EXACT },
    children: [new TableCell({
      borders, width: { size: BOX_INNER, type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      textDirection: ansText ? TextDirection[VERT] : undefined,
      verticalAlign: VerticalAlign.CENTER,
      children: [ansText
        ? new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: ansText, font, size: ansHalf, color: 'C0392B' })] })
        : new Paragraph({ spacing: { before: 0, after: 0, line: 1, lineRule: 'exact' }, children: [] })],
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
      if (r.t === 'plain' || r.t === 'kana') kids.push(text(r.s));
      else if (r.t === 'furi') kids.push(rubyRun(r.base, r.rt));
      else if (r.t === 'read') kids.push(inline
        ? inlineTestRun(r)
        : text(r.s, { underline: { type: UnderlineType.SINGLE, color: '333333' } }));
    }
    // hanging indent so a wrapped sentence's extra columns start below the
    // circled number (level with the first character); 1.3 line spacing gives
    // the columns a gap so a side line never touches the next column.
    return makeCell([new Paragraph({
      indent: { hanging: CELL_TW },
      spacing: { line: 312, lineRule: LineRuleType.AUTO }, // 312 = 1.3 x 240
      children: kids,
    })], inline ? INLINE_W : TEXT_W);
  }

  function boxCell(col) {
    const positions = layoutBoxes(col.boxes, CELL_TW, BOX_TW, 30, ROW_H); // push-down/up within the column
    const rows = [];
    let cum = 0; // current vertical position in twips
    positions.forEach((p, i) => {
      const top = Math.round(p.top), h = Math.round(p.height);
      if (top - cum > 0) rows.push(innerRow(noBorders, top - cum));
      rows.push(innerRow(allBorders, h, answers ? (col.boxes[i].answer || '') : undefined));
      cum = top + h;
    });
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

  function titleCell(h) {
    const t = (s) => new TextRun({ text: s, font, size: titleHalf, bold: true });
    const runs = [t(h.pre)];
    if (h.lesson) {
      const lnum = parseInt(h.lesson, 10);
      runs.push(t(isNaN(lnum) ? h.lesson : circledExtended(lnum)));
    }
    runs.push(t(h.post));
    return makeCell([new Paragraph({ children: runs })], TEXT_W + 200);
  }

  // points (点) + parent's-seal (印) boxes, bottom-aligned in their own column
  function extrasCell() {
    const exLabel = (s) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 20 }, children: [new TextRun({ text: s, font, size: titleHalf, bold: true })] });
    const exBox = () => new Table({
      width: { size: EX_TW, type: WidthType.DXA }, borders: noBorders,
      rows: [new TableRow({ height: { value: EX_TW, rule: HeightRule.EXACT }, children: [
        new TableCell({ borders: allBorders, width: { size: EX_TW, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [new Paragraph({ children: [] })] }),
      ] })],
    });
    return new TableCell({
      verticalAlign: VerticalAlign.BOTTOM,
      width: { size: EX_TW + 200, type: WidthType.DXA }, borders: noBorders,
      margins: { top: 60, bottom: 160, left: 40, right: 40 },
      children: [exLabel('点'), exBox(), exLabel('印'), exBox()],
    });
  }

  function dataUrlToBytes(u) {
    const b64 = u.split(',')[1] || '';
    const bin = atob(b64);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  // a floating image anchored to the bottom-left of the page
  function imagePara() {
    const u = layout.image;
    const mime = u.substring(5, u.indexOf(';'));
    const type = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const dims = layout.imageDims || { w: 5, h: 3 };
    const wmm = 40, hmm = Math.max(8, Math.round(40 * dims.h / dims.w));
    return new Paragraph({ children: [new ImageRun({
      type, data: dataUrlToBytes(u),
      transformation: { width: mmPx(wmm), height: mmPx(hmm) },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: mmEmu(6) },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: mmEmu(210 - hmm - 6) },
        allowOverlap: true, behindDocument: true,
      },
    })] });
  }

  const spacerCell = (w) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: noBorders,
    margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [new Paragraph({ children: [] })],
  });

  // title only on the first page; points/seal boxes only on the last page.
  function pageTable(page, isFirst, isLast) {
    const n = page.columns.length;
    const hasTitle = isFirst, hasExtras = extras && isLast;
    const colW = inline ? INLINE_W : (TEXT_W + BOX_W);
    const used = n * colW + (hasTitle ? TEXT_W + 200 : 0) + (hasExtras ? EX_TW + 200 : 0);
    const gap = Math.max(120, Math.round((CONTENT_TW - used) / Math.max(1, n)));
    // visual left-to-right: [box_n, text_n, gap, ..., box_1, text_1, gap, extras, title]
    // (inline mode drops the separate box column: the boxes live in the text)
    const cells = [];
    for (let i = n - 1; i >= 0; i--) {
      if (!inline) cells.push(boxCell(page.columns[i]));
      cells.push(textCell(page.columns[i]), spacerCell(gap));
    }
    if (hasExtras) cells.push(extrasCell());
    if (hasTitle) cells.push(titleCell(layout.header || { pre: '', lesson: '', post: '' }));
    if (!cells.length) cells.push(spacerCell(CONTENT_TW));
    return new Table({
      width: { size: CONTENT_TW, type: WidthType.DXA },
      borders: noBorders,
      rows: [new TableRow({ height: { value: ROW_H, rule: HeightRule.ATLEAST }, children: cells })],
    });
  }

  const sections = layout.pages.map((page, idx) => {
    const children = [];
    if (layout.image) children.push(imagePara());
    children.push(pageTable(page, idx === 0, idx === layout.pages.length - 1));
    const sec = {
      properties: { page: {
        size: { orientation: PageOrientation.LANDSCAPE },
        margin: { top: 600, bottom: 600, left: 600, right: 600 },
      }},
      children,
    };
    if (total > 1) sec.footers = { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], font: 'Arial', size: 18 })],
    })] }) };
    return sec;
  });

  const docOpts = { sections };
  if (embeddedFonts && embeddedFonts.length) docOpts.fonts = embeddedFonts;
  return new Document(docOpts);
}
