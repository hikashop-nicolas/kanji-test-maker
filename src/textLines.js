// Cutting a scanned page into its lines of writing.
//
// The recognizer used here reads one line at a time, so something has to find
// the lines. Tesseract brings its own page analysis; this is the replacement
// for it, and it can be simple because it is looking at a worksheet: writing on
// paper, in rows or columns, with white between them. The same projection that
// decides which way the page reads (orientation.js) gives the cuts, since the
// bands of ink it counts along one axis are exactly the lines.
//
// It is deliberately not clever. A photograph of a magazine page, with columns
// beside pictures and captions at angles, is not something this will take
// apart, and the caller is expected to notice and fall back to a reader that
// does its own layout analysis.

import { inkOf, stripRules, sizeOf } from './orientation.js?v=2';

const SAMPLE = 1000; // long side in px for the measuring copy
const FLOOR = 0.02; // ink below this share of the busiest line reads as white
const MIN_RUN = 0.008; // a band thinner than this share of the page is a speck
const PAD = 6; // px of paper kept around a line, at the measuring scale
const SPLIT = 1.6; // a gap this many characters wide breaks a line in two

// A page -> its lines, in reading order. Each line is a list of pieces, cut
// from the original at full size: a heading with the class on one side of the
// page and the name field on the other is one line with a hand's breadth of
// white in the middle, and reads far better given to the recognizer in two.
// `vertical` says whether the writing runs down the page, in which case the
// lines are columns and are read right to left.
export function textLines(source, vertical) {
  const { w: fullW, h: fullH } = sizeOf(source);
  if (!fullW || !fullH) return [];
  const scale = Math.min(1, SAMPLE / Math.max(fullW, fullH));
  const w = Math.round(fullW * scale);
  const h = Math.round(fullH * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const ink = stripRules(inkOf(ctx.getImageData(0, 0, w, h).data, w, h), w, h);

  // across = the axis the lines stack along; along = the axis they run in
  const across = vertical ? w : h;
  const along = vertical ? h : w;
  const at = vertical ? (a, b) => b * w + a : (a, b) => a * w + b;
  const profile = new Uint32Array(across);
  for (let a = 0; a < across; a++) {
    for (let b = 0; b < along; b++) if (ink[at(a, b)]) profile[a]++;
  }
  const floor = Math.max(...profile) * FLOOR;
  const bands = [];
  let start = -1;
  for (let a = 0; a <= across; a++) {
    const inked = a < across && profile[a] > floor;
    if (inked && start < 0) start = a;
    if (!inked && start >= 0) {
      if (a - start >= across * MIN_RUN) bands.push([start, a]);
      start = -1;
    }
  }
  // vertical writing starts at the right-hand edge
  if (vertical) bands.reverse();

  const crop = (from, to, first, last) => {
    const box = vertical
      ? { x: from, y: first, w: to - from, h: last - first + 1 }
      : { x: first, y: from, w: last - first + 1, h: to - from };
    const x0 = Math.max(0, (box.x - PAD) / scale);
    const y0 = Math.max(0, (box.y - PAD) / scale);
    const x1 = Math.min(fullW, (box.x + box.w + PAD) / scale);
    const y1 = Math.min(fullH, (box.y + box.h + PAD) / scale);
    const cut = document.createElement('canvas');
    cut.width = Math.round(x1 - x0);
    cut.height = Math.round(y1 - y0);
    if (!cut.width || !cut.height) return null;
    cut.getContext('2d').drawImage(source, x0, y0, cut.width, cut.height, 0, 0, cut.width, cut.height);
    return cut;
  };

  return bands.map(([from, to]) => {
    // where this line has ink of its own, along its length. A short sentence is
    // trimmed to itself rather than padded out with the blank half of the page,
    // and a wide gap inside it is a break rather than a space.
    const runs = [];
    const gap = Math.max(2, Math.round((to - from) * SPLIT));
    let start = -1, lastInk = -1;
    for (let b = 0; b < along; b++) {
      let inked = false;
      for (let a = from; a < to; a++) if (ink[at(a, b)]) { inked = true; break; }
      if (!inked) continue;
      if (start < 0) start = b;
      else if (b - lastInk - 1 >= gap) { runs.push([start, lastInk]); start = b; }
      lastInk = b;
    }
    if (start >= 0) runs.push([start, lastInk]);
    return runs.map(([first, last]) => (last > first ? crop(from, to, first, last) : null)).filter(Boolean);
  }).filter(line => line.length);
}

// Does this look like a page that was taken apart properly? A single band
// covering everything means the lines were never separated, and hundreds of
// them means it found noise, not writing. Either way the page belongs to a
// reader that does its own layout analysis.
export function looksSplit(lines, source, vertical) {
  if (!lines.length || lines.length > 200) return false;
  const { w, h } = sizeOf(source);
  const span = vertical ? w : h;
  const pieces = lines.flat();
  const widest = Math.max(...pieces.map(p => (vertical ? p.width : p.height)));
  return widest < span * 0.6;
}
