// Browser app: paste -> kuromoji -> editable table -> DOCX / PDF.
import { normalizeTokens, buildLayout } from './model.js?v=2';
import { buildHtml } from './htmlExport.js?v=2';
import { buildDocx } from './docxExport.js?v=2';
import { addFontEmbedFlag } from './docxEmbed.js?v=2';
import { initLessonBuilder, onLessonChange, selectedKanji, gradeOf, jlptOf, setSelection, currentGrade, refreshLabels, loadKanji } from './lesson.js?v=2';
import { buildCandidates } from './sentences.js?v=2';
import { t, initLang, applyI18n, getLang, setLang } from './i18n.js?v=2';
import { readingIndex, readingHints } from './readingHints.js?v=2';
import { pageLines } from './pdfText.js?v=2';
import { decodeText, docxLines, odtLines } from './fileText.js?v=2';
import { docText } from './msDoc.js?v=2';
import { directionOfImage, densestCrop, turned } from './orientation.js?v=2';

// fonts we ship a TTF for and can embed in the .docx (all OFL-licensed)
const FONT_TTF = {
  'Klee One': 'assets/fonts/KleeOne-Regular.ttf',
  'LINE Seed JP': 'assets/fonts/LineSeedJP-Regular.ttf',
  'Zen Kaku Gothic New': 'assets/fonts/ZenKakuGothicNew-Regular.ttf',
  'Zen Maru Gothic': 'assets/fonts/ZenMaruGothic-Regular.ttf',
  'Kaisei Tokumin': 'assets/fonts/KaiseiTokumin-Regular.ttf',
  'Yuji Syuku': 'assets/fonts/YujiSyuku-Regular.ttf',
};

// per-word states and how a click cycles them (kanji words get all four)
const CYCLE_KANJI = ['plain', 'test', 'furigana', 'kana'];
const CYCLE_PLAIN = ['plain', 'test'];
function nextState(cur, hasKanji) {
  const cyc = hasKanji ? CYCLE_KANJI : CYCLE_PLAIN;
  return cyc[(cyc.indexOf(cur) + 1) % cyc.length];
}

const $ = (id) => document.getElementById(id);
const state = { sentences: [] };
let tokenizer = null;
let customFontFamily = null; // set when a font file is uploaded
let customFontBytes = null;  // uploaded font bytes, for docx embedding

// ---- persist settings ----------------------------------------------------
const SETTING_IDS = ['h_class','h_title','h_lesson','h_name','o_perpage','o_rows','o_font','o_fontsize','o_boxsize','o_blankpos'];
function saveSettings() {
  const o = {};
  SETTING_IDS.forEach(id => { if ($(id)) o[id] = $(id).value; });
  try { localStorage.setItem('ktm_settings', JSON.stringify(o)); } catch (e) {}
}
function loadSettings() {
  let o; try { o = JSON.parse(localStorage.getItem('ktm_settings') || '{}'); } catch (e) { o = {}; }
  SETTING_IDS.forEach(id => { if (o[id] !== undefined && $(id)) $(id).value = o[id]; });
}
loadSettings();

// ---- i18n (interface language: ja / en / fr) -----------------------------
initLang();
$('lang_select').value = getLang();
applyI18n();
$('status').textContent = t('status_loading');
$('lang_select').addEventListener('change', () => {
  setLang($('lang_select').value);
  applyI18n();
  $('status').textContent = tokenizer ? '' : t('status_loading');
  if (state.sentences.length) renderTable();
  refreshLabels();
  if ($('pickerPanel').style.display !== 'none') runPicker();
});

// ---- input source tabs (corpus / paste / ocr) ----------------------------
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab_' + name));
  try { localStorage.setItem('ktm_tab', name); } catch (e) {}
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
(function restoreTab() {
  let n; try { n = localStorage.getItem('ktm_tab'); } catch (e) {}
  if (n && $('tab_' + n)) showTab(n);
})();

// ---- lesson builder (grade -> kanji table) -------------------------------
initLessonBuilder({
  grade: $('lesson_grade'),
  grid: $('kanji_grid'),
  field: $('lesson_field'),
  count: $('lesson_count'),
  clear: $('lesson_clear'),
});

// persist + restore the lesson selection (grade + chosen kanji)
function saveLesson() {
  try { localStorage.setItem('ktm_lesson', JSON.stringify({ grade: currentGrade(), kanji: $('lesson_field').value })); } catch (e) {}
}
onLessonChange((kanji) => { $('lesson_find').disabled = kanji.length === 0; saveLesson(); });
$('lesson_grade').addEventListener('change', saveLesson);
(function restoreLesson() {
  let o; try { o = JSON.parse(localStorage.getItem('ktm_lesson') || '{}'); } catch (e) { o = {}; }
  if (o.grade || o.kanji) setSelection(o.grade || '', o.kanji || '');
})();

// Baseline level for scoring: from the chosen dropdown value (a school grade or
// a JLPT level), else the hardest selected kanji. Returns the level G, the
// matching levelOf (school grade, or JLPT difficulty where N5 is easiest), and a
// display label.
function baselineLevel() {
  const v = $('lesson_grade').value;
  if (v && v[0] === 'N') {
    const n = parseInt(v.slice(1), 10);
    const levelOf = ch => { const j = jlptOf(ch); return j == null ? null : 6 - j; };
    return { G: 6 - n, levelOf, label: 'N' + n };
  }
  if (v === 'secondary') return { G: 8, levelOf: gradeOf, label: t('grade_secondary_short') };
  if (v) { const g = parseInt(v, 10); return { G: g, levelOf: gradeOf, label: t('grade_short', { n: g }) }; }
  const gs = selectedKanji().map(gradeOf).filter(g => g != null);
  const g = gs.length ? Math.max(...gs) : 6;
  return { G: g, levelOf: gradeOf, label: t('grade_short', { n: g }) };
}

