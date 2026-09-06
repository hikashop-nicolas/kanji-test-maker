// Wrong-but-plausible spellings of a word, for the multiple-choice sheets.
// Pure: no DOM, no tokenizer, no fetching. Feed it the kanji index, the
// component index, and a way to ask whether a string is a real word.
//
// A choice is a list of cells, one per character. A cell is either a real
// character ({ ch }) or one that does not exist, described as an operation on
// real ones ({ op, base, part, ... }) for src/glyph.js to draw. See
// docs/CHOICE_PLAN.md.

const HAN = /\p{Script=Han}/u;
const hira2kata = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));

let K = null;                  // literal -> { g, s, rad, on, kun, mean, j }
let PARTS = null;              // literal -> [[element, position], ...]
const ON = new Map(), KUN = new Map();   // reading -> [kanji]
const SLOT = new Map();        // signature with one part blanked -> [kanji]
const BY_SIG = new Map();      // full signature -> kanji
const DONOR = new Map();       // "element|position" -> [kanji using it there]
const USUAL = new Map();       // element -> the position it usually takes

// Characters that neither sound nor shape can pair up, because they are single
// shapes with no components and no useful homophones. These are the confusions
// school tests actually use, and they are the whole of grade 1 and 2.
const LOOKALIKE = [
  '大太犬天丈夫矢', '土士王玉主', '千干午牛生', '木本末未札', '日白目田由甲申',
  '石右左有布', '人入八九', '川州三山出', '力刀万方九', '己已巳巴',
  '貝見具目自', '車東束事車', '名各多夕外', '中申由甲串', '早草卓単',
  '休体休仕作', '心必忘志', '雨両雪雲', '手毛年午', '文父交丈',
  '子孑了予', '田町男思', '口回四回目', '上下止正', '小少水氷',
  '見貝買具真', '今令冷合会', '半羊平年', '売読続買', '角魚色包',
  '母毎海梅', '西酉酒要', '長辰農展', '兄足元先', '休体本休',
  '青情晴清', '間開聞問門', '実宝案安', '知和私科', '数教散救',
];
const LOOK = new Map();
for (const group of LOOKALIKE) {
  for (const ch of group) {
    if (!LOOK.has(ch)) LOOK.set(ch, new Set());
    for (const other of group) if (other !== ch) LOOK.get(ch).add(other);
  }
}

const sig = (ps) => ps.map(p => p[0]).join('+');

export function init(kanjiData, partsData) {
  K = kanjiData; PARTS = partsData || {};
  ON.clear(); KUN.clear(); SLOT.clear(); BY_SIG.clear(); DONOR.clear(); USUAL.clear();
  const add = (map, key, ch) => { if (!key) return; if (!map.has(key)) map.set(key, []); map.get(key).push(ch); };
  for (const [ch, d] of Object.entries(K)) {
    for (const r of d.on || []) add(ON, r.replace(/[-.]/g, ''), ch);
    for (const r of d.kun || []) {
      if (r.startsWith('-')) continue;
      add(KUN, hira2kata(r.split('.')[0].replace(/-/g, '')), ch);
    }
  }
  const posCount = new Map();
  for (const [ch, ps] of Object.entries(PARTS)) {
    BY_SIG.set(sig(ps), ch);
    ps.forEach(([el, pos], i) => {
      add(SLOT, ps.map((p, j) => (j === i ? '*' : p[0])).join('+'), ch);
      add(DONOR, `${el}|${pos}`, ch);
      if (!posCount.has(el)) posCount.set(el, new Map());
      const t = posCount.get(el);
      t.set(pos, (t.get(pos) || 0) + 1);
    });
  }
  for (const [el, t] of posCount) {
    let best = '', n = -1;
    for (const [pos, c] of t) if (c > n) { best = pos; n = c; }
    USUAL.set(el, best);
  }
}

// ---- splitting a word's reading over its characters ----------------------
// 漢字 = カン + ジ, so 漢 can become any kanji read カン. Inside a compound a
// reading changes shape, and the three ways it does are rules, not exceptions.
const VOICED = { カ:'ガ', キ:'ギ', ク:'グ', ケ:'ゲ', コ:'ゴ', サ:'ザ', シ:'ジ', ス:'ズ', セ:'ゼ', ソ:'ゾ',
  タ:'ダ', チ:'ヂ', ツ:'ヅ', テ:'デ', ト:'ド', ハ:'バ', ヒ:'ビ', フ:'ブ', ヘ:'ベ', ホ:'ボ' };
const HALF = { ハ:'パ', ヒ:'ピ', フ:'プ', ヘ:'ペ', ホ:'ポ' };

function variants(part, first, last) {
  const out = [part];
  if (!first) {                                  // 連濁: 物語 = モノ + ガタリ
    if (VOICED[part[0]]) out.push(VOICED[part[0]] + part.slice(1));
    if (HALF[part[0]]) out.push(HALF[part[0]] + part.slice(1));
  }
  if (!last && /[クキチツ]$/.test(part)) out.push(part.slice(0, -1) + 'ッ');  // 促音便: 学校
  return out;
}

