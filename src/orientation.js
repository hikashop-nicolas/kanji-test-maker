// Which way a scanned page is written: across it, or down it (縦書き).
//
// The recognizer needs telling, and reads a page as noise when told wrong, so
// it is worth working out from the page itself. Japanese sets its characters on
// a grid either way, and what separates the two is where the white space runs:
// between the lines of horizontal writing there is a clear band of white the
// full width of the page, and between the columns of vertical writing the same
// band runs the full height. Project the ink onto both axes, and the axis whose
// profile is cut into bands is the axis the lines stack along.
//
// Two things on a real page get in the way. Printed rules, the squares of a
// 原稿用紙 or the boxes an exercise leaves for answers, are white on neither
// axis, so they are wiped out first: a stroke running half the page is print,
// not handwriting. And a sheet is never quite straight on the glass, which
// smears the bands until there is nothing to measure, so each axis is projected
// at the slight angle that makes its bands sharpest.
//
// A page holding a single line needs care: it has no second line to leave a gap
// against, so the space between its characters is the only white there is. It
// is recognized by the ink being a single character thick, and then the writing
// simply runs along the long side.
//
// What this cannot see is a page fed to the scanner sideways: its characters
// are lying down, and lying-down horizontal writing has exactly the geometry of
// upright vertical writing. Telling those apart means reading a character,
// which is what the teacher's own eyes are for; hence the override.

const SAMPLE = 700; // long side in px: keeps the gaps, small enough to be quick
const BLANK = 0.05; // ink below this share of the profile's peak reads as white
const MIN_GAP = 0.006; // a gap shorter than this share of the page is noise
const THIN = 2.2; // ink this few characters thick is a single line, not a page
const RULE = 0.5; // an unbroken stroke this much of the way across is printed
const SKEW = 0.07; // how far off straight a sheet is allowed to be (about 4°)
const SKEW_STEPS = 8;

// grayscale -> the threshold that best splits it in two (Otsu)
function otsu(gray) {
  const hist = new Uint32Array(256);
  for (const g of gray) hist[g]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let best = 128, most = -1, back = 0, backSum = 0;
  for (let i = 0; i < 256; i++) {
    back += hist[i];
    if (!back) continue;
    const fore = gray.length - back;
    if (!fore) break;
    backSum += i * hist[i];
    const between = back * fore * ((backSum / back) - ((sum - backSum) / fore)) ** 2;
    if (between > most) { most = between; best = i; }
  }
  return best;
}

// RGBA pixels -> 1 where there is ink, 0 where there is paper
export function inkOf(data, w, h) {
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    // where the image is transparent it is paper, not ink
    const a = data[p + 3] / 255;
    gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) * a + 255 * (1 - a);
  }
  const cut = otsu(gray);
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) ink[i] = gray[i] < cut ? 1 : 0;
  return ink;
}

// Wipe the printed rules: no hand draws an unbroken stroke half the width of
// the page, but a table, an answer box and a writing grid all do, and they run
// both ways at once, which is exactly the distinction being measured.
export function stripRules(ink, w, h) {
  const kill = [];
  const scan = (n, m, at) => {
    for (let a = 0; a < n; a++) {
      let run = 0;
      for (let b = 0; b <= m; b++) {
        if (b < m && ink[at(a, b)]) { run++; continue; }
        if (run >= m * RULE) for (let k = b - run; k < b; k++) kill.push(at(a, k));
        run = 0;
      }
    }
  };
  scan(h, w, (y, x) => y * w + x);
  scan(w, h, (x, y) => y * w + x);
  for (const i of kill) ink[i] = 0;
  return ink;
}

// A profile, read as bands of ink separated by white: how much of it is white,
// how many bands there are, and how thick the usual band is.
function shapeOf(profile, minGap) {
  const peak = Math.max(...profile);
  if (!peak) return { blank: 1, bands: 0, band: 0 };
  const floor = peak * BLANK;
  const widths = [];
  let blank = 0, run = 0, band = 0;
  for (let i = 0; i <= profile.length; i++) {
    const white = i === profile.length || profile[i] <= floor;
    if (white) { run++; continue; }
    // a gap only counts as spacing once it is wider than the pinch between two
    // strokes; below that the band simply continues
    if (run >= minGap) { blank += run; if (band) widths.push(band); band = 0; }
    band++;
    run = 0;
  }
  if (band) widths.push(band);
  if (run >= minGap) blank += run;
  widths.sort((a, b) => a - b);
  return { blank: blank / profile.length, bands: widths.length, band: widths[widths.length >> 1] || 0 };
}

// The ink projected onto one axis, at whichever small angle gives the sharpest
// bands: a page a couple of degrees off straight has its lines smeared across
// several buckets otherwise. Squared totals are the measure of sharpness, since
// the same ink piled into fewer buckets counts for more.
function sharpestProfile(along, cross, size, reach) {
  const pad = Math.ceil(reach * SKEW);
  let best = null, most = -1;
  for (let step = -SKEW_STEPS; step <= SKEW_STEPS; step++) {
    const shear = (step / SKEW_STEPS) * SKEW;
    const profile = new Uint32Array(size + 2 * pad);
    for (let i = 0; i < along.length; i++) {
      profile[Math.round(along[i] - cross[i] * shear) + pad]++;
    }
    let score = 0;
    for (const v of profile) score += v * v;
    if (score > most) { most = score; best = profile; }
  }
  return best;
}

