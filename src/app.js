// Browser app: paste -> kuromoji -> editable table -> DOCX / PDF.
import { normalizeTokens, joinInflections, buildLayout, circledExtended } from './model.js?v=2';
import { buildHtml } from './htmlExport.js?v=2';
import { buildDocx } from './docxExport.js?v=2';
import { addFontEmbedFlag } from './docxEmbed.js?v=2';
import { initLessonBuilder, onLessonChange, selectedKanji, gradeOf, jlptOf, setSelection, currentGrade, refreshLabels, loadKanji, kanjiData } from './lesson.js?v=2';
import { init as initDistractors, generate as generateChoices, generateReadings } from './distractors.js?v=2';
import { setStrokes, cellSvg } from './glyph.js?v=2';
import { buildCandidates } from './sentences.js?v=2';
import { t, initLang, applyI18n, getLang, setLang } from './i18n.js?v=2';
import { readingIndex, readingHints } from './readingHints.js?v=2';
import { pageLines } from './pdfText.js?v=2';
import { decodeText, docxLines, odtLines } from './fileText.js?v=2';
import { docText } from './msDoc.js?v=2';
import { directionOfImage, densestCrop, turned } from './orientation.js?v=2';
import { textLines, looksSplit } from './textLines.js?v=2';
import { readLines } from './ppocr.js?v=2';

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
const state = { sentences: [], words: [], questions: [] };
let tokenizer = null;
let customFontFamily = null; // set when a font file is uploaded
let customFontBytes = null;  // uploaded font bytes, for docx embedding

// ---- persist settings ----------------------------------------------------
const SETTING_IDS = ['h_class','h_title','h_lesson','h_name','o_perpage','o_rows','o_font','o_fontsize','o_boxsize','o_blankpos','q_count','q_style','q_dir'];
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

// A box that grows with what is in it: a stack of scans puts twenty sentences
// in one, and scrolling a textarea to look them over is no way to work. It
// stops at most of the window, past which scrolling is the lesser evil.
const BOX_MAX = 0.7; // of the window height
function fitBox(box) {
  box.style.height = 'auto';
  const border = box.offsetHeight - box.clientHeight; // the height is border-box
  box.style.height = `${Math.min(box.scrollHeight + border, window.innerHeight * BOX_MAX)}px`;
}
// a box in a hidden tab measures as empty, so only fit what is on show
function fitBoxes() {
  for (const box of ['input', 'src_text'].map($)) if (box.offsetParent) fitBox(box);
}
for (const id of ['input', 'src_text']) $(id).addEventListener('input', () => fitBox($(id)));
window.addEventListener('resize', fitBoxes);

