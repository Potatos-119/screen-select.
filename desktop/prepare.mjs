// Copies the extension in, so the packaged app carries it, and builds the Vision helper on a Mac.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('extension', { recursive: true, force: true });
cpSync('../extension', 'extension', { recursive: true });

const optionsPath = 'extension/options.html';
const options = readFileSync(optionsPath, 'utf8')
  .replace('It is stored only in this browser profile.', 'It is stored only on this computer.')
  .replace('Saved only in this browser, up to', 'Saved only on this computer, up to');
writeFileSync(optionsPath, options);

mkdirSync('bin', { recursive: true });
if (process.platform === 'darwin') {
  // The icon in the extension is too small for an app, so it gets enlarged.
  execFileSync('sips', ['-z', '1024', '1024', '../extension/icons/icon128.png', '--out', 'bin/icon.png'], { stdio: 'ignore' });
  execFileSync('swiftc', ['-O', 'native/vision-ocr.swift', '-o', 'bin/vision-ocr'], { stdio: 'inherit' });
}