async function runPicker() {
  const kanji = selectedKanji();
  if (!kanji.length) return;
  const { G, levelOf, label } = baselineLevel();
  $('lesson_find').disabled = true;
  $('lesson_find').textContent = t('btn_finding');
  const groups = await buildCandidates(kanji, G, { hideAboveLevel: $('pick_easyonly').checked, perKanji: 20, levelOf });
  renderPicker(groups, G, levelOf, label);
  $('pickerPanel').style.display = '';
  $('lesson_find').disabled = false;
  $('lesson_find').textContent = t('btn_find');
}
$('lesson_find').addEventListener('click', runPicker);
$('pick_easyonly').addEventListener('change', () => { if ($('pickerPanel').style.display !== 'none') runPicker(); });
$('pick_add').addEventListener('click', addPickedSentences);

// render a sentence with each kanji coloured by its role for the current lesson
function sentenceNodes(text, lessonSet, G, target, levelOf) {
  const frag = document.createDocumentFragment();
  for (const ch of text) {
    if (/\p{Script=Han}/u.test(ch)) {
      const s = document.createElement('span');
      s.textContent = ch;
      const g = levelOf(ch);
      if (ch === target) s.className = 'k-target';
      else if (lessonSet.has(ch)) s.className = 'k-lesson';
      else if (g == null || g > G) s.className = 'k-future';
      frag.appendChild(s);
    } else {
      frag.appendChild(document.createTextNode(ch));
    }
  }
  return frag;
}

const PICK_VISIBLE = 6; // sentences shown per kanji before the "more" link

function sentRow(s, grp, lessonSet, G, levelOf) {
  const row = document.createElement('div');
  row.className = 'sent-row';
  const id = `pk_${Math.abs(hashStr(grp.kanji + s.t))}`;
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.id = id; cb.dataset.text = s.t;
  const lab = document.createElement('label');
  lab.htmlFor = id;
  lab.title = `スコア ${s.score.toFixed(1)}`; // ranking score, on hover
  lab.appendChild(sentenceNodes(s.t, lessonSet, G, grp.kanji, levelOf));
  row.appendChild(cb); row.appendChild(lab);
  return row;
}

function renderPicker(groups, G, levelOf, label) {
  const lessonSet = new Set(selectedKanji());
  const root = $('picker');
  root.innerHTML = '';
  let totalShown = 0;
  for (const grp of groups) {
    const block = document.createElement('div');
    block.className = 'pick-block';
    const h = document.createElement('h4');
    h.textContent = `「${grp.kanji}」`;
    block.appendChild(h);
    if (!grp.sentences.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = grp.note === 'jouyou外' ? t('empty_not_jouyou') : t('empty_none');
      block.appendChild(e);
    }
    // first PICK_VISIBLE rows show; the rest go in a hidden list revealed by a
    // "more" toggle (kept in the DOM so checked-then-hidden rows still add).
    const head = document.createElement('div');
    head.className = 'sent-list';
    const rest = document.createElement('div');
    rest.className = 'sent-list more';
    grp.sentences.forEach((s, i) => {
      totalShown++;
      (i < PICK_VISIBLE ? head : rest).appendChild(sentRow(s, grp, lessonSet, G, levelOf));
    });
    block.appendChild(head);
    if (grp.sentences.length > PICK_VISIBLE) {
      block.appendChild(rest);
      const extra = grp.sentences.length - PICK_VISIBLE;
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'pick-more secondary';
      more.textContent = t('pick_more', { n: extra });
      more.onclick = () => {
        const open = rest.classList.toggle('open');
        more.textContent = open ? t('pick_less') : t('pick_more', { n: extra });
      };
      block.appendChild(more);
    }
    root.appendChild(block);
  }
  $('pick_summary').textContent = t('pick_summary', { kanji: groups.length, sent: totalShown, grade: label });
}

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

