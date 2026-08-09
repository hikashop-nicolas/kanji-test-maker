// Generates the PWA icons from inline SVG (no drawing tool in the loop).
// Needs rsvg-convert (brew install librsvg). Run: node tools/gen-icons.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'assets/icons';
mkdirSync(OUT, { recursive: true });

// What the app is for, in two marks: a kanji and the empty square to write it
// in. `shrink` pulls the marks towards the centre for the maskable icon, whose
// edges a launcher may crop to a circle.
function svg(shrink = 1) {
  const at = (v) => (256 + (v - 256) * shrink).toFixed(1);
  const sz = (v) => (v * shrink).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#3a7bd5"/>
  <text x="256" y="${at(172)}" font-family="Hiragino Mincho ProN, serif" font-size="${sz(215)}"
        fill="#ffffff" text-anchor="middle" dominant-baseline="central">字</text>
  <rect x="${at(176)}" y="${at(292)}" width="${sz(160)}" height="${sz(160)}" rx="${sz(12)}"
        fill="none" stroke="#ffffff" stroke-width="${sz(20)}"/>
</svg>`;
}

function png(source, out, size) {
  const tmp = join(OUT, '.tmp.svg');
  writeFileSync(tmp, source);
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', join(OUT, out), tmp]);
  unlinkSync(tmp);
  console.log(`${OUT}/${out}  ${size}x${size}`);
}

png(svg(), 'icon-192.png', 192);
png(svg(), 'icon-512.png', 512);
png(svg(0.8), 'icon-maskable-512.png', 512);
png(svg(), 'favicon-32.png', 32);
writeFileSync(join(OUT, 'icon.svg'), svg());
console.log(`${OUT}/icon.svg`);
