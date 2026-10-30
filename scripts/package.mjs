import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve('dist/screen-select.zip');
mkdirSync('dist', { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-q', out, '.', '-x', '.DS_Store', '-x', '*/.DS_Store'], { cwd: 'extension' });
console.log(`Wrote dist/screen-select.zip (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