// add the checked sentences into the editable table, marking only lesson kanji
function addPickedSentences() {
  if (!tokenizer) return;
  const lessonSet = new Set(selectedKanji());
  const { G, levelOf } = baselineLevel();
  const existing = new Set(state.sentences.map(s => s.tokens.map(t => t.surface).join('')));
  const picked = [...new Set([...document.querySelectorAll('#picker input[type=checkbox]:checked')].map(cb => cb.dataset.text))];
  let added = 0;
  for (const text of picked) {
    if (existing.has(text)) continue;
    const tokens = tokenizeSentence(text);
    // auto-state: test the lesson kanji; render above-grade words as kana
    // (red); everything else plain. Furigana (orange) is left for manual use.
    tokens.forEach(t => {
      const kanji = [...t.surface].filter(c => /\p{Script=Han}/u.test(c));
      if (kanji.some(c => lessonSet.has(c))) t.state = 'test';
      else if (kanji.some(c => { const g = levelOf(c); return g == null || g > G; })) t.state = 'kana';
      else t.state = 'plain';
    });
    state.sentences.push({ tokens, mode: 'kaki' });
    existing.add(text); added++;
  }
  if (added) {
    renderTable();
    $('tablePanel').style.display = '';
    refreshPreview();
    $('tablePanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ---- init kuromoji -------------------------------------------------------
window.kuromoji.builder({ dicPath: 'assets/dict' }).build((err, tok) => {
  if (err) { $('status').textContent = t('status_failed'); console.error(err); return; }
  tokenizer = tok;
  $('status').textContent = ''; // clear the loading message once ready
  $('process').disabled = false;
});

// ---- header / options ----------------------------------------------------
function header() {
  return {
    show: $('h_show').checked,
    classCode: $('h_class').value, title: $('h_title').value,
    lessonNo: $('h_lesson').value, nameLabel: $('h_name').value,
  };
}
function options() {
  return {
    perPage: parseInt($('o_perpage').value, 10) || 10,
    autoPerPage: $('o_perpage_auto').checked,
    rows: parseInt($('o_rows').value, 10) || 1,
    font: customFontFamily || $('o_font').value,
    fontSize: parseFloat($('o_fontsize').value) || 18,
    boxSize: parseFloat($('o_boxsize').value) || 10,
    blankPos: $('o_blankpos').value,
    extras: $('o_extras').checked,
    image: customImageDataUrl,
    imageDims: customImageDims,
  };
}

// ---- points/signature boxes + bottom-left image (persisted) --------------
let customImageDataUrl = null;
let customImageDims = null; // { w, h }, for sizing the .docx image
function loadImageDims(url) {
  const im = new Image();
  im.onload = () => { customImageDims = { w: im.naturalWidth, h: im.naturalHeight }; };
  im.src = url;
}
// Downscale an uploaded image to just the resolution the bottom-left slot needs
// (~42x28mm at 300 DPI), so the stored data URL stays small. Never upscales.
const IMG_MAX_W = 500, IMG_MAX_H = 340; // px
function fitImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const scale = Math.min(IMG_MAX_W / im.naturalWidth, IMG_MAX_H / im.naturalHeight, 1);
      const w = Math.max(1, Math.round(im.naturalWidth * scale));
      const h = Math.max(1, Math.round(im.naturalHeight * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(im, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ url: c.toDataURL('image/png'), w, h });
    };
    im.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    im.src = url;
  });
}
try { customImageDataUrl = localStorage.getItem('ktm_image') || null; } catch (e) {}
if (customImageDataUrl) loadImageDims(customImageDataUrl);
// auto page filling: the sentence count is derived, so grey the field out
try { $('o_perpage_auto').checked = localStorage.getItem('ktm_autoperpage') !== '0'; } catch (e) {}
function syncAutoPerPage() {
  $('o_perpage').disabled = $('o_perpage_auto').checked;
}
$('o_perpage_auto').addEventListener('change', () => {
  try { localStorage.setItem('ktm_autoperpage', $('o_perpage_auto').checked ? '1' : '0'); } catch (e) {}
  syncAutoPerPage();
  refreshPreview();
});
syncAutoPerPage();
// A sheet a student makes to practise on needs no class, title or name line,
// so the heading comes off and its space goes back to the sentences.
function syncHeaderFields() {
  $('headerFields').classList.toggle('off', !$('h_show').checked);
  for (const id of ['h_class', 'h_title', 'h_lesson', 'h_name']) $(id).disabled = !$('h_show').checked;
}
try { $('h_show').checked = localStorage.getItem('ktm_header') !== '0'; } catch (e) {}
syncHeaderFields();
$('h_show').addEventListener('change', () => {
  try { localStorage.setItem('ktm_header', $('h_show').checked ? '1' : '0'); } catch (e) {}
  syncHeaderFields();
  refreshPreview();
});
try { $('o_extras').checked = localStorage.getItem('ktm_extras') === '1'; } catch (e) {}
$('o_extras').addEventListener('change', () => {
  try { localStorage.setItem('ktm_extras', $('o_extras').checked ? '1' : '0'); } catch (e) {}
  refreshPreview();
});
$('o_image').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const fit = await fitImageToDataUrl(f);
    customImageDataUrl = fit.url;
    customImageDims = { w: fit.w, h: fit.h };
    try { localStorage.setItem('ktm_image', customImageDataUrl); } catch (err) { alert(t('alert_image_too_big')); }
  } catch (err) { console.warn('image load failed', err); }
  refreshPreview();
});
$('o_image_clear').addEventListener('click', () => {
  customImageDataUrl = null; customImageDims = null; $('o_image').value = '';
  try { localStorage.removeItem('ktm_image'); } catch (e) {}
  refreshPreview();
});

// ---- processing ----------------------------------------------------------
// kanji by reading, for the second opinion on a reading. Built once, from the
// same KANJIDIC data the lesson picker uses.
let hintIndex = null;
loadKanji().then(data => { hintIndex = readingIndex(data); }).catch(() => {});

function tokenizeSentence(text) {
  const raw = tokenizer.tokenize(text);
  const tokens = normalizeTokens(raw);
  if (hintIndex) {
    const hints = readingHints(s => tokenizer.tokenize(s), hintIndex, text, raw);
    tokens.forEach((token, i) => { if (hints[i] && hints[i].length) token.hints = hints[i]; });
  }
  return tokens;
}

// Tokenize one-sentence-per-line text into the editor. replace=true wipes the
// current set (paste), replace=false appends (OCR). Returns how many were added.
function addLinesAsSentences(text, replace) {
  if (!tokenizer) return 0;
  const made = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    .map(line => ({ tokens: tokenizeSentence(line), mode: 'kaki' }));
  if (replace) state.sentences = made; else state.sentences.push(...made);
  renderTable();
  $('tablePanel').style.display = state.sentences.length ? '' : 'none';
  refreshPreview();
  return made.length;
}
$('process').addEventListener('click', () => addLinesAsSentences($('input').value, true));