// [{ ch, part, kind }] per character, or null when the reading is not built
// from the characters at all (熟字訓: 昨日 きのう, 大人 おとな).
export function splitReading(word, reading) {
  const chars = [...word], kata = hira2kata(reading || ''), out = [];
  const go = (i, pos) => {
    if (i === chars.length) return pos === kata.length;
    const ch = chars[i];
    if (!HAN.test(ch)) {
      const k = hira2kata(ch);
      if (!kata.startsWith(k, pos)) return false;
      out.push({ ch, part: k, kind: 'kana' });
      if (go(i + 1, pos + k.length)) return true;
      out.pop();
      return false;
    }
    const d = K[ch];
    if (!d) return false;
    const cands = [];
    for (const r of d.on || []) cands.push([r.replace(/[-.]/g, ''), 'on']);
    for (const r of d.kun || []) {
      if (r.startsWith('-')) continue;
      cands.push([hira2kata(r.split('.')[0].replace(/-/g, '')), 'kun']);
    }
    cands.sort((a, b) => b[0].length - a[0].length);      // longest reading first
    for (const [base, kind] of cands) {
      if (!base) continue;
      for (const v of variants(base, i === 0, i === chars.length - 1)) {
        if (!kata.startsWith(v, pos)) continue;
        out.push({ ch, part: base, kind });
        if (go(i + 1, pos + v.length)) return true;
        out.pop();
      }
    }
    return false;
  };
  return go(0, 0) ? out.slice() : null;
}

// ---- how good a wrong character is --------------------------------------
// A distractor built from a kanji the pupil cannot read is not a distractor:
// the answer is then the only line they can read at all.
function known(ch, maxGrade) {
  const d = K[ch];
  if (!d || !d.g) return 0;
  return d.g <= maxGrade ? 12 : d.g <= 6 ? 5 : 1;
}
const strokesOf = ch => (K[ch] ? K[ch].s : 12);
const shares = (a, b) => {
  const A = PARTS[a], B = PARTS[b];
  if (A && B) { const s = new Set(B.map(p => p[0])); if (A.some(p => s.has(p[0]))) return true; }
  return !!(LOOK.get(a) && LOOK.get(a).has(b));
};

// every kanji that is this one but for a single component, plus the hand table
function shapeAlts(ch) {
  const out = new Set(LOOK.get(ch) || []);
  const ps = PARTS[ch];
  if (ps) {
    ps.forEach((_, i) => {
      const key = ps.map((p, j) => (j === i ? '*' : p[0])).join('+');
      for (const other of SLOT.get(key) || []) if (other !== ch) out.add(other);
    });
  }
  return out;
}

// ---- fabricated characters ----------------------------------------------
// The operation has to match how crowded the character already is: there is
// nothing to take out of 川, and nothing to add to 曜.
const LEFT_RADICALS = ['氵', '亻', '彳', '扌', '忄', '木', '言', '糸', '土', '禾', '金', '日', '目', '石', '女'];

const MADE_PER_CHAR = 3;   // enough to fill a sheet, few enough not to flood it

function madeCells(ch, maxGrade) {
  const out = [];
  const ps = PARTS[ch] || [];
  const n = strokesOf(ch);
  const isTop = (el) => USUAL.get(el) === 'top';
  // a crowded character has something to lose, a sparse one has room to gain
  const w = { take: n >= 12 ? 3 : 1, swap: 2, put: n <= 6 ? 3 : 1 };

  // Take a component away: what is left is rewritten at full size. Only the
  // radical goes, never the body: dropping 𦰩 from 漢 leaves a lone 氵 blown up
  // to fill the square, which is not a character anyone would hesitate over.
  if (ps.length === 2 && n >= 8) {
    for (let i = 0; i < ps.length; i++) {
      if (ps[i][1] !== 'left' && ps[i][1] !== 'top') continue;
      const rest = ps.filter((_, j) => j !== i);
      const real = BY_SIG.get(sig(rest)) || (K[rest[0][0]] ? rest[0][0] : null);
      // when what is left is itself a character, it is one: no need to draw it
      if (real && real !== ch) out.push({ cell: { ch: real }, kind: 'take', real: true, w: w.take });
      else out.push({ cell: { op: 'take', base: ch, at: i }, kind: 'take', w: w.take });
    }
  }
  // swap a component for one that lives in the same place
  for (let i = 0; i < ps.length; i++) {
    const [el, pos] = ps[i];
    // without a position there is no telling what belongs in the slot, and the
    // swap comes out as a component dropped somewhere arbitrary (昼)
    if (!pos) continue;
    let taken = 0;
    for (const [ael, list] of sameSlot(el, pos)) {
      const donor = list.find(d => d !== ch && known(d, maxGrade) >= 5);
      if (!donor) continue;
      const next = ps.map((p, j) => (j === i ? [ael, pos] : p));
      const real = BY_SIG.get(sig(next));
      if (real && real !== ch) out.push({ cell: { ch: real }, kind: 'swap', real: true, w: w.swap });
      else out.push({ cell: { op: 'swap', base: ch, at: i, donor, part: ael }, kind: 'swap', w: w.swap });
      if (++taken >= 2) break;
    }
  }
  // put one in: only where there is room, and never under a wide top radical
  if (n <= 9 && !ps.some(p => isTop(p[0]))) {
    let taken = 0;
    for (const el of LEFT_RADICALS) {
      if (ps.some(p => p[0] === el)) continue;
      const donor = (DONOR.get(`${el}|left`) || []).find(d => d !== ch && known(d, maxGrade) >= 5);
      if (!donor) continue;
      out.push({ cell: { op: 'put', base: ch, donor, part: el }, kind: 'put', w: w.put });
      if (++taken >= 2) break;
    }
  }
  const real = out.filter(m => m.real);
  const drawn = out.filter(m => !m.real).sort((a, b) => b.w - a.w).slice(0, MADE_PER_CHAR);
  return [...real, ...drawn];
}

