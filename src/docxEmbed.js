// The docx library embeds the font file + fontTable, but Word only applies an
// embedded font when settings.xml also carries <w:embedTrueTypeFonts/>. This
// post-processes the packed .docx (a zip) to add that flag. JSZip is passed in
// (node require or the browser global) so this stays environment-agnostic.
export async function addFontEmbedFlag(bytes, JSZip) {
  const zip = await JSZip.loadAsync(bytes);
  const f = zip.file('word/settings.xml');
  if (f) {
    let s = await f.async('string');
    if (!s.includes('w:embedTrueTypeFonts')) {
      s = s.replace(/(<w:settings\b[^>]*>)/, '$1<w:embedTrueTypeFonts/><w:embedSystemFonts/>');
      zip.file('word/settings.xml', s);
    }
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
