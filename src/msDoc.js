// Reading the text of a Word 97-2003 .doc.
//
// A .doc is a small filesystem (a compound file) holding, among others, a
// WordDocument stream of characters and a table stream saying which stretches
// of it are the document and in what order. Word rewrites only the changed
// pieces when it saves, so the characters are rarely in reading order: the
// piece table is not an optional refinement, it is the only way to get the
// sentences back in the order they were typed. Everything here is per MS-DOC.
//
// The newer .docx is a zip of XML and is handled in fileText.js instead.

// --- compound file ---------------------------------------------------------

function readCfb(buf) {
  const v = new DataView(buf);
  if (v.getUint32(0, true) !== 0xe011cfd0 || v.getUint32(4, true) !== 0xe11ab1a1) return null;
  const sectorSize = 1 << v.getUint16(30, true);
  const miniSize = 1 << v.getUint16(32, true);
  const cutoff = v.getUint32(56, true);
  const sectorAt = (n) => 512 + n * sectorSize;

  // the FAT is itself stored in sectors, listed by the DIFAT: 109 entries in
  // the header, the rest chained through sectors of their own
  const fatSectors = [];
  for (let i = 0; i < 109; i++) {
    const s = v.getUint32(76 + i * 4, true);
    if (s > 0xfffffffa) break;
    fatSectors.push(s);
  }
  let difat = v.getUint32(68, true);
  for (let guard = 0; difat <= 0xfffffffa && guard < 1000; guard++) {
    const base = sectorAt(difat);
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) {
      const s = v.getUint32(base + i * 4, true);
      if (s > 0xfffffffa) break;
      fatSectors.push(s);
    }
    difat = v.getUint32(base + per * 4, true);
  }
  const fat = [];
  for (const s of fatSectors) {
    const base = sectorAt(s);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(v.getUint32(base + i * 4, true));
  }
  const miniFat = [];
  for (let s = v.getUint32(60, true), guard = 0; s <= 0xfffffffa && guard < 100000; s = fat[s], guard++) {
    const base = sectorAt(s);
    for (let i = 0; i < sectorSize / 4; i++) miniFat.push(v.getUint32(base + i * 4, true));
  }

  function chain(start, table) {
    const out = [];
    for (let s = start, guard = 0; s <= 0xfffffffa && guard < 1000000; s = table[s], guard++) out.push(s);
    return out;
  }
  const bytes = new Uint8Array(buf);
  function gather(sectors, size, src, unit, base) {
    const out = new Uint8Array(size);
    let at = 0;
    for (const s of sectors) {
      if (at >= size) break;
      const n = Math.min(unit, size - at);
      out.set(src.subarray(base(s), base(s) + n), at);
      at += n;
    }
    return out;
  }

  // The directory is an array of fixed slots, indexed by the sibling and child
  // ids below, so unused slots have to keep their place.
  const entries = [];
  for (const s of chain(v.getUint32(48, true), fat)) {
    for (let i = 0; i < sectorSize / 128; i++) {
      const at = sectorAt(s) + i * 128;
      const len = v.getUint16(at + 64, true);
      let name = '';
      for (let c = 0; c < Math.max(0, len / 2 - 1); c++) name += String.fromCharCode(v.getUint16(at + c * 2, true));
      entries.push({
        name, type: v.getUint8(at + 66),
        left: v.getUint32(at + 68, true), right: v.getUint32(at + 72, true), child: v.getUint32(at + 76, true),
        start: v.getUint32(at + 116, true), size: v.getUint32(at + 120, true),
      });
    }
  }
  const root = entries[0];
  if (!root || root.type !== 5) return null;

  // Only the root's own children are the document's streams. A .doc holding an
  // embedded Word object has a second WordDocument and 1Table further down,
  // under the object's storage, and pairing one document's text with another's
  // piece table reads as corruption.
  const top = new Map();
  for (const stack = [root.child]; stack.length;) {
    const id = stack.pop();
    if (id > 0xfffffffa || id >= entries.length) continue;
    const e = entries[id];
    if (!top.has(e.name)) top.set(e.name, e);
    stack.push(e.left, e.right);
  }
  // streams under the cutoff are not given sectors of their own: they live
  // packed inside the root entry's stream, chained through a FAT of their own
  const miniStore = root.size ? gather(chain(root.start, fat), root.size, bytes, sectorSize, sectorAt) : new Uint8Array(0);


  return {
    read(name) {
      const e = top.get(name);
      if (!e || e.type !== 2 || !e.size) return null;
      const from = e.size < cutoff
        ? gather(chain(e.start, miniFat), e.size, miniStore, miniSize, s => s * miniSize)
        : gather(chain(e.start, fat), e.size, bytes, sectorSize, sectorAt);
      return from.buffer.slice(0, e.size);
    },
  };
}

