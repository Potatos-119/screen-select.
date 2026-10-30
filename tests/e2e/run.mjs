import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const server = createServer((_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'self' 'unsafe-inline'; media-src blob: mediastream:",
  });
  res.end(readFileSync('tests/e2e/page.html'));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const PAGE_URL = `http://127.0.0.1:${server.address().port}/`;

const workDir = mkdtempSync(join(tmpdir(), 'screen-select-'));
const extDir = join(workDir, 'ext');
cpSync('extension', extDir, { recursive: true });
// Tests can't produce the user gesture activeTab needs, so this copy gets all sites.
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json')));
manifest.host_permissions = ['<all_urls>'];
writeFileSync(join(extDir, 'manifest.json'), JSON.stringify(manifest));

const browser = await puppeteer.launch({
  executablePath: BRAVE,
  headless: false,
  userDataDir: join(workDir, 'profile'),
  defaultViewport: null,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});

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

try {
  const swTarget = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('background.js'),
    { timeout: 15000 },
  );
  const sw = await swTarget.worker();

  await check('reads the video frame fixture', async () => {
    const png = readFileSync('tests/fixtures/agent-frame.png').toString('base64');
    const dataUrl = `data:image/png;base64,${png}`;
    const result = await sw.evaluate((url) => globalThis.__recognize(url), dataUrl);
    console.log('  read:', JSON.stringify(result));
    assert.match(result.text, /perceives its environment/);
    assert.match(result.text, /agent/);
    assert.match(result.text, /acts upon/);
  });

  const page = (await browser.pages())[0];

  async function activate() {
    await page.bringToFront();
    await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await globalThis.__activate(tab);
    });
  }

  const inShadow = (fn, ...args) =>
    page.evaluate(
      (source, ...rest) => {
        const root = document.querySelector('#screen-select-host')?.shadowRoot;
        return root ? new Function('root', '...args', source)(root, ...rest) : null;
      },
      `return (${fn})(root, ...args)`,
      ...args,
    );

  async function drag(selector) {
    const r = await page.$eval(selector, (el) => {
      const box = el.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    await page.mouse.move(r.x - 6, r.y - 6);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width + 6, r.y + r.height + 6, { steps: 4 });
    await page.mouse.up();
  }

  async function panelText() {
    await page.waitForFunction(
      () => {
        const root = document.querySelector('#screen-select-host')?.shadowRoot;
        return root?.querySelector('.panel')?.dataset.state === 'ready';
      },
      { timeout: 30000 },
    );
    return inShadow((root) => root.querySelector('.text').value);
  }

  const clickButton = (name) =>
    inShadow((root, action) => root.querySelector(`[data-action="${action}"]`).click(), name);
  const status = () => inShadow((root) => root.querySelector('.status').textContent);
  const hostCount = () => page.$$eval('#screen-select-host', (hosts) => hosts.length);
  const waitForTab = (prefix) =>
    browser.waitForTarget((t) => t.url().startsWith(prefix), { timeout: 10000 });

  async function reset() {
    await page.goto(PAGE_URL);
    await page.bringToFront();
  }

  await check('reads English text inside a dragged box', async () => {
    await reset();
    await activate();
    await drag('#english');
    assert.match(await panelText(), /Perception is the first step/);
    if (process.env.PANEL_SHOT) await page.screenshot({ path: process.env.PANEL_SHOT });
  });

  await check('frame is drawn under a strict content security policy', async () => {
    const blank = await inShadow((root) => {
      const canvas = root.querySelector('.frame');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels.every((value, index) => index % 4 === 3 || value === 0);
    });
    assert.equal(blank, false);
  });

  await check('typing in the panel stays out of the page', async () => {
    await inShadow((root) => root.querySelector('.text').focus());
    await page.keyboard.type(' k');
    assert.deepEqual(await page.evaluate(() => window.keysSeen), []);
    assert.match(await inShadow((root) => root.querySelector('.text').value), / k/);
  });

  await check('Copy reports success', async () => {
    await clickButton('copy');
    await page.waitForFunction(() => true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.match(await status(), /Copied/);
  });

  await check('Copy image reports a result', async () => {
    await clickButton('copy-image');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.match(await status(), /Image copied/);
  });

  await check('Translate shows Arabic for English text', async () => {
    await clickButton('translate');
    await page.waitForFunction(
      () => {
        const root = document.querySelector('#screen-select-host').shadowRoot;
        return root.querySelector('.translation').textContent.length > 0;
      },
      { timeout: 15000 },
    );
    const text = await inShadow((root) => root.querySelector('.translation').textContent);
    assert.match(text, /\p{Script=Arabic}/u);
  });

  await check('Translate opens Google Translate when the service fails', async () => {
    await sw.evaluate(() => {
      globalThis.__realFetch = globalThis.fetch;
      globalThis.fetch = () => Promise.reject(new Error('offline'));
    });
    await clickButton('translate');
    const target = await waitForTab('https://translate.google.com/');
    await sw.evaluate(() => {
      globalThis.fetch = globalThis.__realFetch;
    });
    await (await target.page())?.close();
    await page.bringToFront();
  });

  await check('Ask opens Claude by default', async () => {
    await clickButton('ask');
    const target = await waitForTab('https://claude.ai/');
    await (await target.page())?.close();
    await page.bringToFront();
  });

  await check('Search opens a new tab', async () => {
    const before = (await browser.pages()).length;
    await clickButton('search');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const pages = await browser.pages();
    assert.equal(pages.length, before + 1);
    await pages.at(-1).close();
    await page.bringToFront();
  });

  await check('Escape closes the overlay', async () => {
    await page.keyboard.press('Escape');
    assert.equal(await hostCount(), 0);
  });

  await check('reads Arabic text', async () => {
    await reset();
    await activate();
    await drag('#arabic');
    const text = await panelText();
    console.log('  read:', JSON.stringify(text));
    assert.match(text, /مرحبا/);
  });

  await check('reads a playing video and resumes only what it paused', async () => {
    await reset();
    await page.waitForFunction(() => document.querySelector('#playing').currentTime > 0.2);
    await activate();
    assert.equal(await page.$eval('#playing', (v) => v.paused), true);
    await drag('#playing');
    assert.match(await panelText(), /Moving picture words/);
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#playing', (v) => v.paused), false);
    assert.equal(await page.$eval('#paused', (v) => v.paused), true);
  });

  await check('works over a fullscreen video', async () => {
    await reset();
    await page.evaluate(() => {
      document.querySelector('#playing').addEventListener('click', (event) => event.target.requestFullscreen());
    });
    await page.click('#playing');
    await page.waitForFunction(() => document.fullscreenElement !== null);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await activate();
    const onTop = await page.evaluate(
      () => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.id,
    );
    assert.equal(onTop, 'screen-select-host');
    const size = await page.evaluate(() => [innerWidth, innerHeight]);
    await page.mouse.move(10, 10);
    await page.mouse.down();
    await page.mouse.move(size[0] - 10, size[1] - 10, { steps: 4 });
    await page.mouse.up();
    assert.match(await panelText(), /Moving picture words/);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  const setTheme = (theme) =>
    sw.evaluate((value) => chrome.storage.sync.set({ theme: value }), theme);
  const hostTheme = () =>
    page.$eval('#screen-select-host', (host) => host.dataset.theme);
  const isShown = (selector) =>
    inShadow((root, target) => getComputedStyle(root.querySelector(target)).display !== 'none', selector);
  const shot = async (name) => {
    if (process.env.THEME_SHOTS) await page.screenshot({ path: `${process.env.THEME_SHOTS}/${name}.png` });
  };

  await check('Basic is the default look, with no photo or handwriting', async () => {
    await sw.evaluate(() => chrome.storage.sync.remove('theme'));
    await reset();
    await activate();
    assert.equal(await hostTheme(), 'basic');
    await drag('#english');
    assert.match(await panelText(), /Perception is the first step/);
    assert.equal(await isShown('.photo'), false);
    assert.equal(await isShown('.titlebar'), false);
    assert.equal(await page.evaluate(() => [...document.fonts].some((f) => f.family.includes('Screen Select'))), false);
    await shot('basic');
    await page.keyboard.press('Escape');
  });

  await check('Mac shows a title bar and the selection size', async () => {
    await setTheme('mac');
    await reset();
    await activate();
    assert.equal(await hostTheme(), 'mac');
    await page.mouse.move(40, 30);
    await page.mouse.down();
    await page.mouse.move(340, 130, { steps: 4 });
    assert.equal(await isShown('.size'), true);
    assert.match(await inShadow((root) => root.querySelector('.size').textContent), /300 × 100/);
    await shot('mac-drag');
    await page.mouse.up();
    await panelText();
    assert.equal(await isShown('.titlebar'), true);
    assert.equal(await isShown('.photo'), false);
    await shot('mac');
  });

  await check('the Mac close button closes the overlay', async () => {
    await inShadow((root) => root.querySelector('.close').click());
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(await hostCount(), 0);
  });

  await check('the light versions keep their buttons on one row', async () => {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    for (const look of ['basic', 'mac']) {
      await setTheme(look);
      await reset();
      await activate();
      await drag('#english');
      await panelText();
      await new Promise((resolve) => setTimeout(resolve, 400));
      await shot(`${look}-light`);
      const rows = await inShadow((root) => {
        const tops = [...root.querySelectorAll('.actions button')].map((button) => button.getBoundingClientRect().top);
        return new Set(tops).size;
      });
      assert.equal(rows, 1);
      await page.keyboard.press('Escape');
    }
    await page.emulateMediaFeatures([]);
  });

  await check('Print keeps the photo and handwriting', async () => {
    await setTheme('print');
    await reset();
    await activate();
    assert.equal(await hostTheme(), 'print');
    await drag('#english');
    await panelText();
    assert.equal(await isShown('.photo'), true);
    await new Promise((resolve) => setTimeout(resolve, 1700));
    await shot('print');
    await page.keyboard.press('Escape');
  });

  await check('an unknown saved look falls back to Basic', async () => {
    await setTheme('nope');
    await reset();
    await activate();
    assert.equal(await hostTheme(), 'basic');
    await page.keyboard.press('Escape');
  });

  await check('choosing a look in settings saves it', async () => {
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
    await options.click('input[value="mac"]');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await options.$eval('html', (html) => html.dataset.theme), 'mac');
    if (process.env.THEME_SHOTS) await options.screenshot({ path: `${process.env.THEME_SHOTS}/options.png` });
    await options.close();
    assert.equal(await sw.evaluate(async () => (await chrome.storage.sync.get('theme')).theme), 'mac');
    await sw.evaluate(() => chrome.storage.sync.remove('theme'));
    await page.bringToFront();
  });

  await check('the handwriting fonts load under a strict content security policy', async () => {
    await setTheme('print');
    await reset();
    await activate();
    await page.waitForFunction(
      () => document.fonts.check('24px "Screen Select Hand"') && document.fonts.check('24px "Screen Select Hand Arabic"'),
      { timeout: 5000 },
    );
    const faces = await page.evaluate(() => [...document.fonts].map((face) => face.family));
    assert.ok(faces.some((name) => name.includes('Screen Select Hand')));
    await page.keyboard.press('Escape');
    await new Promise((resolve) => setTimeout(resolve, 200));
    const left = await page.evaluate(() => [...document.fonts].filter((face) => face.family.includes('Screen Select')).length);
    assert.equal(left, 0);
    await sw.evaluate(() => chrome.storage.sync.remove('theme'));
  });

  await check('a tiny drag keeps the overlay open without a panel', async () => {
    await reset();
    await activate();
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(102, 102);
    await page.mouse.up();
    assert.equal(await hostCount(), 1);
    assert.equal(await inShadow((root) => root.querySelector('.panel').hidden), true);
  });

  await check('activating again closes the overlay instead of stacking', async () => {
    await activate();
    assert.equal(await hostCount(), 0);
    await activate();
    assert.equal(await hostCount(), 1);
  });

  await check('a double press opens one overlay', async () => {
    await reset();
    await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await Promise.all([globalThis.__activate(tab), globalThis.__activate(tab)]);
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(await hostCount(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await hostCount(), 0);
  });

  await check('two reads at once both succeed on first use', async () => {
    const png = readFileSync('tests/fixtures/agent-frame.png').toString('base64');
    const results = await sw.evaluate(async (url) => {
      await chrome.offscreen.closeDocument();
      return Promise.all([globalThis.__recognize(url), globalThis.__recognize(url)]);
    }, `data:image/png;base64,${png}`);
    results.forEach((result) => assert.match(result.text ?? '', /agent/));
  });

  await check('the panel stays on screen when a translation grows it', async () => {
    await reset();
    await activate();
    await drag('#bottom');
    await panelText();
    await sw.evaluate(() => {
      globalThis.__realFetch = globalThis.fetch;
      const body = JSON.stringify([[['مرحبا\n'.repeat(80), 'x']]]);
      globalThis.fetch = async () => new Response(body);
    });
    await clickButton('translate');
    await new Promise((resolve) => setTimeout(resolve, 800));
    await sw.evaluate(() => {
      globalThis.fetch = globalThis.__realFetch;
    });
    const fits = await inShadow((root) => {
      const panel = root.querySelector('.panel').getBoundingClientRect();
      const button = root.querySelector('[data-action="ask"]').getBoundingClientRect();
      return panel.top >= 0 && panel.bottom <= innerHeight && button.bottom <= innerHeight;
    });
    assert.equal(fits, true);
  });

  await check('a right-click does not start a drag', async () => {
    await reset();
    await activate();
    await page.mouse.move(600, 200);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(800, 300, { steps: 3 });
    assert.equal(await inShadow((root) => root.querySelector('.box').hidden), true);
    await page.mouse.up({ button: 'right' });
    await page.keyboard.press('Escape');
  });

  await check('reads the same text with browser zoom at 150%', async () => {
    await reset();
    await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.setZoom(tab.id, 1.5);
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await activate();
    await drag('#english');
    assert.match(await panelText(), /Perception is the first step/);
    await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.setZoom(tab.id, 1);
    });
  });

  const stubBrief = (status, body) =>
    sw.evaluate(
      (code, json) => {
        globalThis.__realFetch ??= globalThis.fetch;
        globalThis.__briefCalls = [];
        globalThis.fetch = async (url, init) => {
          globalThis.__briefCalls.push({ url, init });
          return new Response(json, { status: code });
        };
      },
      status,
      JSON.stringify(body),
    );
  const clearKey = () => sw.evaluate(() => chrome.storage.local.remove('apiKey'));

  await check('Brief without a key opens settings and says why', async () => {
    await clearKey();
    await reset();
    await activate();
    await drag('#english');
    await panelText();
    await clickButton('brief');
    const target = await waitForTab(`chrome-extension://${new URL(sw.url()).host}/options.html`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.match(await status(), /API key/);
    await (await target.page())?.close();
    await page.bringToFront();
  });

  await check('the key saved in settings is used, and Brief shows the answer', async () => {
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
    await options.type('#api-key', 'test-key');
    await options.click('#save-key');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await options.$eval('#api-key', (input) => input.type), 'password');
    if (process.env.OPTIONS_SHOT) await options.screenshot({ path: process.env.OPTIONS_SHOT });
    await options.close();
    await page.bringToFront();

    await stubBrief(200, {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'A short brief.' }],
    });
    await clickButton('brief');
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.equal(
      await inShadow((root) => root.querySelector('.brief').textContent),
      'A short brief.',
    );
    const call = await sw.evaluate(() => globalThis.__briefCalls[0]);
    assert.equal(call.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(call.init.headers['x-api-key'], 'test-key');
    const body = JSON.parse(call.init.body);
    assert.equal(body.messages[0].content[0].type, 'image');
    assert.match(body.messages[0].content[1].text, /Perception is the first step/);
    if (process.env.BRIEF_SHOT) await page.screenshot({ path: process.env.BRIEF_SHOT });
  });

  await check('a wrong key shows a clear message', async () => {
    await stubBrief(401, { error: { message: 'invalid x-api-key' } });
    await clickButton('brief');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.match(await status(), /key/i);
  });

  await check('choosing Haiku changes the model', async () => {
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
    await options.click('input[value="haiku"]');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await options.close();
    await page.bringToFront();
    await stubBrief(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Short.' }] });
    await clickButton('brief');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const call = await sw.evaluate(() => globalThis.__briefCalls[0]);
    assert.equal(JSON.parse(call.init.body).model, 'claude-haiku-5-5');
    await sw.evaluate(() => {
      globalThis.fetch = globalThis.__realFetch;
    });
    await clearKey();
    await page.keyboard.press('Escape');
  });

  await check('Ask opens ChatGPT after changing the option', async () => {
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
    await options.click('input[value="chatgpt"]');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await options.close();
    await reset();
    await activate();
    await drag('#english');
    await panelText();
    await clickButton('ask');
    await waitForTab('https://chatgpt.com/');
  });

  await check('a restricted page shows the badge', async () => {
    const badge = await sw.evaluate(async () => {
      const tab = await chrome.tabs.create({ url: 'brave://settings' });
      await new Promise((resolve) => setTimeout(resolve, 800));
      await globalThis.__activate(tab);
      return chrome.action.getBadgeText({ tabId: tab.id });
    });
    assert.equal(badge, '!');
  });
} finally {
  server.close();
  await browser.close();
  rmSync(workDir, { recursive: true, force: true });
}

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
