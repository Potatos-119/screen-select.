// Runs the real desktop app with a fake screen, fake AI services and no real Keychain, then drives it.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, clipboard, desktopCapturer, globalShortcut, nativeImage, shell, systemPreferences } from 'electron';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = '9333';
const TIME_LIMIT_MS = 150000;
const VISION_WAIT_MS = 60000;

setTimeout(() => {
  console.log('FAIL - the test ran out of time');
  app.exit(1);
}, TIME_LIMIT_MS);

const userData = mkdtempSync(join(tmpdir(), 'screen-select-desktop-'));
app.setPath('userData', userData);
app.commandLine.appendSwitch('use-mock-keychain');
app.commandLine.appendSwitch('remote-debugging-port', PORT);

const screenImage = nativeImage.createFromPath(join(HERE, '../fixtures/agent-frame.png'));
desktopCapturer.getSources = async () => [{ display_id: '', thumbnail: screenImage }];
systemPreferences.getMediaAccessStatus = () => 'granted';

let pressShortcut;
const shortcuts = [];
// These keys act as if another app already has them.
const TAKEN = 'Ctrl+Shift+T';
globalShortcut.register = (keys, callback) => {
  if (keys === TAKEN) return false;
  shortcuts.push(keys);
  pressShortcut = callback;
  return true;
};

// Stands in for the real startup list, so the test never changes what opens when this computer starts.
const login = { openAtLogin: false, saved: [] };
app.getLoginItemSettings = () => ({ openAtLogin: login.openAtLogin });
app.setLoginItemSettings = (settings) => {
  login.saved.push(settings);
  login.openAtLogin = settings.openAtLogin;
};

const opened = [];
shell.openExternal = async (url) => opened.push(url);

