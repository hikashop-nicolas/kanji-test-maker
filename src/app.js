// Browser app: paste -> kuromoji -> editable table -> DOCX / PDF.
import { normalizeTokens, buildLayout } from './model.js?v=2';
import { buildHtml } from './htmlExport.js?v=2';
import { buildDocx } from './docxExport.js?v=2';

const $ = (id) => document.getElementById(id);
const state = { sentences: [] };
let tokenizer = null;
let customFontFamily = null; // set when a font file is uploaded (preview/PDF only)

// ---- init kuromoji -------------------------------------------------------
window.kuromoji.builder({ dicPath: 'assets/dict' }).build((err, tok) => {
  if (err) { $('status').textContent = '辞書の読み込みに失敗しました'; console.error(err); return; }
  tokenizer = tok;
  $('status').textContent = '準備完了';
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
    fontSize: parseFloat($('o_fontsize').value) || 16,
    boxSize: parseFloat($('o_boxsize').value) || 8,
  };
}

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
      b.textContent = m === 'kaki' ? '書き' : '読み';
      b.className = sent.mode === m ? 'on' : '';
      b.onclick = () => {
        sent.mode = m;
        // kaki tests every kanji word (write them) -> auto-select; yomi tests
        // specific readings -> start empty so the teacher picks.
        sent.tokens.forEach(t => { t.selected = (m === 'kaki') && t.hasKanji; });
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
      const chip = document.createElement('span');
      chip.className = 'chip' + (tok.hasKanji ? ' kanji' : '') + (tok.selected ? ' sel' : '');
      const surf = document.createElement('span');
      surf.textContent = tok.surface;
      chip.appendChild(surf);
      if (tok.selected) {
        const rd = document.createElement('span');
        rd.className = 'rd';
        const inp = document.createElement('input');
        inp.value = tok.reading;
        inp.title = 'よみ';
        inp.onclick = (e) => e.stopPropagation();
        inp.oninput = () => { tok.reading = inp.value; };
        inp.onchange = refreshPreview;
        rd.appendChild(inp);
        chip.appendChild(rd);
      }
      chip.onclick = () => { tok.selected = !tok.selected; renderTable(); refreshPreview(); };
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
  const ifr = $('preview');
  ifr.srcdoc = html;
  $('previewPanel').style.display = '';
}
$('btnPreview').addEventListener('click', refreshPreview);
// live-refresh the preview when settings or header fields change
['h_class','h_title','h_lesson','h_name','o_perpage','o_font','o_fontsize','o_boxsize']
  .forEach(id => $(id).addEventListener('input', refreshPreview));

// ---- font file (preview/PDF only) ----------------------------------------
let customFontDataUrl = null;
$('o_fontfile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) { customFontFamily = null; customFontDataUrl = null; refreshPreview(); return; }
  const buf = await file.arrayBuffer();
  customFontFamily = 'UserFont';
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
$('btnPdf').addEventListener('click', () => {
  const html = buildHtml(buildLayout(worksheet()), { font: options().font, fontFace: customFontCss() });
  const w = window.open('', '_blank');
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); };
});

// ---- DOCX ----------------------------------------------------------------
$('btnDocx').addEventListener('click', async () => {
  const layout = buildLayout(worksheet());
  // docx uses a font NAME only; if a custom file was uploaded, fall back to the
  // selected bundled font name (the PDF export is the faithful path for it).
  layout.font = $('o_font').value;
  const doc = buildDocx(layout, window.docx);
  const blob = await window.docx.Packer.toBlob(doc);
  downloadBlob(blob, 'kanji-test.docx');
});

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
