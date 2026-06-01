# 漢字テストメーカー (Kanji Test Maker)

A browser tool for teachers: paste Japanese sentences, mark the words to test,
and generate a vertical-writing (縦書き) kanji worksheet as **Word (.docx)** or
**PDF**. See `plan.md` for the design.

## Status: Phase 1 (MVP) — working

- Paste sentences (one per line) → analyzed with kuromoji in the browser.
- Editable table: kanji words auto-selected; click a word to toggle; per-sentence
  **書き / 読み** (write / read) switch; editable readings.
- Options: header fields (class, title, lesson no., name), sentences per page,
  font selector + custom font upload (custom font applies to the PDF/preview).
- Live preview, **Download PDF** (browser print), **Download .docx**.

Both outputs reproduce the sample layout: title column, right-to-left vertical
sentences, side-lined readings, and answer boxes sized to each word
(書き: write the word; 読み: write the reading).

## Run locally

It is a static site, but the kuromoji dictionary is fetched, so use a server
(file:// will not work):

```
python3 -m http.server 8799
# open http://localhost:8799/index.html
```

## Deploy (GitHub Pages)

Push the repo (with `assets/dict/`, `vendor/`, `src/`, `index.html`) and enable
Pages on the branch. `node_modules/` is gitignored; nothing is built. The
dictionary is ~19 MB of static files, well within Pages limits.

## Layout

```
index.html          app shell + UI
src/model.js        pure: tokens -> worksheet layout (auto-select, kaki/yomi, box sizing)
src/htmlExport.js   pure: layout -> vertical HTML (preview + PDF)
src/docxExport.js   layout + docx lib -> .docx (vertical RTL table, inline boxes)
src/app.js          browser glue (kuromoji, table UI, downloads)
vendor/             kuromoji.js + docx.umd.js (no build step)
assets/dict/        kuromoji dictionary
tools/gen.mjs       Node harness to generate/inspect output without the browser
samples/            reference worksheet (the provided PDF)
poc/                feasibility spikes
```

## Dev harness (no browser)

```
node tools/gen.mjs            # writes tools/out.html and tools/out.docx
```

## Notes / next (Phase 2)

- Match the sample pixel-for-pixel (box look, spacing, ticks).
- Custom fonts in .docx are name-only (cannot be embedded); use the PDF export
  to lock a custom font's appearance.
- Pagination polish for long sentences; optional 教科書体 font.
