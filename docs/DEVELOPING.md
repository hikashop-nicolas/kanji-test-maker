# Developing

Notes for working on the app itself. For what it does and how to use it, see the
[README](../README.md).

## Running it locally

The app is static, but it fetches the kuromoji dictionary and the fonts, so it
has to be served over HTTP; opening `index.html` from the filesystem will not
work.

```bash
npm run serve      # regenerates sw.js, then serves :8799 with no-cache headers
# open http://localhost:8799/
```

Any static server works (`python3 -m http.server` and so on); `serve` just adds
the no-cache headers that make editing bearable, and rebuilds the service worker
first.

There is no build step for the app code. `vendor/` holds kuromoji.js, docx and
JSZip as plain scripts, and `src/` is loaded as ES modules. tesseract.js and
pdf.js are fetched from `vendor/` on demand, the first time a file needs them.

## Project layout

```
paste → kuromoji (tokens + readings) → editable table
      → buildLayout() (abstract worksheet)
      → htmlExport (vertical-rl HTML)  → preview / print → PDF
      → docxExport (vertical RTL table) → docx.js → JSZip (embed-font flag) → .docx
```

| File | What it does |
|---|---|
| `src/model.js` | Pure: tokens to worksheet layout. Word states, kaki/yomi, box positions, circled numbers, page and band splitting, auto page filling. |
| `src/htmlExport.js` | Pure: layout to vertical HTML, used for both the preview and the PDF. |
| `src/docxExport.js` | Layout to `.docx`: a vertical right-to-left table, one per band. |
| `src/docxEmbed.js` | Adds the `<w:embedTrueTypeFonts/>` flag Word needs. |
| `src/app.js` | UI glue: kuromoji, the table, settings, exports, reading files, service worker. |
| `src/lesson.js` | Grade to kanji table, and the selection grid. |
| `src/sentences.js` | Example-sentence scoring (i+1 ranking) and candidate lists. |
| `src/i18n.js` | Interface translations (ja/en/fr) and the language switcher. |
| `src/pdfText.js` | Pure: pdf.js text items to lines, columns of vertical writing included. |
| `src/readingHints.js` | Pure: a second reading for a kanji, found by putting the kana part of a half-written word back into kanji and asking the dictionary. |
| `src/fileText.js` | Pure: `.txt` decoding (UTF-8, Shift_JIS, EUC-JP) and paragraphs out of `.docx` / `.odt` XML. |
| `src/msDoc.js` | Pure: the Word 97-2003 `.doc` container and piece table. No dependency; JSZip covers the zipped formats. |
| `assets/dict/` | kuromoji dictionary. |
| `assets/fonts/` | TTFs, embedded into the `.docx`. |
| `assets/data/` | Generated lesson data: kanji index and per-grade sentences. |
| `assets/tessdata/`, `vendor/tesseract/` | OCR models and engine, loaded on first use. |
| `vendor/pdfjs/` | pdf.js, loaded the first time a PDF is opened. Its `cmaps/` are what lets a Japanese PDF give up its text, its `wasm/` what decodes a scan's images. |
| `tools/gen.mjs` | Node harness that renders the outputs without a browser. |

The column geometry in `model.js` (used to fit sentences to the page
automatically) mirrors the CSS in `htmlExport.js`. If you change the column
widths there, change it in both.

The ファイルから tab decides what a file is from its first bytes, not its
extension, then routes it: text layer for a PDF, XML for a zipped office
document, the piece table for a `.doc`, and tesseract for an image or a PDF page
that turns out to be a scan. Whatever comes back goes through the same line
cleanup, which keeps only lines carrying kanji.

## Dependencies

There is no bundler, so the browser loads the copies committed in `vendor/` and
`assets/dict/`. Those are byte-for-byte copies of files inside the npm packages
in `package.json`, which means **bumping a package does not change what ships**
until the copies are refreshed:

```bash
npm install            # or accept a Dependabot PR
npm run vendor         # recopy vendor/ and assets/dict/ from node_modules
```

`.github/workflows/vendor-sync.yml` runs `npm run vendor -- --check` on every
pull request and fails when a copy is out of date, so a bump cannot be merged
half-applied. If a major release moves a file, the script says which path it
could no longer find; fix the mapping at the top of `tools/sync-vendor.mjs`.

Dependabot (`.github/dependabot.yml`) watches the npm packages and the GitHub
Actions, weekly, grouping minor and patch bumps into one PR and leaving majors
on their own. It does not see the fonts in `assets/fonts/` (Google Fonts) or the
OCR models in `assets/tessdata/` (tessdata_fast); both change rarely and are
updated by hand.

## PWA

`sw.js` is generated from what is actually in the repo by `tools/gen-sw.mjs`,
and is **not** committed: `npm run serve` and the deploy workflow both rebuild
it, so it cannot drift from what ships.

Only the shell is precached, about 1.9 MB. The dictionary, fonts, OCR models,
pdf.js and the per-grade sentence files are kept as they are fetched instead,
because precaching them would turn installing the app into a 70 MB download.

The cache name is a digest of the precached files, so a changed deploy triggers
an update and an identical rebuild does not. A waiting worker raises a banner
rather than swapping the app out mid-worksheet.

Icons come from `npm run build:icons`, which needs `rsvg-convert`
(`brew install librsvg`). The generated PNGs are committed.

## Deploy (GitHub Pages)

Push the repo and enable Pages. `.github/workflows/deploy.yml` publishes the
repo root on every push to `main`, regenerating `sw.js` first. `node_modules/`
is gitignored and is not needed at runtime.

The Google Fonts used for on-screen display load from Google's CDN, so the
preview needs internet the first time; the service worker keeps them afterwards.
The `.docx` font embedding uses the local copies in `assets/fonts/`, so it works
offline either way.

## Regenerating the lesson data

The files in `assets/data/` are generated and committed, since Pages serves them
directly.

```bash
npm run build:data     # build-data.mjs (KANJIDIC2) + build-sentences.mjs (Tatoeba)
```

`build-data.mjs` writes `assets/data/kanji.json` (grade, strokes, radical,
readings) from KANJIDIC2, plus a reconstructed JLPT level per kanji from
davidluzgouveia/kanji-data.

`build-sentences.mjs` writes the per-grade sentence index from the Tatoeba
Japanese corpus, keeping a sentence only when its author is a native or fluent
speaker (self-rated 4-5) or it has recorded audio, both strong naturalness
signals. It adds about 39 original sentences from `tools/manual-sentences.json`
for rare kanji with no Tatoeba example, and a curated grade-pure supplement from
`tools/authored-sentences.json`: original sentences whose every kanji is at or
below the grade, ranked first. Check that set with
`npm run validate:authored -- 1`, which rejects any above-grade kanji.

It reads Tatoeba's `jpn_sentences_detailed.tsv`, `user_languages.csv` and
`sentences_with_audio.csv`, cached under `tools/data-cache/` (gitignored);
re-running refreshes them. Data licenses are in `THIRD_PARTY.md`.
