// Getting lines of text out of the plain and zipped document formats.
// The legacy .doc is a different animal and lives in msDoc.js.

// Japanese plain text still arrives in Shift_JIS often enough that guessing is
// worth it, and the browser already knows all three encodings. UTF-8 is checked
// strictly, so it either is UTF-8 or it is not; the legacy pair is then settled
// by which one leaves fewer characters it could not make sense of.
const LEGACY = ['shift_jis', 'euc-jp'];

export function decodeText(bytes) {
  const b = new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    let best = '';
    let fewest = Infinity;
    for (const enc of LEGACY) {
      const s = new TextDecoder(enc).decode(b);
      const bad = (s.match(/�/g) || []).length;
      if (bad < fewest) { best = s; fewest = bad; }
    }
    return best;
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unescapeXml(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, ref) => {
    if (ref[0] !== '#') return ENTITIES[ref] ?? whole;
    const hex = ref[1] === 'x';
    return String.fromCodePoint(parseInt(ref.slice(hex ? 2 : 1), hex ? 16 : 10));
  });
}

// A paragraph is the unit the teacher typed, so it is the unit to return, even
// when the writer split it into a dozen runs to change a colour mid-sentence.
// Both formats are read straight off the markup: the tags carrying text are few
// and named, and building a DOM buys nothing for pulling out plain lines.

// word/document.xml of a .docx -> one line per paragraph, table cells included
export function docxLines(xml) {
  const out = [];
  for (const p of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    let line = '';
    for (const t of p[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>/g)) {
      line += t[1] === undefined ? ' ' : unescapeXml(t[1]);
    }
    out.push(line.trim());
  }
  return out;
}

// content.xml of an .odt -> the same. Headings are paragraphs too, and the runs
// inside either one (text:span, text:a) fall away with the rest of the tags.
export function odtLines(xml) {
  const out = [];
  for (const p of xml.matchAll(/<text:(p|h)(?:\s[^>]*)?>([\s\S]*?)<\/text:\1>/g)) {
    out.push(unescapeXml(p[2]
      .replace(/<text:s\s+text:c="(\d+)"\s*\/>/g, (w, n) => ' '.repeat(Math.min(+n, 64)))
      .replace(/<text:(s|tab)\s*\/>/g, ' ')
      .replace(/<[^>]*>/g, '')).trim());
  }
  return out;
}
