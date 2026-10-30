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

const fontsOut = 'extension/fonts';
mkdirSync(fontsOut, { recursive: true });
const fonts = [
  ['node_modules/@fontsource/caveat/files/caveat-latin-500-normal.woff2', 'caveat.woff2'],
  ['node_modules/@fontsource/aref-ruqaa/files/aref-ruqaa-arabic-400-normal.woff2', 'aref-ruqaa.woff2'],
];
for (const [from, to] of fonts) cpSync(from, join(fontsOut, to));
console.log(`Copied ${files.length + fonts.length} files`);
