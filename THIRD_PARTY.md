# Third-party components

This project bundles the following components, each under its own license.

## Libraries (in `vendor/`)

| Component | Use | License |
|---|---|---|
| [kuromoji.js](https://github.com/takuyaa/kuromoji.js) (+ `assets/dict/`) | Japanese tokenization / readings, in the browser | Apache-2.0 |
| [docx](https://github.com/dolanmiu/docx) | `.docx` generation | MIT |
| [JSZip](https://stuk.github.io/jszip/) | zip post-processing (font-embed flag) | MIT / GPLv3 (dual) |

## Fonts (in `assets/fonts/`)

All bundled fonts are under the **SIL Open Font License 1.1** (see
`assets/fonts/OFL.txt`), which permits bundling and embedding in documents.

| Font | Source |
|---|---|
| Klee One | Google Fonts (Type Project / Fontworks) |
| LINE Seed JP | Google Fonts (LINE Corporation) |
| Zen Kaku Gothic New | Google Fonts (Zen Project) |
| Zen Maru Gothic | Google Fonts (Zen Project) |
| Kaisei Tokumin | Google Fonts (FONTDASU) |
| Yuji Syuku | Google Fonts |

When a worksheet's `.docx` embeds one of these fonts, the embedded font remains
under the OFL; the OFL text is included in the file's font data and in this repo.
