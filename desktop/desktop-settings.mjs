// Adds the desktop app's own settings: a Shortcut box, and whether it opens when the computer starts.
import { DEFAULT_SHORTCUT, shortcutFromKeys, shortcutLabel } from './shortcut.mjs';

const { shortcut: saved, isMac, works } = await desktop.getShortcut();
const defaultLabel = shortcutLabel(DEFAULT_SHORTCUT, isMac);
const example = isMac ? 'Cmd+Shift+Q' : 'Ctrl+Shift+Q';

const section = document.createElement('fieldset');
section.id = 'shortcut-setting';
section.innerHTML = `
  <legend>Shortcut</legend>
  <input id="shortcut" type="search" readonly spellcheck="false" aria-label="Shortcut" />
  <button id="save-shortcut" type="button">Save shortcut</button>
  <button class="quiet" id="reset-shortcut" type="button"></button>
  <small id="shortcut-status" role="status"></small>
  <small>Click the box and press the keys you want, like ${example}. It opens the selection from any app.</small>`;
document.querySelector('main fieldset').after(section);

const box = section.querySelector('#shortcut');
const status = section.querySelector('#shortcut-status');
const reset = section.querySelector('#reset-shortcut');
let current = saved;
let chosen = saved;

reset.textContent = `Use ${defaultLabel}`;
box.value = shortcutLabel(current, isMac);
if (!works) status.textContent = `Another app is using ${box.value}. Pick other keys.`;

box.addEventListener('focus', () => {
  desktop.pauseShortcut(true);
  box.placeholder = 'Press the new keys';
});
box.addEventListener('blur', () => {
  desktop.pauseShortcut(false);
  box.placeholder = '';
});

box.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') return;
  event.preventDefault();
  if (event.key === 'Escape') {
    chosen = current;
    box.value = shortcutLabel(current, isMac);
    status.textContent = '';
    box.blur();
    return;
  }
  const keys = shortcutFromKeys(event, isMac);
  if (!keys) {
    status.textContent = `Hold ${isMac ? 'Cmd or Option' : 'Ctrl or Alt'} with another key.`;
    return;
  }
  chosen = keys;
  box.value = shortcutLabel(keys, isMac);
  status.textContent = 'Press Save shortcut to use it.';
});

async function save(keys) {
  const result = await desktop.setShortcut(keys);
  if (result.error) {
    status.textContent = result.error;
    return;
  }
  current = chosen = result.shortcut;
  box.value = shortcutLabel(current, isMac);
  status.textContent = 'Saved.';
}

section.querySelector('#save-shortcut').addEventListener('click', () => save(chosen));
reset.addEventListener('click', () => {
  chosen = DEFAULT_SHORTCUT;
  return save(DEFAULT_SHORTCUT);
});

// It lives in the tray or the menu bar, so opening at sign in keeps the shortcut ready all day.
const startup = document.createElement('fieldset');
startup.id = 'startup-setting';
startup.innerHTML = `
  <legend>Startup</legend>
  <label><input type="checkbox" id="open-at-login" /> ${isMac ? 'Open at login' : 'Open when Windows starts'}</label>
  <small id="open-at-login-status" role="status"></small>
  <small>It starts quietly in the ${isMac ? 'menu bar' : 'tray'}, ready for your shortcut.</small>`;
section.after(startup);

const openAtLogin = startup.querySelector('#open-at-login');
const startupStatus = startup.querySelector('#open-at-login-status');
openAtLogin.checked = await desktop.opensAtLogin();
openAtLogin.addEventListener('change', async () => {
  const wanted = openAtLogin.checked;
  openAtLogin.checked = await desktop.setOpenAtLogin(wanted);
  if (openAtLogin.checked === wanted) startupStatus.textContent = 'Saved.';
  else startupStatus.textContent = isMac ? 'Turn it on in System Settings, General, Login Items.' : 'Turn it on in Task Manager, Startup apps.';
});
