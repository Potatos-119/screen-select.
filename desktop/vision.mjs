import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// A small white PNG, only used to get Vision loaded. Vision refuses anything under 3 pixels.
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAAAAABWESUoAAAAFklEQVR42mP4TwAwjCoYVTCqYKQqAAA/aPwuqUTQyAAAAABJRU5ErkJggg==',
  'base64',
);
const READ_TIMEOUT_MS = 15000;

function run(helper, image, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawn(helper, { stdio: ['pipe', 'pipe', 'pipe'], timeout });
    const output = [];
    const errors = [];
    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(output).toString('utf8').trim());
      else reject(new Error(Buffer.concat(errors).toString('utf8').trim() || 'Vision stopped'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(image);
  });
}

// The first run of a new helper can take 40 seconds, so Vision only takes over once that is done.
export function createVision(folder) {
  const helper = join(folder, 'vision-ocr');
  let ready = false;

  if (process.platform === 'darwin' && existsSync(helper)) {
    run(helper, BLANK_PNG, 0).then(
      () => {
        ready = true;
      },
      () => {},
    );
  }

  return {
    get ready() {
      return ready;
    },
    read(dataUrl) {
      return run(helper, Buffer.from(dataUrl.split(',')[1], 'base64'), READ_TIMEOUT_MS);
    },
  };
}
