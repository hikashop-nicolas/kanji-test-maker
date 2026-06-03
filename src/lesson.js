// Lesson builder: pick a grade, then pick this week's kanji from a table sorted
// by stroke count then radical (the order Japanese teachers scan fastest).
// The selected kanji set drives sentence search (Phase B) and is exposed to the
// rest of the app. Loads assets/data/kanji.json (built by tools/build-data.mjs).

import { t } from './i18n.js?v=2';

let KANJI = null;          // literal -> { g, s, rad, on, kun, mean }
let selected = [];          // chosen kanji for the current lesson (typed order)
let listeners = [];
let EL = null;             // elements, captured by initLessonBuilder

const KANJI_RE = /\p{Script=Han}/gu;  // includes supplementary-plane kanji (e.g. 𠮟)

export function onLessonChange(fn) { listeners.push(fn); }
function emit() { const k = selectedKanji(); listeners.forEach(fn => fn(k)); }

export function selectedKanji() { return selected.slice(); }
export function kanjiData() { return KANJI; }
// grade of a kanji (number) or null if not jouyou / unknown.
export function gradeOf(ch) { return KANJI && KANJI[ch] ? KANJI[ch].g : null; }

async function loadKanji() {
  if (KANJI) return KANJI;
  const res = await fetch('assets/data/kanji.json');
  KANJI = await res.json();
  return KANJI;
}

// Kangxi radical glyph for a radical number (U+2F00 block), for grouping hints.
function radChar(n) { return n ? String.fromCodePoint(0x2EFF + n) : ''; }

// All kanji of a grade, sorted by stroke count, then radical, then codepoint.
function gradeKanji(grade) {
  const g = grade === 'secondary' ? 8 : parseInt(grade, 10);
  const list = Object.keys(KANJI).filter(ch => KANJI[ch].g === g);
  list.sort((a, b) => {
    const A = KANJI[a], B = KANJI[b];
    return A.s - B.s || A.rad - B.rad || a.codePointAt(0) - b.codePointAt(0);
  });
  return list;
}

// el: { grade:<select>, grid:<div>, field:<input>, count:<span>, clear:<button> }
export function initLessonBuilder(el) {
  EL = el;
  el.grade.addEventListener('change', async () => {
    await loadKanji();
    renderGrid(el, el.grade.value);
  });
  // direct editing / pasting in the field is the source of truth when typed
  el.field.addEventListener('input', () => {
    selected = uniq((el.field.value.match(KANJI_RE) || []));
    syncGrid(el); updateCount(el); emit();
  });
  if (el.clear) el.clear.addEventListener('click', () => {
    selected = []; el.field.value = '';
    syncGrid(el); updateCount(el); emit();
  });
  updateCount(el);
}

function uniq(arr) { return [...new Set(arr)]; }

// Restore a saved selection: render the grade's grid, set the chosen kanji,
// and sync highlights. Used on page load (persistence lives in app.js).
export async function setSelection(gradeValue, kanjiStr) {
  if (!EL) return;
  if (gradeValue) { EL.grade.value = gradeValue; await loadKanji(); renderGrid(EL, gradeValue); }
  selected = uniq((kanjiStr || '').match(KANJI_RE) || []);
  EL.field.value = selected.join(' ');
  syncGrid(EL); updateCount(EL); emit();
}

export function currentGrade() { return EL ? EL.grade.value : ''; }

function toggle(ch) {
  const i = selected.indexOf(ch);
  if (i >= 0) selected.splice(i, 1); else selected.push(ch);
}

// reflect the current selection onto the field text and grid cell highlights
function syncField(el) { el.field.value = selected.join(' '); }
function syncGrid(el) {
  el.grid.querySelectorAll('.kcell').forEach(c =>
    c.classList.toggle('sel', selected.includes(c.textContent)));
}
function updateCount(el) { if (el.count) el.count.textContent = selected.length ? t('count', { n: selected.length }) : ''; }

// re-apply dynamic labels after a language change (count + the grid's stroke labels)
export function refreshLabels() {
  if (!EL) return;
  updateCount(EL);
  if (KANJI && EL.grade.value) renderGrid(EL, EL.grade.value);
}

function renderGrid(el, grade) {
  const list = gradeKanji(grade);
  el.grid.innerHTML = '';
  let curStroke = -1;
  for (const ch of list) {
    const d = KANJI[ch];
    if (d.s !== curStroke) {
      curStroke = d.s;
      const lab = document.createElement('div');
      lab.className = 'stroke-label';
      lab.textContent = t('strokes', { n: d.s });
      el.grid.appendChild(lab);
    }
    const cell = document.createElement('button');
    cell.className = 'kcell' + (selected.includes(ch) ? ' sel' : '');
    cell.textContent = ch;
    cell.title = `${radChar(d.rad)}  ${t('strokes', { n: d.s })}\n${(d.on || []).join('・')}\n${(d.kun || []).join('・')}\n${(d.mean || []).join(', ')}`;
    cell.onclick = () => {
      toggle(ch);
      cell.classList.toggle('sel');
      syncField(el); updateCount(el); emit();
    };
    el.grid.appendChild(cell);
  }
}