// components that take the same position as `el`, commonest first, so a swap
// borrows something that belongs there
function sameSlot(el, pos) {
  const out = [];
  for (const [key, list] of DONOR) {
    const [ael, apos] = key.split('|');
    if (apos !== pos || ael === el || ael === '?') continue;
    out.push([ael, list]);
  }
  out.sort((a, b) => b[1].length - a[1].length);
  return out;
}

// ---- the generator -------------------------------------------------------
// word: the correct spelling. reading: its reading (hiragana or katakana).
// opts: { maxGrade, isWord, made (allow fabricated characters), limit }
// Returns { answer, wrong: [...] }, both as choices, wrong best first.
export function generate(word, reading, opts = {}) {
  const maxGrade = opts.maxGrade || 6;
  const isWord = opts.isWord || (() => false);
  const limit = opts.limit || 12;
  const chars = [...word];
  const answer = { cells: chars.map(ch => ({ ch })), text: word };
  if (!K) return { answer, wrong: [] };

  const split = splitReading(word, reading);
  const cands = new Map();                       // key -> candidate
  const put = (i, cell, score, tags) => {
    const cells = chars.map((c, j) => (j === i ? cell : { ch: c }));
    const key = cells.map(c => (c.ch ? c.ch : `${c.op}:${c.base}:${c.at ?? ''}:${c.part || ''}`)).join('');
    if (key === word) return;
    const prev = cands.get(key);
    if (prev && prev.score >= score) return;
    cands.set(key, { cells, score, text: cells.every(c => c.ch) ? cells.map(c => c.ch).join('') : null, ...tags });
  };

  chars.forEach((ch, i) => {
    if (!HAN.test(ch)) return;
    const base = strokesOf(ch);
    // same sound: the reading gives nothing away
    if (split) {
      const p = split[i];
      if (p && p.kind !== 'kana') {
        for (const alt of (p.kind === 'on' ? ON : KUN).get(p.part) || []) {
          if (alt === ch) continue;
          const s = 10 + (shares(ch, alt) ? 8 : 0) + known(alt, maxGrade) - Math.abs(strokesOf(alt) - base) * 0.3;
          put(i, { ch: alt }, s, { sound: true, shape: shares(ch, alt) });
        }
      }
    }
    // same shape: the confusion a pupil actually makes
    for (const alt of shapeAlts(ch)) {
      const s = 8 + known(alt, maxGrade) - Math.abs(strokesOf(alt) - base) * 0.3;
      put(i, { ch: alt }, s, { shape: true });
    }
    // a character that does not exist, when the sheet allows one
    if (opts.made) {
      for (const m of madeCells(ch, maxGrade)) {
        // a drawn character sits with the shape-based ones: real spellings
        // come first, and these fill the gap where there are none
        const s = m.real
          ? 8 + known(m.cell.ch, maxGrade) - Math.abs(strokesOf(m.cell.ch) - base) * 0.3
          : 8 + 9 + (m.w || 1);
        put(i, m.cell, s, m.real ? { shape: true } : { made: true });
      }
    }
  });

  const wrong = [...cands.values()].sort((a, b) => b.score - a.score);
  const out = [];
  for (const c of wrong) {
    // a wrong spelling that is itself a word is a second defensible answer
    if (c.text && isWord(c.text)) continue;
    out.push(c);
    if (out.length >= limit) break;
  }
  return { answer, wrong: out };
}

// Plain text of a choice, for the editor and the answer key. A fabricated
// character has no text, so it stands in as ？.
export function choiceText(choice) {
  return (choice.cells || []).map(c => (c.ch ? c.ch : '？')).join('');
}
export function hasMade(choice) {
  return (choice.cells || []).some(c => !c.ch);
}
