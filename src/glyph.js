// Draws the characters that do not exist, from KanjiVG stroke data.
// Pure: give it assets/data/kanji-strokes.json and a cell from distractors.js.
//
// Two rules the drawing follows, both learned by getting them wrong (see
// docs/CHOICE_PLAN.md 4.1):
//
//  - A borrowed component is copied at its own size, never fitted to the slot.
//    Every kanji is drawn in the same square, so a left radical already sits at
//    x 11..36 whichever kanji it came from.
//  - The transform goes into the path data, not onto a <g>. A scaled group
//    carries its stroke width with it, so a narrowed element would come out
//    thinner than the rest of the character.

const STROKE_W = 5.2;                              // in the 109-unit square
// KanjiVG's ink sits inside a margin, so the em box is the ink box, not 0..109
export const VIEW_BOX = '10 10 89 89';
const ALONE = { x0: 13, y0: 10, x1: 98, y1: 100 }; // where a character sits on its own
const RIGHT = { x0: 36, y0: 10, x1: 98, y1: 100 }; // ... and beside a left radical
const MAX_ANISO = 1.45;                            // no caricatures

let S = null;   // literal -> { s: [path], g: [[element, position, at, n]] }

export function setStrokes(data) { S = data; }
export function haveStrokes() { return !!S; }

// The control-point hull. Close enough to place one part inside another's slot,
// and it needs no bezier maths.
function bbox(paths) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const d of paths) {
    const toks = d.match(/[a-zA-Z]|-?[\d.]+(?:e-?\d+)?/g) || [];
    let cx = 0, cy = 0, rel = false, nums = [], first = true;
    const flush = () => {
      for (let k = 0; k + 1 < nums.length; k += 2) {
        const x = rel ? cx + nums[k] : nums[k], y = rel ? cy + nums[k + 1] : nums[k + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (nums.length >= 2) {
        const n = nums.length;
        cx = rel ? cx + nums[n - 2] : nums[n - 2];
        cy = rel ? cy + nums[n - 1] : nums[n - 1];
      }
      nums = [];
    };
    for (const t of toks) {
      if (/[a-zA-Z]/.test(t)) { flush(); rel = t === t.toLowerCase() && !(first && t === 'm'); first = false; }
      else nums.push(parseFloat(t));
    }
    flush();
  }
  return { x0, y0, x1, y1, w: (x1 - x0) || 1, h: (y1 - y0) || 1 };
}

// Bake an affine into the path itself. KanjiVG uses only M/m/c/C/s/S, so every
// number is part of an x,y pair and a relative command takes the scale but not
// the shift.
function xform(d, sx, sy, tx, ty) {
  const toks = d.match(/[a-zA-Z]|-?[\d.]+(?:e-?\d+)?/g) || [];
  const out = [];
  let cmd = '', first = true, nums = [];
  const emit = () => {
    if (!cmd) return;
    const abs = cmd === cmd.toUpperCase() || (first && cmd.toLowerCase() === 'm');
    const parts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = nums[i] * sx + (abs ? tx : 0), y = nums[i + 1] * sy + (abs ? ty : 0);
      parts.push(`${+x.toFixed(2)},${+y.toFixed(2)}`);
    }
    out.push((first && cmd === 'm' ? 'M' : cmd) + parts.join(' '));
    first = false; nums = [];
  };
  for (const t of toks) {
    if (/[a-zA-Z]/.test(t)) { emit(); cmd = t; } else nums.push(parseFloat(t));
  }
  emit();
  return out.join('');
}

// map a set of paths onto a target box, narrowing rather than shrinking
function place(paths, T) {
  const b = bbox(paths);
  let sx = (T.x1 - T.x0) / b.w, sy = (T.y1 - T.y0) / b.h;
  const r = sx / sy;
  if (r > MAX_ANISO) sx = sy * MAX_ANISO;
  if (r < 1 / MAX_ANISO) sy = sx * MAX_ANISO;
  const tx = T.x0 + ((T.x1 - T.x0) - b.w * sx) / 2 - b.x0 * sx;
  const ty = T.y0 + ((T.y1 - T.y0) - b.h * sy) / 2 - b.y0 * sy;
  return paths.map(d => xform(d, sx, sy, tx, ty));
}

const groupPaths = (e, gi) => e.s.slice(e.g[gi][2], e.g[gi][2] + e.g[gi][3]);
const withoutGroup = (e, gi) => {
  const [, , at, n] = e.g[gi];
  return [...e.s.slice(0, at), ...e.s.slice(at + n)];
};
function findGroup(entry, element) {
  if (!entry) return -1;
  return entry.g.findIndex(g => g[0] === element);
}

// The paths of one cell, in a 109-unit square. null when it cannot be drawn.
export function cellPaths(cell) {
  if (!cell || cell.ch) return null;
  if (!S) return null;
  // a real character, drawn: on a sheet that invents characters every choice is
  // drawn, or the invented ones would stand out by their weight alone
  if (cell.draw) return S[cell.draw] ? S[cell.draw].s : null;
  const e = S[cell.base];
  if (!e || !e.s || !e.s.length) return null;
  // 川 and 火 have no component groups at all, which is exactly why they get a
  // component put in: that operation needs the strokes, not the groups.
  if (cell.op === 'put') {
    const donor = S[cell.donor];
    const gi = findGroup(donor, cell.part);
    if (gi < 0) return null;
    return [...groupPaths(donor, gi), ...place(e.s, RIGHT)];
  }
  if (!e.g || !e.g.length) return null;
  if (cell.op === 'take') {
    if (cell.at >= e.g.length) return null;
    const rest = withoutGroup(e, cell.at);
    return rest.length ? place(rest, ALONE) : null;
  }
  if (cell.op === 'swap') {
    const donor = S[cell.donor];
    const gi = findGroup(donor, cell.part);
    if (gi < 0 || cell.at >= e.g.length) return null;
    // both sit in the same place in the same square, so the donor is copied as
    // it is: scaling it into the old part's box is what made this look wrong
    return [...withoutGroup(e, cell.at), ...groupPaths(donor, gi)];
  }
  return null;
}

// An <svg> for one cell, sized so its ink matches a character of the same font
// size. `cls` goes on the element; `color` defaults to the inherited colour.
export function cellSvg(cell, opts = {}) {
  const paths = cellPaths(cell);
  if (!paths) return '';
  const w = opts.width || '1em', h = opts.height || '1em';
  const stroke = opts.color || 'currentColor';
  const body = paths.map(d =>
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${STROKE_W}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const cls = opts.cls ? ` class="${opts.cls}"` : '';
  const extra = opts.style ? ` style="${opts.style}"` : '';
  return `<svg${cls}${extra} xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" width="${w}" height="${h}">${body}</svg>`;
}
