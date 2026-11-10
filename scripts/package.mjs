// Zips the extension folder for the Chrome Web Store and Microsoft Edge Add-ons.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const { version } = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
const out = resolve(`dist/screen-select-${version}.zip`);
mkdirSync('dist', { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-qr', out, '.', '-x', '*.DS_Store'], { cwd: 'extension', stdio: 'inherit' });
console.log(`Made ${out}`);