// ---- input source tabs (corpus / paste / ocr) ----------------------------
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab_' + name));
  try { localStorage.setItem('ktm_tab', name); } catch (e) {}
  fitBoxes(); // the box that just came into view still has its old height
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
$('lesson_find').addEventListener('click', () => (isChoice() ? runWordPicker() : runPicker()));
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
  // joined first: the hints and the tokens have to agree on where a word ends
  const raw = joinInflections(tokenizer.tokenize(text));
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
$('process').addEventListener('click', () => (isChoice() ? addWordsFromText($('input').value) : addLinesAsSentences($('input').value, true)));

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
// A worksheet numbers its questions, ours included, before the sentence starts.
// The number comes back as a circled digit when it is read well and as some
// other ring or box when it is not, so the whole geometric block goes.
const LEAD_PUNCT = /^[\s"“”‘’*+,.:;・、。!?！？=-]+|^[\u2460-\u24ff\u25a0-\u25ff\u3007]+\s*/;
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

// ---- reading a page -------------------------------------------------------
// Two readers. The first cuts the page into its lines (textLines.js) and reads
// them one at a time with a recognizer trained on Japanese as it is set on a
// page, vertical writing included: quicker, and better on a worksheet. It is
// only ever as good as the cutting, though, so a page that will not come apart
// into lines, or that comes apart into nonsense, goes to tesseract, which
// brings its own page analysis.

const MODEL_OK = 0.25; // a page reading this word-like needs no second opinion

async function readWithModel(image, vertical, say) {
  const lines = textLines(image, vertical);
  if (!looksSplit(lines, image, vertical)) return null;
  const texts = await readLines(lines.flat(), p => say(t('src_running', { p })));
  // a line split by a wide gap comes back in pieces; they are still one line
  const rows = [];
  let at = 0;
  for (const line of lines) {
    rows.push({ text: line.map(() => texts[at++]).join(' ').trim() });
  }
  return rows;
}

// the better of the two readings, and only the second one when it is needed
async function readPage(image, vertical, reader, say) {
  let mine = null;
  try {
    mine = await readWithModel(image, vertical, say);
  } catch (e) {
    console.error('the line reader failed', e);
  }
  const scoreOf = (rows) => readsAsWords(rows.map(r => r.text).join(''));
  if (mine && scoreOf(mine) >= MODEL_OK) return mine;
  const theirs = rowsOf(await reader.read(image, vertical, p => say(t('src_running', { p }))));
  if (!mine) return theirs;
  return scoreOf(theirs) > scoreOf(mine) ? theirs : mine;
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
    const patch = turned(crop, candidate.turn);
    let text = '';
    const rows = await readWithModel(patch, candidate.vertical, () => {}).catch(() => null);
    if (rows) text = rows.map(r => r.text).join('');
    else text = (await reader.read(patch, candidate.vertical, () => {}, { text: true })).text;
    const score = readsAsWords(text);
    most = Math.max(most, text.replace(/\s+/g, '').length);
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
      const where = t('src_pdf_page', { n: n + 1, total: scans.length });
      lines.push(...await readPage(upright.image, upright.vertical, run.reader, msg => say(`${where} ${msg}`)));
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

// One file -> its rows. `run` carries the recognizer and the orientation hint,
// so a stack of scans loads the models once and each page starts from the way
// up the last one turned out to be.
async function readOneFile(file, run, say) {
  const buf = await file.arrayBuffer();
  const kind = sniff(buf, file);
  if (kind !== 'image') return readFile(kind, buf, run, say, file.name);
  const page = await bitmapOf(file);
  const upright = await uprightPage(page, run.reader, say, run, file.name);
  return readPage(upright.image, upright.vertical, run.reader, say);
}

// The queue. A teacher scanning a workbook ends up with one file per page, so
// the picker takes several and a drop adds to what is already there. Reading
// starts on its own: there is nothing to set first, and a file that has been
// handed over is a file the teacher wants read.
const picked = [];
const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified}`;
let reading = false;

function renderFiles() {
  const list = $('src_files');
  list.textContent = '';
  picked.forEach((file, i) => {
    const li = document.createElement('li');
    li.append(file.name);
    // the file at the head is the one being read, and cannot be taken back
    if (i || !reading) {
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '×';
      x.title = t('src_remove');
      x.dataset.i18nTitle = 'src_remove'; // so it follows a language change
      x.onclick = () => { picked.splice(i, 1); renderFiles(); };
      li.appendChild(x);
    }
    list.appendChild(li);
  });
}

// the sentences a file gave up, under whatever is already there. Returns how
// many did not fit: a whole book would hand kuromoji more than it can chew.
function appendLines(lines) {
  if (!lines.length) return 0;
  const box = $('src_text');
  const before = box.value.replace(/\s+$/, '');
  const all = (before ? before.split('\n') : []).concat(lines);
  box.value = all.slice(0, MAX_LINES).join('\n');
  $('src_out').style.display = '';
  fitBox(box); // shown first: a hidden box measures as empty
  return Math.max(0, all.length - MAX_LINES);
}

function addFiles(files) {
  for (const f of files || []) if (!picked.some(p => fileKey(p) === fileKey(f))) picked.push(f);
  renderFiles();
  readQueue().catch(e => console.error('the queue stopped', e));
}

// Read the queue to the end, one file at a time, and put each file's sentences
// up as it finishes. Anything dropped while this runs joins the same pass, so
// the recognizer is loaded once however the files arrive.
async function readQueue() {
  if (reading || !picked.length) return;
  reading = true;
  const status = $('src_status');
  const run = { reader: makeReader(), hint: null };
  let failed = 0, found = 0, over = 0, done = 0;
  try {
    while (picked.length) {
      const file = picked[0];
      const total = done + picked.length;
      renderFiles(); // the head loses its × while it is being read
      const say = (msg) => {
        status.textContent = total > 1
          ? `${t('src_of_file', { name: file.name, n: done + 1, total })} ${msg}`
          : msg;
      };
      say(t('src_reading'));
      try {
        const lines = splitTextLines(await readOneFile(file, run, say));
        found += lines.length;
        over += appendLines(lines);
      } catch (e) {
        console.error('reading the file failed', file.name, e);
        failed++;
      }
      picked.shift();
      done++;
      renderFiles();
    }
  } finally {
    await run.reader.close();
    reading = false;
  }
  status.textContent = over ? t('src_truncated', { n: MAX_LINES, total: MAX_LINES + over })
    : failed ? t('src_failed', { n: failed })
    : found ? '' : t('src_no_text');
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

$('src_add').addEventListener('click', () => {
  if (isChoice()) { addWordsFromText($('src_text').value); return; }
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
        // wide enough for what it holds: a five-kana reading in a four-kana box
        // reads as a wrong reading rather than a cropped one
        const fit = () => { inp.style.width = `${Math.max(3, inp.value.length + 0.7)}em`; };
        fit();
        inp.onclick = (e) => e.stopPropagation();
        inp.oninput = () => { tok.reading = inp.value; fit(); };
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

// ---- multiple-choice sheets ----------------------------------------------
// A word list where the pupil picks the correct spelling. The material is words
// rather than sentences, so the picker, the paste box and the file reader all
// offer words; every chosen word becomes one question. See docs/CHOICE_PLAN.md.

let sheetKind = 'sentences';                 // 'sentences' | 'choice'
let partsData = null;                        // component index, for shape swaps
let strokesData = null;                      // KanjiVG strokes, only for invented characters
let strokesPending = null;

const isChoice = () => sheetKind === 'choice';
const kata2hira = (s) => (s || '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

// a word the dictionary knows: a wrong spelling that is one would be a second
// defensible answer, and a word list gives no context to rule it out
function isRealWord(s) {
  if (!tokenizer) return false;
  const t = tokenizer.tokenize(s);
  return t.length === 1 && t[0].word_type === 'KNOWN' && t[0].surface_form === s;
}

async function ensureDistractors() {
  await loadKanji();
  if (!partsData) {
    try { partsData = await (await fetch('assets/data/kanji-parts.json')).json(); }
    catch (e) { console.warn('component index unavailable', e); partsData = {}; }
  }
  initDistractors(kanjiData(), partsData);
}

// the strokes are 2.3 MB, so they are only fetched when a sheet invents
// characters, and kept from then on
async function ensureStrokes() {
  if (strokesData) return true;
  if (!strokesPending) {
    strokesPending = fetch('assets/data/kanji-strokes.json')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  const data = await strokesPending;
  if (!data) { strokesPending = null; return false; }
  strokesData = data;
  setStrokes(data);
  return true;
}

const choiceCount = () => parseInt($('q_count').value, 10) || 4;
// the mirror sheet shows the kanji and asks for the reading; its choices are
// kana, so it needs no drawing and no stroke data
const askReading = () => $('q_dir').value === 'reading';
const allowMade = () => $('q_style').value === 'made' && !askReading();

// Build one question: the answer plus the best wrong spellings, more than the
// sheet needs so the teacher has something to swap in.
function makeQuestion(word, reading) {
  const { G } = baselineLevel();
  const { answer, wrong } = askReading()
    ? generateReadings(word, reading, { limit: 14 })
    : generateChoices(word, reading, { maxGrade: G, isWord: isRealWord, made: allowMade(), limit: 14 });
  const n = choiceCount();
  const used = wrong.slice(0, n - 1);
  const at = Math.floor(Math.random() * (used.length + 1));
  used.splice(at, 0, answer);
  return { word, reading, dir: askReading() ? 'reading' : 'kanji', used, offered: wrong.slice(n - 1), answerAt: at };
}

// keep a question per chosen word, leaving the ones already edited alone
function syncQuestions() {
  const have = new Map(state.questions.map(q => [q.word + '\t' + q.reading, q]));
  state.questions = state.words.map(w => have.get(w.word + '\t' + w.reading) || makeQuestion(w.word, w.reading));
}

function regenerate(qi) {
  const q = state.questions[qi];
  state.questions[qi] = makeQuestion(q.word, q.reading);
  renderQuestions(); refreshPreview();
}

// ---- drawing a choice in the editor --------------------------------------
function choiceNode(c, kind) {
  const el = document.createElement('span');
  el.className = 'qchip ' + kind + (c.made ? ' made' : '');
  if (kind !== 'alt') {
    const g = document.createElement('span');
    g.className = 'grip'; g.textContent = '⠿';
    el.appendChild(g);
  }
  if (kind === 'ans') {
    const tick = document.createElement('span');
    tick.className = 'tick'; tick.textContent = '✓';
    el.appendChild(tick);
  }
  for (const cell of c.cells) {
    if (cell.ch) { el.appendChild(document.createTextNode(cell.ch)); continue; }
    const svg = cellSvg(cell);
    if (svg) {
      const holder = document.createElement('span');
      holder.innerHTML = svg;
      el.appendChild(holder.firstChild);
    } else el.appendChild(document.createTextNode('〓'));
  }
  if (c.made) {
    const tag = document.createElement('span');
    tag.className = 'made-tag'; tag.textContent = t('made_tag');
    el.appendChild(tag);
  }
  return el;
}

// ---- the question table --------------------------------------------------
let dragFrom = null;   // { qi, zone, ci }

function renderQuestions() {
  const tbody = $('qrows');
  tbody.innerHTML = '';
  state.questions.forEach((q, qi) => {
    const tr = document.createElement('tr');

    const tdN = document.createElement('td');
    tdN.style.color = '#8a9099';
    tdN.textContent = circledExtended(qi + 1);
    tr.appendChild(tdN);

    // the reading is shown, not edited: it belongs to the word, and the word is
    // picked one step earlier
    const tdR = document.createElement('td');
    tdR.textContent = q.dir === 'reading' ? q.word : q.reading;
    tdR.style.whiteSpace = 'nowrap';
    tr.appendChild(tdR);

    const tdC = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'qrow-choices';
    const drop = (zone, ci) => (e) => {
      e.preventDefault();
      if (!dragFrom || dragFrom.qi !== qi) return;
      moveChoice(qi, dragFrom, { zone, ci });
      dragFrom = null;
      renderQuestions(); refreshPreview();
    };
    q.used.forEach((c, ci) => {
      const node = choiceNode(c, ci === q.answerAt ? 'ans' : 'use');
      node.draggable = true;
      node.ondragstart = () => { dragFrom = { qi, zone: 'used', ci }; };
      node.ondragover = (e) => e.preventDefault();
      node.ondrop = drop('used', ci);
      wrap.appendChild(node);
    });
    if (q.offered.length) {
      const sep = document.createElement('span');
      sep.className = 'qsep';
      wrap.appendChild(sep);
      const lab = document.createElement('span');
      lab.className = 'qalt-label';
      lab.textContent = t('lbl_other_ideas');
      wrap.appendChild(lab);
      q.offered.slice(0, 6).forEach((c, ci) => {
        const node = choiceNode(c, 'alt');
        node.draggable = true;
        node.ondragstart = () => { dragFrom = { qi, zone: 'offered', ci }; };
        node.ondragover = (e) => e.preventDefault();
        node.ondrop = drop('offered', ci);
        node.onclick = () => {                    // click also swaps it in
          const last = q.used.findIndex((_, i) => i !== q.answerAt);
          moveChoice(qi, { zone: 'offered', ci }, { zone: 'used', ci: last });
          renderQuestions(); refreshPreview();
        };
        wrap.appendChild(node);
      });
    }
    tdC.appendChild(wrap);
    tr.appendChild(tdC);

    const tdX = document.createElement('td');
    tdX.style.whiteSpace = 'nowrap';
    const again = document.createElement('button');
    again.className = 'secondary'; again.textContent = '↻';
    again.title = t('btn_regenerate');
    again.onclick = () => regenerate(qi);
    tdX.appendChild(again);
    const x = document.createElement('button');
    x.className = 'secondary'; x.textContent = '×';
    x.style.marginLeft = '.2rem';
    x.onclick = () => {
      const q0 = state.questions[qi];
      state.words = state.words.filter(w => !(w.word === q0.word && w.reading === q0.reading));
      state.questions.splice(qi, 1);
      renderQuestions(); renderWordPicker(); refreshPreview();
      if (!state.questions.length) $('choicePanel').style.display = 'none';
    };
    tdX.appendChild(x);
    tr.appendChild(tdX);

    tbody.appendChild(tr);
  });
}

// Reorder within the printed choices, or swap one for an offered one. The
// answer moves about like the rest but can never leave: the app knows which
// spelling is right, so it is not for the teacher to choose.
function moveChoice(qi, from, to) {
  const q = state.questions[qi];
  if (from.zone === 'used' && to.zone === 'used') {
    const [c] = q.used.splice(from.ci, 1);
    q.used.splice(to.ci, 0, c);
    // follow the answer through the move
    if (from.ci === q.answerAt) q.answerAt = to.ci;
    else if (from.ci < q.answerAt && to.ci >= q.answerAt) q.answerAt--;
    else if (from.ci > q.answerAt && to.ci <= q.answerAt) q.answerAt++;
    return;
  }
  if (from.zone === 'offered' && to.zone === 'used') {
    if (to.ci === q.answerAt) return;             // the answer stays
    const c = q.offered[from.ci];
    if (!c) return;
    q.offered.splice(from.ci, 1);
    q.offered.unshift(q.used[to.ci]);
    q.used[to.ci] = c;
    return;
  }
  if (from.zone === 'used' && to.zone === 'offered') {
    if (from.ci === q.answerAt) return;
    const c = q.offered[to.ci];
    if (!c) return;
    q.offered[to.ci] = q.used[from.ci];
    q.used[from.ci] = c;
  }
}

// ---- picking words -------------------------------------------------------
const wordCache = {};
async function loadWordFile(name) {
  if (wordCache[name]) return wordCache[name];
  try {
    const res = await fetch(`assets/data/lesson-words/grade-${name}.json`);
    if (res.ok) { wordCache[name] = await res.json(); return wordCache[name]; }
  } catch (e) { /* transient: do not cache a failure */ }
  return {};
}

const wordKey = (w) => w.word + '\t' + w.reading;
function hasWord(w) { return state.words.some(x => wordKey(x) === wordKey(w)); }

async function runWordPicker() {
  const kanji = selectedKanji();
  const { G, levelOf } = baselineLevel();
  const names = new Set();
  for (const ch of kanji) { const g = gradeOf(ch); if (g != null) names.add(g === 8 ? 'secondary' : String(g)); }
  const files = {};
  await Promise.all([...names].map(async n => { files[n] = await loadWordFile(n); }));
  const easy = $('wpick_easyonly').checked;
  const groups = kanji.map(ch => {
    const g = gradeOf(ch);
    const rows = (g == null ? [] : (files[g === 8 ? 'secondary' : String(g)] || {})[ch] || []);
    const words = rows
      .map(([word, reading]) => ({ word, reading: kata2hira(reading) }))
      .filter(w => !easy || [...w.word].every(c => !/\p{Script=Han}/u.test(c) || (levelOf(c) != null && levelOf(c) <= G)));
    return { kanji: ch, words };
  });
  renderWordPicker(groups);
}

let wordGroups = [];
function renderWordPicker(groups) {
  if (groups) wordGroups = groups;
  const host = $('wordPicker');
  host.innerHTML = '';
  for (const g of wordGroups) {
    const row = document.createElement('div');
    row.className = 'wgroup';
    const k = document.createElement('div');
    k.className = 'wk'; k.textContent = g.kanji;
    row.appendChild(k);
    const list = document.createElement('div');
    list.className = 'wlist';
    if (!g.words.length) {
      const none = document.createElement('span');
      none.className = 'muted'; none.style.fontSize = '.85rem';
      none.textContent = t('no_words');
      list.appendChild(none);
    }
    for (const w of g.words) {
      const chip = document.createElement('span');
      chip.className = 'wchip' + (hasWord(w) ? ' on' : '');
      chip.innerHTML = `<span class="wr"></span><span class="ww"></span>`;
      chip.firstChild.textContent = w.reading;
      chip.lastChild.textContent = w.word;
      chip.onclick = () => toggleWord(w);
      list.appendChild(chip);
    }
    row.appendChild(list);
    host.appendChild(row);
  }
  $('wpick_summary').textContent = state.words.length ? t('count_words', { n: state.words.length }) : '';
  $('wordPickerPanel').style.display = wordGroups.length ? '' : 'none';
}

function toggleWord(w) {
  if (hasWord(w)) state.words = state.words.filter(x => wordKey(x) !== wordKey(w));
  else state.words.push({ word: w.word, reading: w.reading });
  afterWordsChanged();
}

function afterWordsChanged() {
  syncQuestions();
  renderQuestions();
  renderWordPicker();
  $('choicePanel').style.display = state.questions.length ? '' : 'none';
  refreshPreview();
}

// Words out of pasted text or a file: the tokenizer picks the kanji words out,
// so a list of words and a paragraph both work.
function wordsFromText(text) {
  if (!tokenizer) return [];
  const out = [], seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    for (const tk of tokenizer.tokenize(line.trim())) {
      const s = tk.surface_form;
      if (!/\p{Script=Han}/u.test(s) || s.length > 6) continue;
      if (!tk.reading || tk.reading === '*') continue;
      const w = { word: s, reading: kata2hira(tk.reading) };
      if (seen.has(wordKey(w))) continue;
      seen.add(wordKey(w));
      out.push(w);
    }
  }
  return out;
}

function addWordsFromText(text) {
  const found = wordsFromText(text);
  if (!found.length) { alert(t('alert_no_words')); return; }
  wordGroups = [{ kanji: t('lbl_from_text'), words: found }];
  renderWordPicker(wordGroups);
  $('wordPickerPanel').style.display = '';
  $('wordPickerPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- switching between the two kinds of sheet ----------------------------
async function setKind(kind) {
  sheetKind = kind === 'choice' ? 'choice' : 'sentences';
  $('kind_sentences').classList.toggle('on', !isChoice());
  $('kind_choice').classList.toggle('on', isChoice());
  $('kind_hint').textContent = t(isChoice() ? 'kind_hint_choice' : 'kind_hint_sentences');
  // the material step changes with the sheet: words, not sentences
  $('secAdd').querySelector('summary').textContent = t(isChoice() ? 'sec_add_words' : 'sec_add');
  $('pickerPanel').style.display = 'none';
  $('wordPickerPanel').style.display = 'none';
  $('lesson_find').textContent = t(isChoice() ? 'btn_find_words' : 'btn_find');
  $('process').textContent = t(isChoice() ? 'btn_extract_words' : 'btn_process');
  $('src_add').textContent = t(isChoice() ? 'btn_extract_words' : 'src_add');
  $('tablePanel').style.display = !isChoice() && state.sentences.length ? '' : 'none';
  $('choicePanel').style.display = isChoice() && state.questions.length ? '' : 'none';
  // a choice sheet has no blank cells and only ever one band (5.8)
  $('o_blankpos').closest('div').style.display = isChoice() ? 'none' : '';
  $('o_boxsize').closest('div').style.display = isChoice() ? 'none' : '';
  $('o_rows').closest('div').style.display = isChoice() ? 'none' : '';
  const perPageLabel = document.querySelector('[data-i18n="f_per_page"]');
  if (perPageLabel) perPageLabel.textContent = t(isChoice() ? 'f_per_page_q' : 'f_per_page');
  if (isChoice()) {
    syncDirFields();
    await ensureDistractors();
    if (allowMade()) await ensureStrokes();
    if (selectedKanji().length) await runWordPicker();
    syncQuestions();
    renderQuestions();
    $('choicePanel').style.display = state.questions.length ? '' : 'none';
  }
  saveSettings();
  refreshPreview();
}

// ---- worksheet / layout --------------------------------------------------
function worksheet() {
  if (isChoice()) {
    return {
      mode: 'choice', header: header(), options: options(),
      questions: state.questions.map(q => ({
        reading: q.dir === 'reading' ? q.word : q.reading, choices: q.used, answerAt: q.answerAt,
      })),
    };
  }
  return { header: header(), options: options(), sentences: state.sentences };
}

// ---- preview -------------------------------------------------------------
function refreshPreview() {
  if (isChoice() ? !state.questions.length : !state.sentences.length) return;
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
// An invented character goes into the .docx as a picture, so it is drawn to a
// canvas first, at 3x the printed size.
function svgToPng(svg, px) {
  return new Promise((resolve) => {
    if (!svg) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = px; c.height = px;
      c.getContext('2d').drawImage(img, 0, 0, px, px);
      c.toBlob(b => (b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a))) : resolve(null)), 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
const cellKey = (c) => (c.draw ? 'd' + c.draw : `${c.op}|${c.base}|${c.at}|${c.part}|${c.donor}`);
async function rasterizeGlyphs(layout) {
  const px = Math.round((layout.fontSize || 18) * 96 / 72) * 3;
  const runs = [];
  for (const page of layout.pages) {
    for (const band of (page.bands || [])) {
      for (const col of band.columns) for (const r of col.runs) if (r.t === 'glyph') runs.push(r);
    }
  }
  const drawn = new Map();
  for (const r of runs) {
    const key = cellKey(r.cell);
    if (!drawn.has(key)) drawn.set(key, await svgToPng(cellSvg(r.cell, { width: px, height: px, color: '#000' }), px));
    r.png = drawn.get(key);
  }
}

async function exportDocx(answers, filename) {
  const layout = buildLayout(worksheet());
  if (layout.choice) await rasterizeGlyphs(layout);
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
$('ans_enable2').addEventListener('change', () => {
  $('ans_buttons2').style.display = $('ans_enable2').checked ? '' : 'none';
});

// ---- choice-sheet controls -----------------------------------------------
$('kind_sentences').addEventListener('click', () => setKind('sentences'));
$('kind_choice').addEventListener('click', () => setKind('choice'));
$('wpick_easyonly').addEventListener('change', () => { if (isChoice()) runWordPicker(); });
$('q_count').addEventListener('change', () => { rebuildQuestions(); saveSettings(); });
$('q_dir').addEventListener('change', () => { syncDirFields(); rebuildQuestions(); saveSettings(); });
function syncDirFields() {
  $('q_style_wrap').style.display = askReading() ? 'none' : '';
  $('q_note').style.display = askReading() ? 'none' : '';
}
$('q_style').addEventListener('change', async () => {
  if (allowMade() && !(await ensureStrokes())) { alert(t('alert_no_strokes')); $('q_style').value = 'real'; }
  rebuildQuestions(); saveSettings();
});
// scatter the answers again, for a teacher who does not want to place them
$('q_shuffle').addEventListener('click', () => {
  for (const q of state.questions) {
    const [ans] = q.used.splice(q.answerAt, 1);
    q.answerAt = Math.floor(Math.random() * (q.used.length + 1));
    q.used.splice(q.answerAt, 0, ans);
  }
  renderQuestions(); refreshPreview();
});
function rebuildQuestions() {
  state.questions = state.words.map(w => makeQuestion(w.word, w.reading));
  renderQuestions(); refreshPreview();
}
$('btnPreview2').addEventListener('click', refreshPreview);
$('btnPdf2').addEventListener('click', () => exportPdf(false));
$('btnPdfAns2').addEventListener('click', () => exportPdf(true));
$('btnDocx2').addEventListener('click', () => exportDocx(false, 'kanji-choice.docx'));
$('btnDocxAns2').addEventListener('click', () => exportDocx(true, 'kanji-choice-answers.docx'));
$('btnSave3').addEventListener('click', saveSet);

// ---- save / load a worksheet set (JSON) ----------------------------------
// the whole worksheet as plain data: what the save button writes out, and what
// is put aside when the page has to reload under the teacher
function setData() {
  return {
    version: 1,
    header: header(),
    options: { perPage: $('o_perpage').value, autoPerPage: $('o_perpage_auto').checked, rows: $('o_rows').value, font: $('o_font').value, fontSize: $('o_fontsize').value, boxSize: $('o_boxsize').value, blankPos: $('o_blankpos').value },
    sentences: state.sentences.map(s => ({
      mode: s.mode,
      tokens: s.tokens.map(t => ({ surface: t.surface, reading: t.reading, hasKanji: t.hasKanji, state: t.state || (t.selected ? 'test' : 'plain') })),
    })),
    kind: sheetKind,
    choice: { count: $('q_count').value, style: $('q_style').value, dir: $('q_dir').value },
    words: state.words,
    // the wrong answers chosen for each question and the order they sit in, so
    // a reprint is exact and any hand placing survives
    questions: state.questions.map(q => ({
      word: q.word, reading: q.reading, dir: q.dir, answerAt: q.answerAt, used: q.used, offered: q.offered,
    })),
  };
}
function saveSet() {
  const stamp = ($('h_class').value || 'kanji') + '-' + ($('h_lesson').value || '');
  downloadBlob(new Blob([JSON.stringify(setData(), null, 1)], { type: 'application/json' }), `${stamp}.ktm.json`.replace(/\s+/g, ''));
}
function applySet(d) {
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
  if (d.choice) {
    if (d.choice.count != null) $('q_count').value = d.choice.count;
    if (d.choice.style != null) $('q_style').value = d.choice.style;
    if (d.choice.dir != null) $('q_dir').value = d.choice.dir;
  }
  state.words = d.words || [];
  state.questions = (d.questions || []).map(q => ({
    word: q.word, reading: q.reading, dir: q.dir || 'kanji',
    answerAt: q.answerAt || 0, used: q.used || [], offered: q.offered || [],
  }));
  saveSettings();
  renderTable();
  $('tablePanel').style.display = !isChoice() && state.sentences.length ? '' : 'none';
  // a set saved before choice sheets existed has no kind, and is a sentence sheet
  setKind(d.kind || 'sentences').then(() => {
    if (isChoice()) { renderQuestions(); $('choicePanel').style.display = state.questions.length ? '' : 'none'; }
    refreshPreview();
  });
}
function loadSet(file) {
  const fr = new FileReader();
  fr.onload = () => {
    let d; try { d = JSON.parse(fr.result); } catch (e) { alert(t('alert_load_failed')); return; }
    applySet(d);
  };
  fr.readAsText(file);
}

// Updating means reloading, and a teacher halfway through a worksheet would
// lose the lot. Put the work aside on the way out and pick it up on the way in,
// text boxes included: what has been typed but not analysed counts too.
const RESUME_KEY = 'ktm_resume';
function stashWork() {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify({
      set: setData(), input: $('input').value, source: $('src_text').value,
    }));
  } catch (e) { console.warn('the work could not be put aside', e); }
}
function resumeWork() {
  let d = null;
  try {
    d = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null');
    localStorage.removeItem(RESUME_KEY);
  } catch (e) {}
  if (!d) return;
  if (d.set) applySet(d.set);
  if (d.input) { $('input').value = d.input; fitBox($('input')); }
  if (d.source) {
    $('src_text').value = d.source;
    $('src_out').style.display = '';
    fitBox($('src_text'));
  }
}
resumeWork();
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
      stashWork(); // the new build comes up with the worksheet still on it
      location.reload();
    });
  });
}