// ---- sentences out of a file --------------------------------------------
// Documents give their text up directly; a photo, and a PDF page that turns out
// to be a scan, have to be recognized. Both engines are big and most sessions
// never open this tab, so each is fetched the first time a file needs it.
let ocrScript = null; // promise: tesseract.min.js injected once, on first use
function loadTesseract() {
  if (ocrScript) return ocrScript;
  ocrScript = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/tesseract/tesseract.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return ocrScript;
}
let pdfModule = null; // promise: pdf.min.mjs imported once, on first PDF
function loadPdfjs() {
  if (pdfModule) return pdfModule;
  pdfModule = import('../vendor/pdfjs/pdf.min.mjs').then(m => {
    m.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs';
    return m;
  });
  return pdfModule;
}
// split recognized text into candidate sentences: break on JP enders + newlines,
// clean up the marks a scan leaves behind, keep only lines carrying kanji.
// CJK space/punctuation, kana, kanji, fullwidth forms (Japanese has no word spaces)
const JP_RUN = /([　-ヿ㐀-鿿＀-￯]) +([　-ヿ㐀-鿿＀-￯])/g;
// ruled lines and creases come back as these ascii symbols, never as real text
const STRAY = /[<>|｜_^~`\\]/g;
// worksheet question numbers land in front of the sentence as one or two latin
// characters; longer runs may be real text (TCLカード) so keep those.
const LEAD_ASCII = /^[!-~｜]{1,2}\s+(?=[぀-ヿ㐀-鿿])/;
// nothing in Japanese opens on a small kana, a長音符 or a stray quote/mark
const LEAD_KANA = /^[ぁぃぅぇぉっゃゅょァィゥェォッャュョーヽヾ゛゜]+/;
// a worksheet numbers its questions, ours included, before the sentence starts
const LEAD_PUNCT = /^[\s"“”‘’*+,.:;・、。!?！？=-]+|^[\u2460-\u24ff]+\s*/;
const HAS_KANJI = /[㐀-鿿]/;
// below this a tesseract line is a table rule or a speck, not text; real
// sentences on a home scan score 50-90. A PDF text layer has no confidence,
// and undefined fails the test, which is what we want.
const MIN_LINE_CONF = 30;
function cleanTextLine(s) {
  // tesseract inserts a space between every CJK glyph; drop spaces that sit
  // between two Japanese characters/punctuation, keeping spaces inside latin
  // text. Looped (no lookbehind) so it works on older engines too.
  let p;
  do { p = s; s = s.replace(JP_RUN, '$1$2'); } while (s !== p);
  return s.replace(LEAD_ASCII, '').replace(LEAD_KANA, '').replace(LEAD_PUNCT, '').trim();
}
// rows: {text, confidence} from tesseract, or {text} per line of a PDF
function splitTextLines(rows) {
  return rows
    .filter(r => !(r.confidence < MIN_LINE_CONF))
    .flatMap(r => r.text.replace(STRAY, '').replace(/([。！？])/g, '$1\n').split(/\r?\n/))
    .map(cleanTextLine)
    // a line with no kanji is the answer column or a caption: nothing to quiz on
    .filter(s => HAS_KANJI.test(s));
}

// A recognizer kept alive for the whole run. Building one costs several
// seconds of loading the engine and its Japanese model, and a run needs both
// models when it has to work out which way a page reads, so they are made once
// and kept until the run is over.
function makeReader() {
  const workers = new Map();
  let report = () => {};
  const get = (lang) => {
    if (!workers.has(lang)) {
      workers.set(lang, loadTesseract().then(() => window.Tesseract.createWorker(lang, 1, {
        workerPath: 'vendor/tesseract/worker.min.js',
        corePath: 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
        langPath: 'assets/tessdata',
        logger: m => { if (m.status === 'recognizing text') report(Math.round(m.progress * 100)); },
      })).then(async (worker) => {
        // the vertical model only makes sense with page layout analysis; the
        // default "one horizontal block" mode reads the columns crosswise
        if (lang === 'jpn_vert') await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.AUTO });
        return worker;
      }));
    }
    return workers.get(lang);
  };
  return {
    async read(image, vertical, onPercent = () => {}, want = { text: true, blocks: true }) {
      const worker = await get(vertical ? 'jpn_vert' : 'jpn');
      report = onPercent;
      try {
        return (await worker.recognize(image, {}, want)).data;
      } finally {
        report = () => {};
      }
    },
    async close() {
      for (const pending of workers.values()) await (await pending).terminate();
      workers.clear();
    },
  };
}

// what tesseract gives back for one page, as the lines we work in
function rowsOf(data) {
  const rows = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) rows.push(...(p.lines || []));
  if (!rows.length && data.text) rows.push({ text: data.text });
  return rows;
}

// ---- which way up the page is --------------------------------------------
// The geometry of a page says which way its lines run, but not which way its
// characters face: a 縦書き sheet fed sideways is, line for line, an ordinary
// horizontal page. So the geometry only puts the likeliest reading first, and
// the recognizer settles it, on a patch of the page rather than all of it.
// What marks the right answer is not how sure tesseract says it is (it is
// about as sure of nonsense) but whether what comes out is made of words.

const TRIAL_PX = 900; // side of the trial patch, in the scan's own pixels
const TRIAL_GOOD = 0.22; // a reading this word-like is the answer; stop trying
const TRIAL_ASK = 0.1; // nothing above this: the page is for the teacher to call
const TRIAL_CHARS = 12; // under this, no way up read as text: nothing to ask about

function readsAsWords(text) {
  const body = text.replace(/\s+/g, '');
  if (body.length < TRIAL_CHARS) return 0;
  if (!tokenizer) return (body.match(/[぀-ヿ㐀-鿿]/g) || []).length / body.length;
  let known = 0;
  for (const token of tokenizer.tokenize(body)) {
    if (token.word_type === 'KNOWN' && token.surface_form.length > 1) known += token.surface_form.length;
  }
  return known / body.length;
}

// the four ways a page can sit on the glass, likeliest first
function turnsFor(vertical, hint) {
  const all = [
    { turn: 0, vertical },
    { turn: 90, vertical: !vertical },
    { turn: 270, vertical: !vertical },
    { turn: 180, vertical },
  ];
  // a stack of scans comes off the same machine the same way up, so whatever
  // the last page turned out to be is the first thing to try on this one
  const same = (a, b) => b && a.turn === b.turn && a.vertical === b.vertical;
  return hint ? [...all.filter(t => same(t, hint)), ...all.filter(t => !same(t, hint))] : all;
}

async function findOrientation(source, reader, say, hint) {
  const geometry = directionOfImage(source) || { vertical: false };
  const crop = densestCrop(source, TRIAL_PX);
  let best = null;
  let most = 0; // the most text any way up produced
  const tries = turnsFor(geometry.vertical, hint);
  for (const [n, candidate] of tries.entries()) {
    say(t('src_checking', { n: n + 1, total: tries.length }));
    const data = await reader.read(turned(crop, candidate.turn), candidate.vertical, () => {}, { text: true });
    const score = readsAsWords(data.text);
    most = Math.max(most, data.text.replace(/\s+/g, '').length);
    if (!best || score > best.score) best = { ...candidate, score };
    if (score >= TRIAL_GOOD) break;
  }
  // A page that gave up almost no characters any way up is blank, or is a
  // photograph of something that is not writing. Its score means nothing, so
  // it is marked rather than judged: worth a look, not worth a question.
  return { ...best, sparse: most < TRIAL_CHARS };
}

// The chooser, for when the page will not say which way it reads: the four
// turns as pictures, since a teacher settles this at a glance.
function askOrientation(crop, name) {
  const panel = $('src_ask'), list = $('src_turns');
  list.textContent = '';
  $('src_ask_for').textContent = name || '';
  return new Promise((resolve) => {
    for (const turn of [0, 90, 180, 270]) {
      const view = turned(crop, turn);
      const shot = document.createElement('canvas');
      const side = 150;
      shot.width = side; shot.height = side;
      shot.getContext('2d').drawImage(view, 0, 0, side, side);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'turn';
      button.appendChild(shot);
      const label = document.createElement('span');
      // turning the page a quarter turn turns its writing the other way too
      const vertical = (directionOfImage(view) || {}).vertical || false;
      label.textContent = t(vertical ? 'src_tate' : 'src_yoko');
      button.appendChild(label);
      button.onclick = () => { panel.style.display = 'none'; resolve({ turn, vertical }); };
      list.appendChild(button);
    }
    $('src_status').textContent = '';
    panel.style.display = '';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

// a scanned page -> the same page the right way up, and how to read it
async function uprightPage(source, reader, say, state, name) {
  const forced = $('src_dir').value;
  if (forced !== 'auto') return { image: source, vertical: forced === 'v' };
  const best = await findOrientation(source, reader, say, state.hint);
  const choice = best.sparse || best.score > TRIAL_ASK
    ? best
    : await askOrientation(densestCrop(source, TRIAL_PX), name);
  state.hint = { turn: choice.turn, vertical: choice.vertical };
  return { image: turned(source, choice.turn), vertical: choice.vertical };
}

// 200 dpi is what tesseract's Japanese models were trained around; above it the
// recognition does not improve and a multi-page file gets slow.
async function renderPage(page, dpi = 200) {
  const viewport = page.getViewport({ scale: dpi / 72 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  // print intent, because the display path drives itself off requestAnimationFrame
  // and would stall for as long as the teacher looks at another tab. It also
  // leaves out the on-screen annotation layer, which is not part of the scan.
  await page.render({ canvas, viewport, intent: 'print' }).promise;
  return canvas;
}

// A PDF written by a word processor carries its text, which beats recognizing a
// picture of it. A scan carries none, so those pages are rendered and read the
// same way an image is.
async function linesFromPdf(buf, run, say, name) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    cMapUrl: 'vendor/pdfjs/cmaps/',
    cMapPacked: true,
    wasmUrl: 'vendor/pdfjs/wasm/',
  });
  const doc = await task.promise;
  const lines = [];
  const scans = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      say(t('src_pdf_page', { n, total: doc.numPages }));
      const page = await doc.getPage(n);
      const found = pageLines((await page.getTextContent()).items, page.getViewport({ scale: 1 }).transform);
      if (found.length) lines.push(...found.map(text => ({ text })));
      else scans.push(await renderPage(page));
    }
    for (const [n, scan] of scans.entries()) {
      const upright = await uprightPage(scan, run.reader, say, run, t('src_pdf_page', { n: n + 1, total: scans.length }));
      const data = await run.reader.read(upright.image, upright.vertical,
        (p) => say(t('src_ocr_page', { n: n + 1, total: scans.length, p })));
      lines.push(...rowsOf(data));
    }
  } finally {
    await task.destroy();
  }
  return lines;
}

// A zipped office document: .docx and .odt differ only in which part holds the
// body and how it marks a paragraph.
async function linesFromZip(buf) {
  const zip = await window.JSZip.loadAsync(buf);
  const docx = zip.file('word/document.xml');
  if (docx) return docxLines(await docx.async('string'));
  const odt = zip.file('content.xml');
  if (odt) return odtLines(await odt.async('string'));
  return [];
}

// What a file is, by its first bytes rather than its name: a .doc that is
// really a .docx, or a .txt saved as .doc, is common enough to be worth
// getting right, and an extension is only ever a claim.
function sniff(buf, file) {
  const b = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
  const starts = (...bytes) => bytes.every((v, i) => b[i] === v);
  if (starts(0x25, 0x50, 0x44, 0x46)) return 'pdf';                              // %PDF
  if (starts(0x50, 0x4b, 0x03, 0x04)) return 'zip';                              // PK..
  if (starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return 'doc';      // compound file
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(file.name) ? 'image' : 'text';
}

// Long enough that no worksheet reaches it, short enough that a book does not
// hand kuromoji more sentences than a browser can tokenize in one go.
const MAX_LINES = 300;

// one file, already sniffed -> its rows
async function readFile(kind, buf, run, say, name) {
  switch (kind) {
    case 'pdf': return linesFromPdf(buf, run, say, name);
    case 'zip': return (await linesFromZip(buf)).map(text => ({ text }));
    case 'doc': return (docText(buf) || '').split('\n').map(text => ({ text }));
    default: return decodeText(buf).split(/\r?\n/).map(text => ({ text }));
  }
}

// an image file -> the bitmap the recognizer will be given
async function bitmapOf(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

// Every queued file, in the order they were queued. The recognizer is shared
// across all of them, so a stack of scans loads its models once. A file that
// cannot be read is counted and stepped over: the rest is still worth having.
async function readAll(files, say) {
  const parts = files.map(() => []);
  const run = { reader: makeReader(), hint: null };
  let failed = 0;
  try {
    for (const [i, file] of files.entries()) {
      say(i, t('src_reading'));
      try {
        const buf = await file.arrayBuffer();
        const kind = sniff(buf, file);
        if (kind !== 'image') {
          parts[i] = await readFile(kind, buf, run, msg => say(i, msg), file.name);
          continue;
        }
        const page = await bitmapOf(file);
        const upright = await uprightPage(page, run.reader, msg => say(i, msg), run, file.name);
        const data = await run.reader.read(upright.image, upright.vertical,
          (p) => say(i, t('src_running', { p })));
        parts[i] = rowsOf(data);
      } catch (e) {
        console.error('reading the file failed', file.name, e);
        failed++;
      }
    }
  } finally {
    await run.reader.close();
  }
  return { rows: parts.flat(), failed };
}

// The queue itself. A teacher scanning a workbook ends up with one file per
// page, so the picker takes several and a drop adds to what is already there
// instead of replacing it.
const picked = [];
const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified}`;

function renderFiles() {
  const list = $('src_files');
  list.textContent = '';
  picked.forEach((file, i) => {
    const li = document.createElement('li');
    li.append(file.name);
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.title = t('src_remove');
    x.dataset.i18nTitle = 'src_remove'; // so it follows a language change
    x.onclick = () => { picked.splice(i, 1); renderFiles(); };
    li.appendChild(x);
    list.appendChild(li);
  });
  $('src_run').disabled = !picked.length;
}

function addFiles(files) {
  for (const f of files || []) if (!picked.some(p => fileKey(p) === fileKey(f))) picked.push(f);
  renderFiles();
}

{
  const zone = $('src_drop');
  // the button is inside the zone, so its click reaches this handler too
  zone.addEventListener('click', () => $('src_file').click());
  $('src_file').addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = ''; // so picking the same file again still fires a change
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('over'); // children count as leaving
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    addFiles(e.dataTransfer.files);
  });
  // a file dropped anywhere else would otherwise be navigated to, taking the
  // worksheet being built with it. Dragged text is left alone: dropping a
  // selection into one of the textareas is worth keeping.
  const isFileDrag = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  for (const ev of ['dragover', 'drop']) {
    document.addEventListener(ev, (e) => { if (isFileDrag(e)) e.preventDefault(); });
  }
}

