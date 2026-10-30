import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = 'extension/vendor/tesseract';
mkdirSync(out, { recursive: true });

const files = [
  ['node_modules/tesseract.js/dist/tesseract.min.js', 'tesseract.min.js'],
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
  ['node_modules/@tesseract.js-data/ara/4.0.0_best_int/ara.traineddata.gz', 'ara.traineddata.gz'],
];
for (const name of ['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']) {
  files.push([`node_modules/tesseract.js-core/${name}.wasm.js`, `${name}.wasm.js`]);
}

for (const [from, to] of files) cpSync(from, join(out, to));
console.log(`Copied ${files.length} files to ${out}`);
