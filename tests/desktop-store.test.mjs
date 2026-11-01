import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../desktop/store.mjs';

const secrets = {
  encrypt: (value) => `locked:${value}`,
  decrypt: (value) => value.replace('locked:', ''),
};

function tempPath() {
  return join(mkdtempSync(join(tmpdir(), 'screen-select-store-')), 'settings.json');
}

test('get answers a name, a list, defaults and nothing', async () => {
  const { sync } = createStore({ path: tempPath(), secrets });
  await sync.set({ theme: 'mac', askTarget: 'chatgpt' });
  assert.deepEqual(await sync.get('theme'), { theme: 'mac' });
  assert.deepEqual(await sync.get(['theme', 'missing']), { theme: 'mac' });
  assert.deepEqual(await sync.get({ keepHistory: true, theme: 'linux' }), { keepHistory: true, theme: 'mac' });
  assert.deepEqual(await sync.get(), { theme: 'mac', askTarget: 'chatgpt' });
});

test('settings survive a restart', async () => {
  const path = tempPath();
  await createStore({ path, secrets }).local.set({ glossary: 'a = b' });
  assert.deepEqual(await createStore({ path, secrets }).local.get('glossary'), { glossary: 'a = b' });
});

test('a broken settings file starts empty instead of crashing', async () => {
  const path = tempPath();
  await createStore({ path, secrets }).sync.set({ theme: 'mac' });
  const broken = readFileSync(path, 'utf8').slice(0, 5);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, broken);
  assert.deepEqual(await createStore({ path, secrets }).sync.get(), {});
});

test('API keys are encrypted on disk but plain when read', async () => {
  const path = tempPath();
  const { local } = createStore({ path, secrets });
  await local.set({ nvidiaKey: 'nvapi-secret', glossary: 'x = y' });
  const onDisk = readFileSync(path, 'utf8');
  assert.match(onDisk, /locked:nvapi-secret/);
  assert.match(onDisk, /x = y/);
  assert.deepEqual(await local.get('nvidiaKey'), { nvidiaKey: 'nvapi-secret' });
});

test('only the owner can read the file', async () => {
  const path = tempPath();
  await createStore({ path, secrets }).local.set({ glossary: '' });
  assert.equal(statSync(path).mode & 0o077, 0);
});

test('changes are announced without revealing keys', async () => {
  const seen = [];
  const { local } = createStore({ path: tempPath(), secrets, onChanged: (changes, area) => seen.push([changes, area]) });
  await local.set({ apiKey: 'sk-secret', history: [1] });
  await local.remove('history');
  assert.deepEqual(seen[0], [{ apiKey: { newValue: undefined }, history: { newValue: [1] } }, 'local']);
  assert.deepEqual(seen[1], [{ history: {} }, 'local']);
});
