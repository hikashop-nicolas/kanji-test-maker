# 漢字テストメーカー · Kanji Test Maker

**English** | [日本語](README.ja.md)

A free tool for teachers. Choose this week's kanji, or paste your own sentences,
and get a vertical-writing (縦書き) kanji worksheet as a **PDF** and as an
editable **Word (.docx)**, with an answer key if you want one.

Everything happens in your browser. There is no account, nothing is uploaded,
and your sentences never leave your computer.

## Use it now

**https://hikashop-nicolas.github.io/kanji-test-maker/**

Nothing to install. You can also add it to your computer as an app: open the
link and use your browser's install button (the icon at the right of Chrome's
address bar, or File ▸ Add to Dock in Safari). It then opens in its own window,
like any other app, and keeps working without an internet connection.

The dictionary, fonts and text-recognition models are large, so they are not
downloaded up front. They are kept the first time you use them, and are
available offline from then on.

## Making a worksheet

You can build a sheet straight from a school grade, or paste your own sentences
(see [Your own sentences](#your-own-sentences) below).

**1. Choose a level, then the kanji.** Pick a school grade (小1 to 小6, or
secondary jōyō) or a JLPT level (N5 to N1). The table is ordered by stroke count
then radical, the order teachers scan. Click to select, or type kanji straight
into the field, including kanji from other levels.

![Choose grade and kanji](docs/screenshots/01-pick-kanji.png)

**2. Choose example sentences.** For each kanji you get example sentences with
the easiest, most useful ones first, and the target kanji highlighted. Tick
やさしい文だけ to keep only sentences that stay within the level.

![Pick example sentences](docs/screenshots/02-pick-sentences.png)

**3. Adjust in the table.** The sentences you ticked land in an editable table
with the lesson kanji already marked. Click any word to change what happens to
it:

- そのまま (grey): shown as written.
- テスト (blue): becomes an answer box.
- ふりがな (orange): kanji kept, with furigana added.
- ひらがな (red): kanji replaced by its reading. Sentences added from the picker
  start with words above the chosen level already in this state.

Each sentence is either 書き (the reading is shown, the pupil writes the kanji)
or 読み (the kanji is shown, the pupil writes the reading). The buttons above the
table switch **every** sentence at once, so one set of sentences gives you a
write sheet and a read sheet without clicking through them one by one.
**順番をシャッフル** puts the sentences in a new order and renumbers them, which
is how you get a second sheet on the same words that cannot be answered from
memory of the first.

Readings can be corrected in place if the analysis gets one wrong. It most often
does when a word is written half in kana, the way a worksheet spells a kanji the
class has not met yet: あま酒 is not in any dictionary, so 酒 is read on its own
and comes out しゅ rather than ざけ. Where that happens, a dashed alternative
appears next to the reading (ざけ, from 甘酒). Click it to take it.

![Edit the table](docs/screenshots/03-edit-table.png)

**4. Save the worksheet.** **PDF を保存** gives a print-ready PDF, **Word
(.docx) を保存** an editable document with the font embedded, so it looks right
even on a computer that does not have that font. Tick **解答シートも作成する**
to also get an answer key: the same sheet with every box filled in.

![Generated worksheet](docs/screenshots/04-worksheet.png)

## Your own sentences

**Paste them.** In the 文を貼り付け tab, put one sentence per line, written
normally with kanji, and click 解析する. Kanji words are detected and marked for
you; from there it is the same table as above. `test_sentences.md` has
ready-made sets to try.

**Take them from a file.** The ファイルから tab takes a PDF, a Word document
(`.docx` or the older `.doc`), an OpenDocument `.odt`, a plain `.txt`, or a
photo or scan of a textbook page or an old worksheet. Drop them on the box or
pick them with the button, several at once if you have them: scanning a
workbook gives one file per page, and the whole stack can go in together.
Reading starts as soon as you hand a file over, one at a time in the order you
gave them, and each file's sentences appear under the ones before it. Nothing is
sent anywhere; the files are read on your own computer.

Anything carrying its own text gives it up exactly as it was typed, vertical
writing included: a PDF made by Word or Excel, a Word or OpenDocument file, a
text file. Older text saved in Shift_JIS or EUC is recognised as such, so it
does not come out as mojibake.

Only a scan has no text to read. Those pages, and any image, go through
character recognition instead. The reader used first is a model trained on
Japanese as it is set on a page, vertical writing included, which on ordinary
worksheet scans gets the sentences right where the older engine would swap a
kanji for one that looks similar; that older engine is still there for pages the
new one cannot be given clean lines from. Which way the page reads is worked out
for you: the app looks at where the white space runs, then has the recognizer try
the likeliest readings and keeps the one that comes out as actual words. A
縦書き sheet that went through the scanner sideways is turned the right way up
on its own. When it cannot tell, it shows you the page the four ways round and
asks which one reads. Recognition is not perfect on a home scan.

Either way the lines land in an editable box, so read them over and fix or
delete what came out wrong before adding them. A long document stops at the
first 300 sentences.

## Layout

Under 見た目・レイアウト:

- **Sentences per page.** Left on 自動, the sheet fits as many as the page takes.
  Untick it to set an exact number.
- **Bands per page.** One band of full-height columns, or two shorter ones
  stacked, which suits short sentences: with one band they leave the bottom half
  of the sheet empty.
- **Blank position.** In the sentence (文中, the usual Japanese layout, and the
  default), with the box where the kanji goes and the reading alongside it, or in
  a side column (横の欄).
- **Font and sizes.** Six Japanese fonts (Klee One by default, whose handwriting
  shapes suit lower grades), the fonts on your own computer, or a font file you
  upload. Font size and box size are separate settings.
- **Extras.** Score and parent's-seal boxes below the name, and a logo in the
  bottom-left corner. Multi-page sheets are numbered automatically.

The heading itself is optional: untick **シートに見出しを入れる** under テスト情報
and the class, title and name line comes off, and the column it stood in goes to
the sentences. A sheet someone makes to practise on themselves has no one to
hand it in to.

If a sentence will not fit on the page, the preview says so in red rather than
dropping it silently. Reduce the font or box size, or add a band.

## Saving and reopening

**セットを保存** saves the whole sheet, sentences, word states, header and
options, as a small `.ktm.json` file. **セットを読み込み** opens it again later
to adjust or reprint. Your header and layout settings are also remembered
between visits.

## Good to know

- The example sentences come from the Tatoeba corpus, filtered to sentences
  written by native or fluent speakers, plus some written for this project. No
  textbook content is copied.
- The JLPT lists are unofficial reconstructions. No official list has been
  published since 2010.
- The interface is in Japanese, English and French, switchable from the top bar.
  The worksheets themselves are of course in Japanese.
- A `.docx` carries a full copy of the font, which adds 1.5 to 5 MB to the file.
  The PDF is much lighter.
- Very long sentences may not fit one column at large font or box sizes. Reduce
  the sizes, add a band, or split the sentence.

## For developers

Running it locally, the project layout, and how the lesson data is generated:
see [docs/DEVELOPING.md](docs/DEVELOPING.md).

## License

Source code: MIT (see `LICENSE`). The bundled libraries, dictionary, fonts and
lesson data keep their own licenses, listed in `THIRD_PARTY.md`: fonts are SIL
OFL 1.1, kanji data is KANJIDIC2 (CC BY-SA 4.0), example sentences are Tatoeba
(CC BY 2.0 FR).