// the ink map of a page -> { vertical, confidence 0..1 }
export function directionOf(ink, w, h) {
  const xs = [], ys = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (ink[y * w + x]) { xs.push(x); ys.push(y); }
  }
  if (xs.length < 50) return { vertical: false, confidence: 0 };
  // ys projected down the page: horizontal writing cuts this one into lines
  const down = trim(sharpestProfile(ys, xs, h, w));
  // xs projected across it: vertical writing cuts this one into columns
  const across = trim(sharpestProfile(xs, ys, w, h));
  if (down.length < 8 || across.length < 8) return { vertical: false, confidence: 0 };

  const minGap = Math.max(2, Math.round(Math.max(w, h) * MIN_GAP));
  const byRow = shapeOf(down, minGap);
  const byCol = shapeOf(across, minGap);

  // Ink a single character thick is one line of writing, running along its long
  // side; there is no second line, so the white between its characters would
  // otherwise be read as the gap between lines.
  const thin = (span, other) => other.bands >= 2 && span <= other.band * THIN;
  const aspect = Math.max(across.length, down.length) / Math.min(across.length, down.length);
  if (thin(down.length, byCol)) return { vertical: false, confidence: Math.min(1, aspect / 4) };
  if (thin(across.length, byRow)) return { vertical: true, confidence: Math.min(1, aspect / 4) };

  // Otherwise the writing stacks along the axis carrying the white: the space
  // between two lines is wider, and cleaner, than anything within a line.
  const diff = byRow.blank - byCol.blank;
  return { vertical: diff < 0, confidence: Math.min(1, Math.abs(diff) * 5) };
}

// the margins are white whichever way the page is written, so measure inside
// the writing only
function trim(profile) {
  let a = 0, b = profile.length - 1;
  while (a < b && !profile[a]) a++;
  while (b > a && !profile[b]) b--;
  return profile.subarray(a, b + 1);
}

// --- the page as pixels -----------------------------------------------------

export const sizeOf = (source) => ({
  w: source.width || source.naturalWidth || 0,
  h: source.height || source.naturalHeight || 0,
});

// a small copy of the page, as an ink map
function sample(source, longest) {
  const { w: w0, h: h0 } = sizeOf(source);
  if (!w0 || !h0) return null;
  const scale = Math.min(1, longest / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  return { ink: stripRules(inkOf(ctx.getImageData(0, 0, w, h).data, w, h), w, h), w, h, scale };
}

// a canvas / image / bitmap -> { vertical, confidence }, or null if there are
// no pixels to look at
export function directionOfImage(source, longest = SAMPLE) {
  const page = sample(source, longest);
  return page && directionOf(page.ink, page.w, page.h);
}

// The squarest patch of the page carrying the most writing, at full size.
// A trial reading needs text to read, and the middle of a page is as likely to
// be the blank half of an exercise as it is to be a paragraph.
export function densestCrop(source, side) {
  const { w: w0, h: h0 } = sizeOf(source);
  const page = sample(source, SAMPLE);
  const canvas = document.createElement('canvas');
  const cut = Math.min(side, w0, h0);
  canvas.width = cut; canvas.height = cut;
  const ctx = canvas.getContext('2d');
  let at = [(w0 - cut) / 2, (h0 - cut) / 2];
  if (page) {
    // summed-area table, so every window costs four lookups whatever its size
    const { ink, w, h } = page;
    const sum = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        sum[(y + 1) * (w + 1) + x + 1] =
          ink[y * w + x] + sum[y * (w + 1) + x + 1] + sum[(y + 1) * (w + 1) + x] - sum[y * (w + 1) + x];
      }
    }
    const box = Math.max(4, Math.round(cut * page.scale));
    const step = Math.max(1, Math.round(box / 8));
    let most = -1;
    for (let y = 0; y + box <= h; y += step) {
      for (let x = 0; x + box <= w; x += step) {
        const ink1 = sum[(y + box) * (w + 1) + x + box] - sum[y * (w + 1) + x + box]
          - sum[(y + box) * (w + 1) + x] + sum[y * (w + 1) + x];
        if (ink1 > most) { most = ink1; at = [x / page.scale, y / page.scale]; }
      }
    }
  }
  ctx.drawImage(source, Math.min(at[0], w0 - cut), Math.min(at[1], h0 - cut), cut, cut, 0, 0, cut, cut);
  return canvas;
}

// the page turned a quarter, a half or three quarters of the way round
export function turned(source, degrees) {
  const { w, h } = sizeOf(source);
  if (degrees % 360 === 0) return source;
  const swap = degrees % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(degrees * Math.PI / 180);
  ctx.drawImage(source, -w / 2, -h / 2);
  return canvas;
}
