# 漢字テストメーカー · Kanji Test Maker

A browser tool for teachers: paste Japanese sentences, mark the words to test,
and generate a vertical-writing (縦書き) kanji worksheet as a **PDF** and an
editable **Word (.docx)**, with the font embedded so it looks right anywhere.

No accounts, no server-side processing, no build step. Everything (tokenizing,
layout, PDF, .docx, font embedding) runs in the browser.

## Use it now

**https://hikashop-nicolas.github.io/kanji-test-maker/** — open it in your
browser, nothing to install.

## What it does

You can paste your own sentences, **or build a sheet straight from a school
grade** — pick the grade, choose this week's kanji, and the tool finds example
sentences for you.

**1. Pick a grade and choose the kanji.** The table is sorted by stroke count
then radical (the order teachers scan). Click to select, or type kanji straight
into the field — including kanji from other grades.

![Choose grade and kanji](docs/screenshots/01-pick-kanji.png)

**2. Pick from ranked example sentences.** For each kanji you get example
sentences ranked so the easiest, most reinforcing ones come first; the target
kanji is highlighted. "やさしい文だけ" keeps only sentences within the grade.

![Pick example sentences](docs/screenshots/02-pick-sentences.png)

**3. Fine-tune in the table.** Checked sentences drop into the editable table
with only the lesson kanji marked. Toggle any word, fix a reading, switch a
sentence between 書き (write the kanji) and 読み (write the reading). You can also
paste extra sentences of your own.

![Edit the table](docs/screenshots/03-edit-table.png)

**4. Get the worksheet.** Save a print-perfect PDF or an editable .docx, in the
classic vertical layout with answer boxes and circled numbers.

![Generated worksheet](docs/screenshots/04-worksheet.png)

## Features

- **Lesson auto-fill.** Pick a grade (小1–小6 or secondary jōyō), choose the
  week's kanji from a stroke/radical-sorted table, and get example sentences
  ranked by readability — every jōyō kanji is covered. Sources: KANJIDIC2 and
  the Tatoeba sentence corpus (see `THIRD_PARTY.md`); no copyrighted textbook
  content.
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
npm run serve
# python3 tools/devserver.py  (serves on :8799, no-cache)
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

(For the grade → kanji → sentence flow, see **What it does** above. The steps
below cover pasting your own sentences.)

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
- `src/app.js` — UI glue (kuromoji, table, settings, exports, lesson picker).
- `src/lesson.js` — grade → kanji table, selection (grid + editable field).
- `src/sentences.js` — example-sentence scoring (i+1 ranking) + candidate lists.
- `vendor/` — kuromoji.js, docx, JSZip (no build step).
- `assets/dict/` — kuromoji dictionary
- `assets/fonts/` — embeddable TTFs.
- `assets/data/` — generated lesson data (kanji index + per-grade sentences).
- `tools/gen.mjs` — Node harness to render outputs without a browser.

### Regenerating the lesson data

The files in `assets/data/` are generated and committed (GitHub Pages serves
them directly). To rebuild from source:

```bash
npm run build:data     # tools/build-data.mjs (KANJIDIC2) + build-sentences.mjs (Tatoeba)
```

`build-data.mjs` writes `assets/data/kanji.json` (grade, strokes, radical,
readings) from KANJIDIC2. `build-sentences.mjs` writes the per-grade sentence
index from the Tatoeba Japanese corpus, plus ~39 original sentences from
`tools/manual-sentences.json` for rare kanji with no Tatoeba example. Both cache
their downloads under `tools/data-cache/` (gitignored); re-running refreshes the
data. See `THIRD_PARTY.md` for the data licenses (KANJIDIC2 CC BY-SA 4.0,
Tatoeba CC BY 2.0 FR).

## Notes & limits

- `.docx` font embedding adds the full font (~1.5–5 MB) to each file; it is not
  subsetted. The PDF is the lightest faithful output.
- A `.docx` references a font by name; the embedded copy covers recipients who
  do not have it installed.
- Very long sentences may not fit one column at large font/box sizes; reduce the
  sizes or split the sentence.

## License

Source code: MIT (see `LICENSE`). Bundled libraries, dictionary, fonts, and
lesson data keep their own licenses — see `THIRD_PARTY.md` (fonts are SIL OFL
1.1, `assets/fonts/OFL.txt`; kanji data is KANJIDIC2 CC BY-SA 4.0; example
sentences are Tatoeba CC BY 2.0 FR).