const requests = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, init);
  requests.push({ url: String(url), init });
  if (String(url).includes('translate.googleapis')) {
    return Response.json([[['ترجمة', 'text']]]);
  }
  const event = JSON.stringify({ choices: [{ delta: { content: 'An agent acts.' } }] });
  return new Response(`data: ${event}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
};

await import('../../desktop/main.mjs');

// Electron holds back `ready` until this file finishes, so the test can't wait for it at the top level.
app.whenReady().then(async () => {
  let failed = 0;
  async function check(name, fn) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL - ${name}\n  ${error.message}`);
    }
  }

  process.on('unhandledRejection', (error) => console.log('main error:', error));

  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });

  async function findPage(ending) {
    const target = await browser.waitForTarget((item) => item.url().includes(ending), { timeout: 15000 });
    return target.page();
  }

  const overlayWindow = () => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('overlay.html'));

  try {
    const page = await findPage('overlay.html');
    page.on('pageerror', (error) => console.log('page error:', error.message));
    page.on('console', (message) => console.log('page says:', message.text()));

    const inPanel = (fn, ...args) =>
      page.evaluate(
        (source, values) => {
          const root = document.querySelector('#screen-select-host').shadowRoot;
          return new Function('root', 'values', `return (${source})(root, ...values)`)(root, values);
        },
        fn.toString(),
        args,
      );
    const waitForPanel = (fn, ...args) =>
      page.waitForFunction(
        (source, values) => {
          const root = document.querySelector('#screen-select-host')?.shadowRoot;
          return root && new Function('root', 'values', `return (${source})(root, ...values)`)(root, values);
        },
        { timeout: 20000 },
        fn.toString(),
        args,
      );
    const click = (action) => inPanel((root, name) => root.querySelector(`[data-action="${name}"]`).click(), action);
    const statusIs = (pattern) => waitForPanel((root, source) => new RegExp(source).test(root.querySelector('.status').textContent), pattern);

    await page.evaluate(() => chrome.storage.sync.set({ lookChosen: true, briefModel: 'nvidia' }));

    async function openAndSelect() {
      pressShortcut();
      await page.waitForSelector('#screen-select-host');
      await page.waitForFunction(() => document.hasFocus());
      const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      await page.mouse.move(size.width * 0.05, size.height * 0.05);
      await page.mouse.down();
      await page.mouse.move(size.width * 0.95, size.height * 0.95, { steps: 5 });
      await page.mouse.up();
      await waitForPanel((root) => root.querySelector('.text').value.length > 0);
    }

    await check('the shortcut opens the box and the text is read', async () => {
      await openAndSelect();
      assert.equal(overlayWindow().isVisible(), true);
      const text = await inPanel((root) => root.querySelector('.text').value);
      console.log('  read:', JSON.stringify(text));
      assert.match(text, /perceives its environment/);
    });

    await check('Copy puts the text on the clipboard', async () => {
      await click('copy');
      await statusIs('^Copied');
      assert.match(await clipboard.readText(), /perceives its environment/);
    });

    await check('Copy image puts a picture on the clipboard', async () => {
      await click('copy-image');
      await statusIs('^Image copied');
      assert.equal(await clipboard.has('image/png'), true);
    });

    await check('Translate works without a key', async () => {
      await click('translate');
      await statusIs('Translated with Google');
      assert.match(await inPanel((root) => root.querySelector('.translation').textContent), /ترجمة/);
    });

    await check('Brief with no key uses the free shared AI', async () => {
      await click('brief');
      await waitForPanel((root) => root.querySelector('.turn-answer')?.textContent === 'An agent acts.');
      const call = requests.at(-1);
      assert.match(call.url, /workers\.dev/);
      assert.equal(call.init.headers.authorization, undefined);
      assert.equal(call.init.headers.origin, 'screen-select://app');
    });

    await check('Add a key opens settings above the selection, and the key is saved safely', async () => {
      await page.evaluate(() => chrome.runtime.sendMessage({ type: 'ss-settings' }));
      const settings = await findPage('options.html');
      await settings.waitForSelector('#nvidia-key');
      await settings.type('#nvidia-key', 'nvapi-test-key');
      await settings.click('#save-nvidia-key');
      await settings.waitForFunction(() => document.getElementById('nvidia-key-status').textContent === 'Saved.');
      const window = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes('options.html'));
      assert.equal(window.isAlwaysOnTop(), true);
      const onDisk = readFileSync(join(userData, 'settings.json'), 'utf8');
      assert.equal(onDisk.includes('nvapi-test-key'), false);
      window.close();
    });

    await check('Brief streams an answer and sends the saved key', async () => {
      await click('brief');
      await waitForPanel((root) => root.querySelector('.turn-answer')?.textContent === 'An agent acts.');
      const call = requests.at(-1);
      assert.match(call.url, /nvidia/);
      assert.match(call.init.headers.authorization, /nvapi-test-key/);
    });

    await check('a follow-up question keeps the conversation', async () => {
      await inPanel((root) => {
        root.querySelector('.question').value = 'Why?';
        root.querySelector('[data-action="brief"]').click();
      });
      await waitForPanel((root) => root.querySelectorAll('.turn-answer')[1]?.textContent);
      assert.match(requests.at(-1).init.body, /An agent acts/);
    });

    await check('the system voices are available to Read', async () => {
      const count = await page.evaluate(async () => {
        if (!speechSynthesis.getVoices().length) await new Promise((resolve) => setTimeout(resolve, 800));
        return speechSynthesis.getVoices().length;
      });
      assert.ok(count > 0);
    });

    await check('the Print look can load its fonts', async () => {
      const fonts = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'ss-fonts' }));
      assert.ok(fonts.latin.length > 100 && fonts.arabic.length > 100);
    });

    await check('History keeps the selection, translation and answers', async () => {
      await click('history');
      const settings = await findPage('options.html#history');
      await settings.waitForFunction(() => document.querySelectorAll('.history-entry').length === 1);
      const text = await settings.$eval('.history-entry', (entry) => entry.textContent);
      assert.match(text, /perceives/);
      assert.match(text, /An agent acts/);
      BrowserWindow.getAllWindows()
        .find((item) => item.webContents.getURL().includes('options.html'))
        .close();
    });

    await check('the shortcut can be changed in Settings, and keys in use are refused', async () => {
      await page.evaluate(() => chrome.runtime.sendMessage({ type: 'ss-settings' }));
      const settings = await findPage('options.html');
      await settings.waitForSelector('#shortcut');
      assert.equal(await settings.$eval('#shortcut', (box) => box.value), 'Alt+Shift+D');

      await settings.click('#shortcut');
      await settings.keyboard.down('Control');
      await settings.keyboard.down('Shift');
      await settings.keyboard.press('KeyT');
      await settings.keyboard.up('Shift');
      await settings.keyboard.up('Control');
      await settings.click('#save-shortcut');
      await settings.waitForFunction(() => /Another app/.test(document.getElementById('shortcut-status').textContent));

      await settings.click('#shortcut');
      await settings.keyboard.down('Control');
      await settings.keyboard.down('Shift');
      await settings.keyboard.press('KeyQ');
      await settings.keyboard.up('Shift');
      await settings.keyboard.up('Control');
      assert.equal(await settings.$eval('#shortcut', (box) => box.value), 'Ctrl+Shift+Q');
      await settings.click('#save-shortcut');
      await settings.waitForFunction(() => document.getElementById('shortcut-status').textContent === 'Saved.');
      assert.equal(shortcuts.at(-1), 'Ctrl+Shift+Q');
      assert.match(readFileSync(join(userData, 'settings.json'), 'utf8'), /"shortcut":"Ctrl\+Shift\+Q"/);

      await settings.click('#reset-shortcut');
      await settings.waitForFunction(() => document.getElementById('shortcut').value === 'Alt+Shift+D');
      assert.equal(shortcuts.at(-1), 'Alt+Shift+D');
      BrowserWindow.getAllWindows()
        .find((item) => item.webContents.getURL().includes('options.html'))
        .close();
    });

    await check('Open when the computer starts can be turned on and off', async () => {
      await page.evaluate(() => chrome.runtime.sendMessage({ type: 'ss-settings' }));
      const settings = await findPage('options.html');
      await settings.waitForSelector('#open-at-login');
      assert.equal(await settings.$eval('#open-at-login', (box) => box.checked), false);

      await settings.click('#open-at-login');
      await settings.waitForFunction(() => document.getElementById('open-at-login-status').textContent === 'Saved.');
      assert.equal(login.saved.at(-1).openAtLogin, true);
      if (process.platform === 'win32') assert.equal(login.saved.at(-1).path, process.execPath);

      await settings.click('#open-at-login');
      await settings.waitForFunction(() => !document.getElementById('open-at-login').checked);
      assert.equal(login.saved.at(-1).openAtLogin, false);
      BrowserWindow.getAllWindows()
        .find((item) => item.webContents.getURL().includes('options.html'))
        .close();
    });

    await check('Esc closes the selection and hides the window', async () => {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog'));
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(overlayWindow().isVisible(), false);
    });

    await check('Search opens the browser and gets out of the way', async () => {
      await openAndSelect();
      await click('search');
      await page.waitForFunction(() => !document.querySelector('dialog'));
      assert.match(opened.at(-1), /^https:\/\/www\.google\.com\/search/);
    });

    await check('a second press of the shortcut closes the selection', async () => {
      pressShortcut();
      await page.waitForSelector('#screen-select-host');
      await new Promise((resolve) => setTimeout(resolve, 200));
      pressShortcut();
      await page.waitForFunction(() => !document.querySelector('dialog'));
    });

    // Windows reads with Tesseract only, so this one is for a Mac.
    if (process.platform === 'darwin') await check('Apple Vision takes over once it has loaded', async () => {
      const deadline = Date.now() + VISION_WAIT_MS;
      let text = '';
      while (Date.now() < deadline && !text.includes('Copy to clipboard')) {
        await openAndSelect();
        text = await inPanel((root) => root.querySelector('.text').value);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('dialog'));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      console.log('  read:', JSON.stringify(text));
      assert.match(text, /and acts upon that environment/);
      assert.match(text, /Copy to clipboard/);
    });
  } catch (error) {
    failed += 1;
    console.log(`FAIL - the test stopped early\n  ${error.message}`);
  } finally {
    await browser.disconnect();
    // Windows keeps the folder locked while the app is still open, and the system cleans it later.
    try {
      rmSync(userData, { recursive: true, force: true });
    } catch {}
    console.log(failed ? `${failed} failed` : 'all passed');
    app.exit(failed ? 1 : 0);
  }
});
