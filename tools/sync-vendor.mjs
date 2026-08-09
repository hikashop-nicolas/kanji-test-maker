// Refreshes the committed copies of the npm packages the app loads directly.
// There is no bundler here: the browser loads vendor/*.js and assets/dict/, so
// bumping a package in package.json changes nothing until these are recopied.
//
//   node tools/sync-vendor.mjs          copy, reporting what changed
//   node tools/sync-vendor.mjs --check  report only, exit 1 if anything is stale
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');

// package file -> committed copy. A major version that moves any of these paths
// fails loudly rather than silently leaving the old copy in place.
const FILES = [
  ['node_modules/jszip/dist/jszip.min.js', 'vendor/jszip.min.js'],
  ['node_modules/kuromoji/build/kuromoji.js', 'vendor/kuromoji.js'],
  ['node_modules/docx/dist/index.umd.cjs', 'vendor/docx.umd.js'],
  ['node_modules/tesseract.js/dist/tesseract.min.js', 'vendor/tesseract/tesseract.min.js'],
  ['node_modules/tesseract.js/dist/tesseract.min.js.LICENSE.txt', 'vendor/tesseract/tesseract.min.js.LICENSE.txt'],
  ['node_modules/tesseract.js/dist/worker.min.js', 'vendor/tesseract/worker.min.js'],
  ['node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt', 'vendor/tesseract/worker.min.js.LICENSE.txt'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/LICENSE', 'vendor/tesseract/CORE-LICENSE.txt'],
];
// the kuromoji dictionary, copied whole
const DIRS = [['node_modules/kuromoji/dict', 'assets/dict', /\.gz$/]];

const stale = [];
const missing = [];

function compare(from, to) {
  const src = join(root, from), dst = join(root, to);
  if (!existsSync(src)) { missing.push(from); return; }
  const bytes = readFileSync(src);
  if (existsSync(dst) && readFileSync(dst).equals(bytes)) return;
  stale.push(to);
  if (!check) {
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, bytes);
  }
}

for (const [from, to] of FILES) compare(from, to);
for (const [from, to, match] of DIRS) {
  const dir = join(root, from);
  if (!existsSync(dir)) { missing.push(from); continue; }
  for (const name of readdirSync(dir)) if (match.test(name)) compare(`${from}/${name}`, `${to}/${name}`);
}

if (missing.length) {
  console.error('These files are not where they used to be in the installed packages:');
  for (const m of missing) console.error('  ' + m);
  console.error('\nA package probably moved them in a major release. Fix the paths in');
  console.error('tools/sync-vendor.mjs, then run it again.');
  process.exit(1);
}

if (!stale.length) {
  console.log('vendor/ and assets/dict/ match the installed packages.');
  process.exit(0);
}

if (check) {
  console.error('These committed copies are out of date:');
  for (const f of stale) console.error('  ' + f);
  console.error('\nThe app loads these directly, so the bump does not reach it until they are');
  console.error('refreshed. Run `npm run vendor` and commit the result.');
  process.exit(1);
}

console.log(`updated ${stale.length} file(s):`);
for (const f of stale) console.log('  ' + f);
