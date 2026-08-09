// Generates the PWA icons from inline SVG (no drawing tool in the loop).
// Needs rsvg-convert (brew install librsvg). Run: node tools/gen-icons.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'assets/icons';
mkdirSync(OUT, { recursive: true });

// A vertical-writing worksheet: ruled columns, a kanji, and the answer boxes
// under it. `inset` pulls the sheet in for the maskable icon, whose corners a
// launcher may crop.
function svg(inset = 0) {
  const k = 1 - inset;
  const at = (v) => (256 + (v - 256) * k).toFixed(1);
  const sz = (v) => (v * k).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#3a7bd5"/>
  <rect x="${at(86)}" y="${at(66)}" width="${sz(340)}" height="${sz(380)}" rx="${sz(20)}" fill="#ffffff"/>
  <g stroke="#ccd6e5" stroke-width="${sz(6)}">
    <line x1="${at(199)}" y1="${at(96)}" x2="${at(199)}" y2="${at(416)}"/>
    <line x1="${at(313)}" y1="${at(96)}" x2="${at(313)}" y2="${at(416)}"/>
  </g>
  <text x="${at(369)}" y="${at(168)}" font-family="Hiragino Mincho ProN, serif" font-size="${sz(104)}"
        fill="#1f3a63" text-anchor="middle" dominant-baseline="central">字</text>
  <rect x="${at(325)}" y="${at(240)}" width="${sz(89)}" height="${sz(89)}" rx="${sz(6)}" fill="none" stroke="#3a7bd5" stroke-width="${sz(11)}"/>
  <rect x="${at(325)}" y="${at(345)}" width="${sz(89)}" height="${sz(89)}" rx="${sz(6)}" fill="none" stroke="#3a7bd5" stroke-width="${sz(11)}"/>
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
// maskable: the launcher may crop to a circle, so keep the sheet inside the safe area
png(svg(0.18), 'icon-maskable-512.png', 512);
png(svg(), 'favicon-32.png', 32);
writeFileSync(join(OUT, 'icon.svg'), svg());
console.log(`${OUT}/icon.svg`);
