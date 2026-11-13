import { readFileSync, renameSync, writeFileSync } from 'node:fs';

const SECRET_KEYS = new Set(['nvidiaKey', 'geminiKey', 'apiKey']);

// Answers the three ways chrome.storage.get can be called.
function pick(values, keys) {
  if (keys == null) return { ...values };
  if (typeof keys === 'string') keys = [keys];
  const defaults = Array.isArray(keys) ? {} : keys;
  const names = Array.isArray(keys) ? keys : Object.keys(keys);
  const found = { ...defaults };
  for (const name of names) {
    if (name in values) found[name] = values[name];
  }
  return found;
}

function readFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

// `secrets` encrypts the API keys, so the file on disk never holds them as plain text.
export function createStore({ path, secrets, onChanged = () => {} }) {
  const saved = readFile(path);
  const data = { sync: saved.sync ?? {}, local: saved.local ?? {} };

  const save = () => {
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
    renameSync(temporary, path);
  };

  const reveal = async (values) => {
    const plain = { ...values };
    for (const name of SECRET_KEYS) {
      if (name in plain) plain[name] = await secrets.decrypt(plain[name]);
    }
    return plain;
  };

  const area = (name) => ({
    async get(keys) {
      return pick(await reveal(data[name]), keys);
    },
    async set(values) {
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        data[name][key] = SECRET_KEYS.has(key) ? await secrets.encrypt(value) : value;
        changes[key] = { newValue: SECRET_KEYS.has(key) ? undefined : value };
      }
      save();
      onChanged(changes, name);
    },
    async remove(keys) {
      const changes = {};
      for (const key of [keys].flat()) {
        delete data[name][key];
        changes[key] = {};
      }
      save();
      onChanged(changes, name);
    },
  });

  return { sync: area('sync'), local: area('local') };
}
