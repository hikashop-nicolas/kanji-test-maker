// Browser app: paste -> kuromoji -> editable table -> DOCX / PDF.
import { normalizeTokens, buildLayout } from './model.js?v=2';
import { buildHtml } from './htmlExport.js?v=2';
import { buildDocx } from './docxExport.js?v=2';
import { addFontEmbedFlag } from './docxEmbed.js?v=2';
import { initLessonBuilder, onLessonChange, selectedKanji, gradeOf, jlptOf, setSelection, currentGrade, refreshLabels } from './lesson.js?v=2';
import { buildCandidates } from './sentences.js?v=2';
import { t, initLang, applyI18n, getLang, setLang } from './i18n.js?v=2';

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
const SETTING_IDS = ['h_class','h_title','h_lesson','h_name','o_perpage','o_font','o_fontsize','o_boxsize','o_blankpos'];
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
    for (const s of grp.sentences) {
      totalShown++;
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
      block.appendChild(row);
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
    const tokens = normalizeTokens(tokenizer.tokenize(text));
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
  return { classCode: $('h_class').value, title: $('h_title').value, lessonNo: $('h_lesson').value, nameLabel: $('h_name').value };
}
function options() {
  return {
    perPage: parseInt($('o_perpage').value, 10) || 10,
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
$('process').addEventListener('click', () => {
  if (!tokenizer) return;
  const lines = $('input').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  state.sentences = lines.map(line => ({ tokens: normalizeTokens(tokenizer.tokenize(line)), mode: 'kaki' }));
  renderTable();
  $('tablePanel').style.display = state.sentences.length ? '' : 'none';
  refreshPreview();
});

// ---- table ---------------------------------------------------------------
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
  $('previewPanel').style.display = '';   // before srcdoc so the iframe width is known on load
  $('preview').srcdoc = html;
}
$('btnPreview').addEventListener('click', refreshPreview);

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
    options: { perPage: $('o_perpage').value, font: $('o_font').value, fontSize: $('o_fontsize').value, boxSize: $('o_boxsize').value, blankPos: $('o_blankpos').value },
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
    if (o.perPage != null) $('o_perpage').value = o.perPage;
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
