# 漢字テストメーカー · Kanji Test Maker

A browser tool for teachers: paste Japanese sentences, mark the words to test,
and generate a vertical-writing (縦書き) kanji worksheet as a **PDF** and an
editable **Word (.docx)**, with the font embedded so it looks right anywhere.

No accounts, no server-side processing, no build step. Everything (tokenizing,
layout, PDF, .docx, font embedding) runs in the browser.

## Features

- **Paste & mark.** Paste sentences (one per line); kanji words are auto-detected
  and selected. Click a word to toggle it. Readings are editable.
- **書き / 読み per sentence.** *Write* mode shows the reading and a box to write
  the word; *read* mode shows the kanji and a box to write the reading.
- **Vertical worksheet** matching the classic layout: title column, right-to-left
  sentences, side-lined tested words, an aligned answer-box column, circled
  sentence numbers (any value), and a name field.
- **Two outputs:** a print-perfect **PDF** and an editable **.docx**. The chosen
  font is **embedded in the .docx**, so it displays even if the recipient does
  not have it installed.
- **Fonts:** Google Japanese fonts (Klee One default — handwriting/textbook
  shapes suited to lower grades — plus LINE Seed JP, Zen Kaku/Maru Gothic,
  Kaisei Tokumin, Yuji Syuku), or upload your own.
- **Settings persist** (class, lesson, name, per-page count, font, sizes) via
  localStorage.

## Quick start (local)

The app is static, but the kuromoji dictionary and the fonts are fetched, so it
must be served over HTTP (opening the file directly will not work):

```bash
npm run serve          # python3 tools/devserver.py  (serves on :8799, no-cache)
# open http://localhost:8799/index.html
```

Any static server works (`python3 -m http.server`, etc.); `serve` just adds
no-cache headers, handy while editing.

## Deploy (GitHub Pages)

It is a static site — push the repo and enable Pages. A workflow is included
(`.github/workflows/deploy.yml`) that publishes the repo root to Pages on every
push to `main`. `node_modules/` is gitignored and not needed at runtime (the
libraries are vendored in `vendor/`).

Note: the Google Fonts used for on-screen display load from Google's CDN, so the
preview needs internet. The `.docx` font embedding uses the local copies in
`assets/fonts/`, so it works offline.

## How to use

1. Fill the header (class, weekly title, lesson number, name label).
2. Paste sentences, one per line, written naturally with kanji.
3. Click **解析する**. In the table, toggle which words to test and switch each
   sentence between 書き / 読み. Fix any reading inline.
4. Adjust options: sentences per page, font, font size, box size.
5. **PDF を保存** (browser print → Save as PDF) or **Word (.docx) を保存**.

See `test_sentences.md` for ready-to-paste example sets.

## How it works

```
paste → kuromoji (tokens + readings) → editable table
      → buildLayout() (abstract worksheet)
      → htmlExport (vertical-rl HTML)  → preview / print → PDF
      → docxExport (vertical RTL table) → docx.js → JSZip (embed-font flag) → .docx
```

- `src/model.js` — pure: tokens → worksheet layout (auto-select, merge adjacent
  kanji, kaki/yomi, box positions, circled numbers, full-width title digits).
- `src/htmlExport.js` — pure: layout → vertical HTML (preview + PDF).
- `src/docxExport.js` — layout → `.docx` (vertical table, embedded font).
- `src/docxEmbed.js` — adds the `<w:embedTrueTypeFonts/>` flag Word needs.
- `src/app.js` — UI glue (kuromoji, table, settings, exports).
- `vendor/` — kuromoji.js, docx, JSZip (no build step).
- `assets/dict/` — kuromoji dictionary · `assets/fonts/` — embeddable TTFs.
- `tools/gen.mjs` — Node harness to render outputs without a browser.

## Notes & limits

- `.docx` font embedding adds the full font (~1.5–5 MB) to each file; it is not
  subsetted. The PDF is the lightest faithful output.
- A `.docx` references a font by name; the embedded copy covers recipients who
  do not have it installed.
- Very long sentences may not fit one column at large font/box sizes; reduce the
  sizes or split the sentence.

## License

Source code: MIT (see `LICENSE`). Bundled libraries, dictionary, and fonts keep
their own licenses — see `THIRD_PARTY.md` (fonts are SIL OFL 1.1,
`assets/fonts/OFL.txt`).
