// Reading a line of Japanese with PP-OCRv6_manga.
//
// A recognizer, not a page reader: it is given one line of writing already cut
// out (see textLines.js) and returns the characters on it. The model is the
// manga fine-tune of PP-OCRv6's small recognizer, which is trained on Japanese
// as it is actually set on a page, vertical writing included, and is a fraction
// of the size of the general-purpose models.
//
// Vertical writing is laid on its side before being read, which is what the
// model expects: PaddleOCR turns any crop taller than it is wide a quarter turn
// anticlockwise, and its training data was prepared the same way.
//
// The output is a CTC lattice: one distribution per slice of the line, where
// slot 0 means "nothing here". Reading it back is the standard greedy collapse,
// dropping blanks and runs of the same character.

const MODEL = 'assets/ppocr/rec.onnx.gz';
const DICT = 'assets/ppocr/dict.txt';
const HEIGHT = 48; // the line height the model was trained at
const MIN_WIDTH = 16;
const MAX_WIDTH = 3000; // a very long line is split rather than squeezed

let runtime = null; // promise: the onnx runtime, loaded on first use
function loadRuntime() {
  if (!runtime) {
    runtime = import('../vendor/onnx/ort.wasm.bundle.min.mjs').then(ort => {
      // an absolute URL: the runtime imports its own glue as a module, and a
      // bare path would be read as a package name
      ort.env.wasm.wasmPaths = new URL('../vendor/onnx/', import.meta.url).href;
      ort.env.wasm.numThreads = 1; // no cross-origin isolation on a static host
      return ort;
    });
  }
  return runtime;
}

let model = null; // promise: { ort, session, vocab }
function loadModel() {
  if (!model) {
    model = (async () => {
      const ort = await loadRuntime();
      const [bytes, dict] = await Promise.all([
        fetch(MODEL).then(r => r.arrayBuffer()).then(gunzip),
        fetch(DICT).then(r => r.text()),
      ]);
      const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
      // slot 0 is the CTC blank, and PaddleOCR appends a space after the file
      const vocab = ['', ...dict.split('\n').map(line => line.replace(/[\r\n]+$/, '')), ' '];
      return { ort, session, vocab };
    })();
  }
  return model;
}

async function gunzip(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// a line of writing -> the tensor the model reads: on its side if it stands up,
// scaled to the height it was trained at
function lineTensor(ort, line) {
  const upright = line.height > line.width;
  const w0 = upright ? line.height : line.width;
  const h0 = upright ? line.width : line.height;
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(HEIGHT * w0 / h0)));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, HEIGHT);
  if (upright) {
    // a quarter turn anticlockwise puts the first character on the left
    ctx.translate(0, HEIGHT);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(line, 0, 0, HEIGHT, width);
  } else {
    ctx.drawImage(line, 0, 0, width, HEIGHT);
  }
  const px = ctx.getImageData(0, 0, width, HEIGHT).data;
  const plane = HEIGHT * width;
  const data = new Float32Array(3 * plane);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // the model was trained on BGR, the order OpenCV reads a file in
      data[0 * plane + y * width + x] = (px[i + 2] / 255 - 0.5) / 0.5;
      data[1 * plane + y * width + x] = (px[i + 1] / 255 - 0.5) / 0.5;
      data[2 * plane + y * width + x] = (px[i] / 255 - 0.5) / 0.5;
    }
  }
  return new ort.Tensor('float32', data, [1, 3, HEIGHT, width]);
}

function collapse(logits, dims, vocab) {
  const [, steps, symbols] = dims;
  let text = '';
  let previous = -1;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let score = -Infinity;
    const row = t * symbols;
    for (let s = 0; s < symbols; s++) {
      if (logits[row + s] > score) { score = logits[row + s]; best = s; }
    }
    if (best !== 0 && best !== previous) text += vocab[best] ?? '';
    previous = best;
  }
  return text;
}

// lines (canvases) -> the text of each, in the order given
export async function readLines(lines, onProgress = () => {}) {
  const { ort, session, vocab } = await loadModel();
  const input = session.inputNames[0];
  const output = session.outputNames[0];
  const out = [];
  for (const [i, line] of lines.entries()) {
    onProgress(Math.round((i / lines.length) * 100));
    const result = await session.run({ [input]: lineTensor(ort, line) });
    const logits = result[output];
    out.push(collapse(logits.data, logits.dims, vocab));
  }
  onProgress(100);
  return out;
}

// so a caller can pay the loading cost when it suits, and know whether the
// recognizer is available at all before planning around it
export async function ready() {
  try {
    await loadModel();
    return true;
  } catch (e) {
    console.error('the recognizer could not be loaded', e);
    model = null;
    return false;
  }
}