$('src_run').addEventListener('click', async () => {
  if (!picked.length) return;
  const btn = $('src_run'), st = $('src_status');
  const files = picked.slice();
  btn.disabled = true;
  const say = (i, msg) => {
    st.textContent = files.length > 1
      ? `${t('src_of_file', { name: files[i].name, n: i + 1, total: files.length })} ${msg}`
      : msg;
  };
  try {
    const { rows, failed } = await readAll(files, say);
    const lines = splitTextLines(rows);
    $('src_text').value = lines.slice(0, MAX_LINES).join('\n');
    st.textContent = !lines.length ? t('src_no_text')
      : lines.length > MAX_LINES ? t('src_truncated', { n: MAX_LINES, total: lines.length })
      : failed ? t('src_failed', { n: failed })
      : '';
  } finally {
    btn.disabled = false;
  }
});
$('src_add').addEventListener('click', () => {
  if (addLinesAsSentences($('src_text').value, false)) $('tablePanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---- table ---------------------------------------------------------------
// switch every sentence at once, so one set gives a 書き sheet and a 読み sheet
function setAllModes(mode) {
  if (!state.sentences.length) return;
  state.sentences.forEach(s => { s.mode = mode; });
  renderTable();
  refreshPreview();
}
$('btnAllKaki').addEventListener('click', () => setAllModes('kaki'));
$('btnAllYomi').addEventListener('click', () => setAllModes('yomi'));

// Shuffle, for a second sheet on the same words: the sentences are numbered
// by their place in the list, so reordering renumbers them.
$('btnShuffle').addEventListener('click', () => {
  const list = state.sentences;
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  renderTable();
  refreshPreview();
});

function renderTable() {
  const tbody = $('rows');
  tbody.innerHTML = '';
  state.sentences.forEach((sent, si) => {
    const tr = document.createElement('tr');

    // mode switch
    const tdMode = document.createElement('td');
    tdMode.className = 'modebtns';
    for (const m of ['kaki', 'yomi']) {
      const b = document.createElement('button');
      b.textContent = m === 'kaki' ? t('mode_kaki') : t('mode_yomi');
      b.className = sent.mode === m ? 'on' : '';
      b.onclick = () => {
        sent.mode = m; // keep the current selection when switching modes
        renderTable(); refreshPreview();
      };
      tdMode.appendChild(b);
    }
    tr.appendChild(tdMode);

    // sentence chips
    const tdS = document.createElement('td');
    const chips = document.createElement('div');
    chips.className = 'chips';
    sent.tokens.forEach((tok) => {
      if (!tok.state) tok.state = tok.selected ? 'test' : 'plain'; // migrate older data
      const chip = document.createElement('span');
      const st = tok.state;
      chip.className = 'chip' + (tok.hasKanji ? ' kanji' : '') + (st !== 'plain' ? ' st-' + st : '');
      chip.title = t('st_' + st);
      const surf = document.createElement('span');
      surf.textContent = tok.surface;
      chip.appendChild(surf);
      if (st !== 'plain') {
        const rd = document.createElement('span');
        rd.className = 'rd';
        const inp = document.createElement('input');
        inp.value = tok.reading;
        inp.title = t('lbl_reading');
        inp.onclick = (e) => e.stopPropagation();
        inp.oninput = () => { tok.reading = inp.value; };
        inp.onchange = refreshPreview;
        rd.appendChild(inp);
        // what the dictionary says this kanji reads in the word it belongs to,
        // for the half-in-kana spellings kuromoji has to guess at
        for (const hint of tok.hints || []) {
          if (hint.reading === tok.reading) continue;
          const b = document.createElement('button');
          b.className = 'hint';
          b.textContent = hint.reading;
          b.title = t('hint_from', { word: hint.via });
          b.onclick = (e) => {
            e.stopPropagation();
            tok.reading = hint.reading;
            renderTable(); refreshPreview();
          };
          rd.appendChild(b);
        }
        chip.appendChild(rd);
      }
      chip.onclick = () => { tok.state = nextState(tok.state, tok.hasKanji); renderTable(); refreshPreview(); };
      chips.appendChild(chip);
    });
    tdS.appendChild(chips);
    tr.appendChild(tdS);

    // remove
    const tdX = document.createElement('td');
    const x = document.createElement('button');
    x.className = 'secondary'; x.textContent = '×';
    x.onclick = () => { state.sentences.splice(si, 1); renderTable(); refreshPreview(); if (!state.sentences.length) $('tablePanel').style.display = 'none'; };
    tdX.appendChild(x);
    tr.appendChild(tdX);

    tbody.appendChild(tr);
  });
}

// ---- worksheet / layout --------------------------------------------------
function worksheet() {
  return { header: header(), options: options(), sentences: state.sentences };
}

// ---- preview -------------------------------------------------------------
function refreshPreview() {
  if (!state.sentences.length) return;
  const html = buildHtml(buildLayout(worksheet()), { font: options().font, fontFace: customFontCss() });
  const pp = $('previewPanel');
  pp.style.display = '';   // un-hide
  pp.open = true;          // expand so the iframe has a measurable width for fitPreview
  $('preview').srcdoc = html;
}
$('btnPreview').addEventListener('click', refreshPreview);
// re-fit when the preview section is reopened (a collapsed <details> has 0 width)
$('previewPanel').addEventListener('toggle', () => { if ($('previewPanel').open) fitPreview(); });

// scale the worksheet to fit the panel width and size the iframe to the scaled
// content, so the preview shows whole pages with no scrollbars.
function fitPreview() {
  const ifr = $('preview');
  const doc = ifr.contentDocument;
  if (!doc || !doc.body) return;
  const pages = doc.querySelectorAll('.page');
  if (!pages.length) return;
  doc.body.style.zoom = '1';                       // measure unscaled, from the page boxes (overflow-proof)
  const first = pages[0].getBoundingClientRect();
  const last = pages[pages.length - 1].getBoundingClientRect();
  const PAD = 10;                                  // body padding (px), see htmlExport @media screen
  const naturalW = first.width + 2 * PAD;
  const naturalH = last.bottom + PAD;              // rects start at body padding-top
  const scale = Math.max(0.1, ifr.clientWidth / naturalW);
  doc.body.style.zoom = String(scale);
  ifr.style.height = (Math.ceil(naturalH * scale) + 4) + 'px'; // small buffer so nothing clips
  warnOverflow(doc);
}

// A band only holds so many columns; past that they run off the left edge and
// the sentences are silently lost. Count them and say so.
function warnOverflow(doc) {
  let lost = 0;
  doc.querySelectorAll('.page').forEach(page => {
    const left = page.getBoundingClientRect().left;
    page.querySelectorAll('.sentence').forEach(s => {
      if (s.getBoundingClientRect().left < left - 1) lost++;
    });
  });
  const w = $('fitWarn');
  w.textContent = lost ? t('warn_overflow', { n: lost }) : '';
  w.style.display = lost ? '' : 'none';
}
$('preview').addEventListener('load', fitPreview);
window.addEventListener('resize', fitPreview);
// live-refresh + persist when settings or header fields change
SETTING_IDS.forEach(id => $(id).addEventListener('input', () => { saveSettings(); refreshPreview(); }));

// ---- font file (preview/PDF only) ----------------------------------------
let customFontDataUrl = null;
$('o_fontfile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) { customFontFamily = null; customFontDataUrl = null; customFontBytes = null; refreshPreview(); return; }
  const buf = await file.arrayBuffer();
  customFontFamily = 'UserFont';
  customFontBytes = new Uint8Array(buf.slice(0)); // keep for docx embedding
  try {
    const ff = new FontFace('UserFont', buf);
    await ff.load();
    document.fonts.add(ff);
  } catch (err) { console.warn('font load', err); }
  // also keep a data URL so the print/preview iframe can @font-face it
  customFontDataUrl = await blobToDataUrl(file);
  refreshPreview();
});
function customFontCss() {
  if (!customFontDataUrl) return '';
  return `@font-face{font-family:'UserFont';src:url(${customFontDataUrl});}`;
}
function blobToDataUrl(b) { return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); }

// ---- PDF (browser print) -------------------------------------------------
function exportPdf(answers) {
  const html = buildHtml(buildLayout(worksheet()), { font: options().font, fontFace: customFontCss(), answers });
  const w = window.open('', '_blank');
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}
$('btnPdf').addEventListener('click', () => exportPdf(false));
$('btnPdfAns').addEventListener('click', () => exportPdf(true));

// ---- DOCX ----------------------------------------------------------------
async function exportDocx(answers, filename) {
  const layout = buildLayout(worksheet());
  const fontName = $('o_font').value;
  let embed = [];
  if (customFontFamily && customFontBytes) {
    // embed the uploaded font; runs use that family name
    layout.font = 'UserFont';
    embed = [{ name: 'UserFont', data: customFontBytes }];
  } else {
    layout.font = fontName;
    if (FONT_TTF[fontName]) {
      try {
        const data = new Uint8Array(await (await fetch(FONT_TTF[fontName])).arrayBuffer());
        embed = [{ name: fontName, data }];
      } catch (e) { console.warn('font fetch failed; .docx will reference the font by name', e); }
    }
  }
  const doc = buildDocx(layout, window.docx, embed, { answers });
  let bytes = new Uint8Array(await (await window.docx.Packer.toBlob(doc)).arrayBuffer());
  if (embed.length) bytes = await addFontEmbedFlag(bytes, window.JSZip);
  downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), filename);
}
$('btnDocx').addEventListener('click', () => exportDocx(false, 'kanji-test.docx'));
$('btnDocxAns').addEventListener('click', () => exportDocx(true, 'kanji-test-answers.docx'));

