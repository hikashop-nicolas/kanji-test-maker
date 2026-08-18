// Rebuilding lines from a PDF text layer.
//
// A PDF stores placed glyphs, not lines. Producers that write vertical Japanese
// (Excel and Word through Quartz, for one) emit one item per character down a
// column, so the text has to be reassembled from the coordinates. These are pure
// functions over pdf.js text items, kept out of app.js so tools/ can test them.

// pdf.js item -> {s, x, y, size}, in device space (y grows downward) so that a
// rotated page comes out the same as an upright one.
function place(item, m) {
  const t = item.transform;
  return {
    s: item.str,
    x: m[0] * t[4] + m[2] * t[5] + m[4],
    y: m[1] * t[4] + m[3] * t[5] + m[5],
    size: Math.abs(t[0]) || Math.abs(t[3]) || 10,
  };
}

// Walks the items in the order the producer wrote them, which is reading order,
// and only asks the coordinates where one line ends and the next begins: the
// next glyph either continues down the column or across the row, or it does not.
function runsOf(items, matrix) {
  const runs = [];
  let run = null;
  for (const item of items) {
    if (!item.str) continue;
    const g = place(item, matrix);
    const tol = Math.max(0.5, g.size * 0.3);
    if (run) {
      const last = run.last;
      const down = Math.abs(g.x - last.x) <= tol && g.y > last.y - tol;
      const across = Math.abs(g.y - last.y) <= tol && g.x > last.x - tol;
      // the direction is settled by the second glyph and holds for the run
      if ((run.vertical === true && down) || (run.vertical === false && across) ||
          (run.vertical === null && (down || across))) {
        if (run.vertical === null) run.vertical = down;
        run.text += g.s;
        run.last = g;
        run.x2 = Math.max(run.x2, g.x + g.size);
        run.y2 = Math.max(run.y2, g.y + g.size);
        continue;
      }
    }
    run = { text: g.s, vertical: null, x: g.x, y: g.y, x2: g.x + g.size, y2: g.y + g.size, last: g };
    runs.push(run);
  }
  // a lone glyph is read as part of whatever surrounds it
  for (const r of runs) if (r.vertical === null) r.vertical = false;
  return runs;
}

// Columns of vertical text read right to left, but only within their own block:
// a worksheet with two blocks of 25 columns has to give all of the top block
// before the bottom one, not interleave them by x. Runs whose vertical extents
// overlap are one block.
function bandsOf(runs) {
  const bands = [];
  for (const r of [...runs].sort((a, b) => a.y - b.y)) {
    const band = bands[bands.length - 1];
    if (band && r.y < band.y2 - 1 && band.vertical === r.vertical) {
      band.runs.push(r);
      band.y2 = Math.max(band.y2, r.y2);
    } else {
      bands.push({ runs: [r], y: r.y, y2: r.y2, vertical: r.vertical });
    }
  }
  for (const b of bands) {
    b.runs.sort((p, q) => (b.vertical ? q.x - p.x : p.x - q.x));
  }
  return bands;
}

// Vertical text swaps 。 and ー for their rotated glyphs, which have no Unicode
// of their own, so a subsetted font comes back with the raw glyph code instead:
// ascii "!" and '"'. Neither is something Japanese text contains in these
// positions, so put back what was written. Rarer vertical forms (、 above all)
// land on later codes in an order that is particular to each file, and are left
// alone rather than guessed at.
const KUTEN = /([぀-ヿ㐀-鿿])!$/;
const CHOON = /([ァ-ヴ])"/g;

// text items of one page -> lines, in reading order
export function pageLines(items, matrix) {
  return bandsOf(runsOf(items, matrix))
    .flatMap(b => b.runs)
    .map(r => r.text.replace(KUTEN, '$1。').replace(CHOON, '$1ー').trim())
    .filter(Boolean);
}