// --- the piece table -------------------------------------------------------

// Word stores latin-only stretches as one byte per character, in cp1252, and
// flags them by a bit in the offset. Only the 0x80-0x9F range differs from
// latin-1, and none of it appears in Japanese, so map just that window.
const CP1252_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

function decodePiece(doc, fc, cch) {
  const compressed = (fc & 0x40000000) !== 0;
  const at = compressed ? (fc & 0x3fffffff) / 2 : fc & 0x3fffffff;
  const v = new DataView(doc);
  let s = '';
  if (compressed) {
    for (let i = 0; i < cch && at + i < doc.byteLength; i++) {
      const b = v.getUint8(at + i);
      s += b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b);
    }
  } else {
    for (let i = 0; i < cch && at + i * 2 + 1 < doc.byteLength; i++) s += String.fromCharCode(v.getUint16(at + i * 2, true));
  }
  return s;
}

// Word's in-band control characters. A field (a page number, a table of
// contents) is stored as its code followed by its result, separated by 0x14;
// keep the result and drop the code, which is what the reader sees on paper.
function stripControls(raw) {
  let out = '';
  let inFieldCode = false;
  for (const ch of raw) {
    const c = ch.charCodeAt(0);
    if (c === 0x13) { inFieldCode = true; continue; }
    if (c === 0x14) { inFieldCode = false; continue; }
    if (c === 0x15) continue;
    if (inFieldCode) continue;
    if (c === 0x07 || c === 0x0b || c === 0x0c || c === 0x0d) { out += '\n'; continue; } // cell, line, page, paragraph
    if (c === 0xa0) { out += ' '; continue; }
    if (c === 0x1e) { out += '-'; continue; }
    if (c < 0x20 || c === 0x1f) continue; // pictures, footnote marks, optional hyphens
    out += ch;
  }
  return out;
}

// .doc bytes -> the document text, or null if this is not a .doc at all.
// A binary format read from a file picker gets a belt as well as braces: a
// truncated or unusual file should come back empty-handed, not throw.
export function docText(buf) {
  try {
    return readDoc(buf);
  } catch {
    return null;
  }
}

function readDoc(buf) {
  const cfb = readCfb(buf);
  if (!cfb) return null;
  const doc = cfb.read('WordDocument');
  if (!doc) return null;
  const v = new DataView(doc);
  if (v.getUint16(0, true) !== 0xa5ec) return null;

  const flags = v.getUint16(0x0a, true);
  const table = cfb.read(flags & 0x0200 ? '1Table' : '0Table');
  const ccpText = v.getUint32(76, true); // FibRgLw97.ccpText: the main document
  const fcClx = v.getUint32(0x01a2, true);
  const lcbClx = v.getUint32(0x01a6, true);
  if (!table || !lcbClx) return null;

  // the Clx is a run of formatting blobs followed by the piece table itself
  const t = new DataView(table);
  let at = fcClx;
  const end = fcClx + lcbClx;
  while (at < end && t.getUint8(at) === 1) at += 3 + t.getUint16(at + 1, true);
  if (at >= end || t.getUint8(at) !== 2) return null;
  const lcbPlc = t.getUint32(at + 1, true);
  const plc = at + 5;
  const pieces = Math.floor((lcbPlc - 4) / 12);

  let raw = '';
  for (let i = 0; i < pieces; i++) {
    const cpStart = t.getUint32(plc + i * 4, true);
    const cpEnd = t.getUint32(plc + (i + 1) * 4, true);
    const pcd = plc + (pieces + 1) * 4 + i * 8;
    raw += decodePiece(doc, t.getUint32(pcd + 2, true), cpEnd - cpStart);
  }
  return stripControls(raw.slice(0, ccpText || undefined));
}