// answer-sheet checkbox reveals its export buttons
$('ans_enable').addEventListener('change', () => {
  $('ans_buttons').style.display = $('ans_enable').checked ? '' : 'none';
});

// ---- save / load a worksheet set (JSON) ----------------------------------
function saveSet() {
  const data = {
    version: 1,
    header: header(),
    options: { perPage: $('o_perpage').value, autoPerPage: $('o_perpage_auto').checked, rows: $('o_rows').value, font: $('o_font').value, fontSize: $('o_fontsize').value, boxSize: $('o_boxsize').value, blankPos: $('o_blankpos').value },
    sentences: state.sentences.map(s => ({
      mode: s.mode,
      tokens: s.tokens.map(t => ({ surface: t.surface, reading: t.reading, hasKanji: t.hasKanji, state: t.state || (t.selected ? 'test' : 'plain') })),
    })),
  };
  const stamp = ($('h_class').value || 'kanji') + '-' + ($('h_lesson').value || '');
  downloadBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `${stamp}.ktm.json`.replace(/\s+/g, ''));
}
function loadSet(file) {
  const fr = new FileReader();
  fr.onload = () => {
    let d; try { d = JSON.parse(fr.result); } catch (e) { alert(t('alert_load_failed')); return; }
    const h = d.header || {}, o = d.options || {};
    if (h.classCode != null) $('h_class').value = h.classCode;
    if (h.title != null) $('h_title').value = h.title;
    if (h.lessonNo != null) $('h_lesson').value = h.lessonNo;
    if (h.nameLabel != null) $('h_name').value = h.nameLabel;
    if (h.show != null) { $('h_show').checked = !!h.show; syncHeaderFields(); }
    if (o.perPage != null) $('o_perpage').value = o.perPage;
    if (o.rows != null) $('o_rows').value = o.rows;
    if (o.autoPerPage != null) { $('o_perpage_auto').checked = !!o.autoPerPage; syncAutoPerPage(); }
    if (o.font != null) $('o_font').value = o.font;
    if (o.fontSize != null) $('o_fontsize').value = o.fontSize;
    if (o.boxSize != null) $('o_boxsize').value = o.boxSize;
    if (o.blankPos != null) $('o_blankpos').value = o.blankPos;
    state.sentences = (d.sentences || []).map(s => ({ mode: s.mode || 'kaki', tokens: s.tokens || [] }));
    saveSettings();
    renderTable();
    $('tablePanel').style.display = state.sentences.length ? '' : 'none';
    refreshPreview();
  };
  fr.readAsText(file);
}
$('btnSave').addEventListener('click', saveSet);
$('btnSave2').addEventListener('click', saveSet);
$('btnLoad').addEventListener('click', () => $('loadFile').click());
$('loadFile').addEventListener('change', (e) => { if (e.target.files[0]) loadSet(e.target.files[0]); e.target.value = ''; });

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ---- service worker (installable app, works offline) ---------------------
// A never-quit installed window would otherwise keep serving the cached build
// for good, so a waiting worker is surfaced rather than applied silently: the
// teacher decides when to reload, mid-worksheet is a bad moment.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      const offer = (worker) => {
        if (!worker) return;
        const show = () => {
          if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
          $('swUpdate').style.display = 'flex';
          $('swUpdateBtn').onclick = () => { worker.postMessage('ktm-skip-waiting'); };
        };
        show();
        worker.addEventListener('statechange', show);
      };
      offer(reg.waiting);
      reg.addEventListener('updatefound', () => offer(reg.installing));
    }).catch(e => console.warn('service worker not registered', e));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  });
}
