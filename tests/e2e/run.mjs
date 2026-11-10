import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BROWSERS = {
  brave: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  edge: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
};
const BROWSER = process.env.BROWSER_PATH ?? BROWSERS[process.env.BROWSER ?? 'brave'];
console.log(`browser: ${BROWSER}`);

const SOURCE = process.env.EXT_DIR ?? 'extension';

// Stands in for the shared AI Worker, so tests never spend the real NVIDIA credits.
// It refuses by default, which leaves Translate and Brief to fall back as they would with it down.
const sharedAi = { reply: null, requests: [] };

const server = createServer((req, res) => {
  if (req.url === '/v1/chat/completions') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      sharedAi.requests.push({ headers: req.headers, body: JSON.parse(body) });
      res.writeHead(sharedAi.reply ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sharedAi.reply ?? { error: { message: 'The free AI is off in tests.' } }));
    });
    return;
  }
  if (req.url === '/page.pdf') {
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    res.end(readFileSync('tests/fixtures/page.pdf'));
    return;
  }
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
cpSync(SOURCE, extDir, { recursive: true });
// Tests can't produce the user gesture activeTab needs, so this copy gets all sites.
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json')));
manifest.host_permissions = ['<all_urls>'];
writeFileSync(join(extDir, 'manifest.json'), JSON.stringify(manifest));
const briefFile = join(extDir, 'lib/brief.js');
const briefSource = readFileSync(briefFile, 'utf8');
const sharedLine = /export const SHARED_AI_URL = '[^']*';/;
assert.match(briefSource, sharedLine);
writeFileSync(briefFile, briefSource.replace(sharedLine, `export const SHARED_AI_URL = '${PAGE_URL}v1/chat/completions';`));

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: false,
  userDataDir: join(workDir, 'profile'),
  defaultViewport: null,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, '--window-size=1280,800'],
});

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL - ${name}\n  ${error.message}`);
    if (globalThis.__panelStatus) console.log(`  panel said: ${await globalThis.__panelStatus().catch(() => 'nothing')}`);
  }
}

try {
  const swTarget = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('background.js'),
    { timeout: 15000 },
  );
  const sw = await swTarget.worker();
  // The worker can be found a moment before its extension APIs are ready.
  for (let tries = 0; !(await sw.evaluate(() => typeof chrome !== 'undefined' && Boolean(chrome.storage))); tries += 1) {
    if (tries === 50) throw new Error('The extension never finished starting.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await sw.evaluate(() => chrome.storage.sync.set({ lookChosen: true }));

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
  const clickChoice = (name) =>
    inShadow((root, label) => {
      [...root.querySelectorAll('.choices button')].find((button) => button.textContent === label).click();
    }, name);
  const choicesShown = () => inShadow((root) => !root.querySelector('.choices').hidden);
  const status = () => inShadow((root) => root.querySelector('.status').textContent);
  globalThis.__panelStatus = status;
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

  await check('AI in a sans-serif font is read as AI and translated as a word', async () => {
    await reset();
    await activate();
    await drag('#ai');
    assert.match(await panelText(), /\bAI does the work/);
    await clickButton('translate');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.translation').textContent,
      { timeout: 15000 },
    );
    const text = await inShadow((root) => root.querySelector('.translation').textContent);
    assert.match(text, /الذكاء الاصطناعي/);
    assert.doesNotMatch(text, /آل/);
    await reset();
    await activate();
    await drag('#english');
    await panelText();
  });

  await check('long text fits the box and starts at the top', async () => {
    await reset();
    await activate();
    await drag('#long');
    assert.match(await panelText(), /First line[\s\S]*Seventh line/);
    const box = await inShadow((root) => {
      const text = root.querySelector('.text');
      return {
        scrollTop: text.scrollTop,
        hidden: text.scrollHeight - text.clientHeight,
        cursor: text.selectionStart,
        focused: root.activeElement === text,
      };
    });
    assert.deepEqual(box, { scrollTop: 0, hidden: 0, cursor: 0, focused: true });
    if (process.env.LONG_SHOT) await page.screenshot({ path: process.env.LONG_SHOT });
    await reset();
    await activate();
    await drag('#english');
    await panelText();
  });

  await check('a box and lines around words leave only the words', async () => {
    await reset();
    await activate();
    await page.evaluate(() => document.querySelector('#diagram').getBoundingClientRect());
    await drag('#diagram');
    assert.equal((await panelText()).trim(), 'Submits name and email');
    await reset();
    await activate();
    await drag('#english');
    await panelText();
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

  await check('text with two languages asks which one to translate to', async () => {
    const original = await inShadow((root) => root.querySelector('.text').value);
    await inShadow((root) => {
      root.querySelector('.translation').textContent = '';
      root.querySelector('.text').value = 'The price is 20 dollars\nالسعر هو عشرون دولارا\nThank you for your order';
    });
    await clickButton('translate');
    await page.waitForFunction(
      () => !document.querySelector('#screen-select-host').shadowRoot.querySelector('.choices').hidden,
      { timeout: 5000 },
    );
    assert.equal(await inShadow((root) => root.querySelector('.translation').textContent), '');
    await clickChoice('Arabic');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.translation').textContent,
      { timeout: 15000 },
    );
    const arabic = await inShadow((root) => root.querySelector('.translation').textContent);
    assert.doesNotMatch(arabic, /price|Thank/);
    await clickChoice('English');
    await page.waitForFunction(
      () => !/\p{Script=Arabic}/u.test(document.querySelector('#screen-select-host').shadowRoot.querySelector('.translation').textContent),
      { timeout: 15000 },
    );
    assert.equal(await choicesShown(), true, 'both choices stay available');
    await inShadow((root, text) => {
      root.querySelector('.text').value = text;
    }, original);
    await clickButton('translate');
    await page.waitForFunction(
      () => /\p{Script=Arabic}/u.test(document.querySelector('#screen-select-host').shadowRoot.querySelector('.translation').textContent),
      { timeout: 15000 },
    );
    assert.equal(await choicesShown(), false, 'one language goes back to automatic');
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

  await check('Search opens Google AI Mode in a new tab', async () => {
    const before = (await browser.pages()).length;
    await clickButton('search');
    const target = await browser.waitForTarget((t) => t.url().includes('udm=50'), { timeout: 10000 });
    assert.equal((await browser.pages()).length, before + 1);
    assert.match(target.url(), /^https:\/\/www\.google\.com\/search/);
    await (await target.page())?.close();
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

  await check('a table is read as a table and translated as one', async () => {
    await reset();
    await activate();
    await drag('#prices');
    const text = await panelText();
    console.log('  read:', JSON.stringify(text));
    assert.match(text, /Plan\tPrice\tUsers/);
    assert.match(text, /Team\t12\t10/);
    assert.match(await status(), /Found a table: 3 rows, 3 columns/);
    const original = await inShadow((root) => ({
      cells: [...root.querySelectorAll('.source table tr')].map((row) => [...row.cells].map((cell) => cell.textContent)),
      textHidden: root.querySelector('.text').hidden,
      button: root.querySelector('.edit-text').textContent,
    }));
    assert.deepEqual(original, {
      cells: [['Plan', 'Price', 'Users'], ['Free', '0', '1'], ['Team', '12', '10']],
      textHidden: true,
      button: 'Edit as text',
    });
    await inShadow((root) => root.querySelector('.edit-text').click());
    assert.equal(await inShadow((root) => root.querySelector('.text').hidden), false, 'Edit as text shows the text');
    await inShadow((root) => root.querySelector('.edit-text').click());
    assert.equal(await inShadow((root) => root.querySelector('.source').hidden), false, 'Show as table goes back');
    // Google's free service turns tests away at times, so it answers line by line here.
    await sw.evaluate(() => {
      globalThis.__realFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        if (!String(url).startsWith('https://translate.googleapis.com/')) return globalThis.__realFetch(url, init);
        const lines = new URL(url).searchParams.get('q').split('\n');
        globalThis.__tableRequest = lines;
        const words = { Plan: 'الخطة', Price: 'السعر', Users: 'المستخدمون', Free: 'مجانية', Team: 'فريق' };
        return Response.json([[[lines.map((line) => words[line] ?? 'نص').join('\n'), lines.join('\n')]]]);
      };
    });
    await clickButton('translate');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.translation table'),
      { timeout: 20000 },
    );
    const sent = await sw.evaluate(() => {
      globalThis.fetch = globalThis.__realFetch;
      return globalThis.__tableRequest;
    });
    assert.deepEqual(sent, ['Plan', 'Price', 'Users', 'Free', 'Team'], 'only cells with words are sent, one per line');
    const table = await inShadow((root) => {
      const node = root.querySelector('.translation table');
      return { dir: node.dir, cells: [...node.rows].map((row) => [...row.cells].map((cell) => cell.textContent)) };
    });
    console.log('  translated:', JSON.stringify(table));
    assert.equal(table.dir, 'rtl');
    assert.equal(table.cells.length, 3);
    assert.deepEqual(table.cells.map((row) => row.length), [3, 3, 3]);
    assert.deepEqual(table.cells[2].slice(1), ['12', '10']);
    assert.deepEqual(table.cells[0], ['الخطة', 'السعر', 'المستخدمون']);
    assert.match(await status(), /Translated the table/);
    if (process.env.TABLE_SHOT) await page.screenshot({ path: process.env.TABLE_SHOT });
  });

  await check('the panel can be dragged away and stays there', async () => {
    await reset();
    await activate();
    await drag('#english');
    await panelText();
    const bar = await inShadow((root) => {
      const rect = root.querySelector('.titlebar').getBoundingClientRect();
      return { x: rect.x + 60, y: rect.y + rect.height / 2 };
    });
    const before = await inShadow((root) => root.querySelector('.panel').getBoundingClientRect().toJSON());
    await page.mouse.move(bar.x, bar.y);
    await page.mouse.down();
    await page.mouse.move(bar.x + 400, bar.y + 300, { steps: 6 });
    await page.mouse.up();
    const after = await inShadow((root) => root.querySelector('.panel').getBoundingClientRect().toJSON());
    assert.equal(Math.round(after.x - before.x), 400);
    assert.equal(Math.round(after.y - before.y), 300);
  });

  await check('the box can be resized to take in more, and is read again', async () => {
    const panelBefore = await inShadow((root) => root.querySelector('.panel').getBoundingClientRect().toJSON());
    const corner = await inShadow((root) => {
      const rect = root.querySelector('.handle[data-edge="se"]').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    const arabic = await page.$eval('#arabic', (el) => el.getBoundingClientRect().toJSON());
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(Math.max(corner.x, arabic.right + 6), arabic.bottom + 6, { steps: 6 });
    await page.mouse.up();
    const text = await panelText();
    assert.match(text, /Perception is the first step/);
    assert.match(text, /مرحبا/);
    const panelAfter = await inShadow((root) => root.querySelector('.panel').getBoundingClientRect().toJSON());
    assert.equal(Math.round(panelAfter.x), Math.round(panelBefore.x), 'a moved panel stays put');
  });

  await check('the box can be moved by dragging inside it', async () => {
    const box = await inShadow((root) => root.querySelector('.box').getBoundingClientRect().toJSON());
    const english = await page.$eval('#english', (el) => el.getBoundingClientRect().toJSON());
    const ai = await page.$eval('#ai', (el) => el.getBoundingClientRect().toJSON());
    const start = { x: box.x + box.width / 2, y: box.y + 10 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + (ai.x - english.x), start.y + (ai.y - english.y), { steps: 6 });
    await page.mouse.up();
    assert.match(await panelText(), /AI does the work/);
    await page.keyboard.press('Escape');
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

  const pickerOpen = () => inShadow((root) => !root.querySelector('.picker').hidden);
  const chooseCard = (look) =>
    inShadow((root, id) => root.querySelector(`.look-card[data-look="${id}"]`).click(), look);
  const settle = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
  const stored = () => sw.evaluate(() => chrome.storage.sync.get(['theme', 'lookChosen']));

  await check('Windows is the default look, with a title bar and no photo', async () => {
    await sw.evaluate(() => chrome.storage.sync.remove('theme'));
    await reset();
    await activate();
    assert.equal(await hostTheme(), 'windows');
    await drag('#english');
    assert.match(await panelText(), /Perception is the first step/);
    assert.equal(await isShown('.photo'), false);
    assert.equal(await isShown('.titlebar'), true);
    assert.equal(await isShown('.light'), false);
    assert.equal(await page.evaluate(() => [...document.fonts].some((f) => f.family.includes('Screen Select'))), false);
    await settle();
    await shot('windows');
    await inShadow((root) => root.querySelector('.close').click());
    await settle(100);
    assert.equal(await hostCount(), 0);
  });

  await check('the first use shows the chooser', async () => {
    await sw.evaluate(() => chrome.storage.sync.remove(['theme', 'lookChosen']));
    await reset();
    await activate();
    assert.equal(await pickerOpen(), true);
    assert.equal(await inShadow((root) => root.querySelectorAll('.look-card').length), 4);
    assert.match(await inShadow((root) => root.querySelector('.picker h2').textContent), /Choose your look/);
    await settle(700);
    const seen = await inShadow((root) => {
      const picker = root.querySelector('.picker');
      const rect = root.querySelector('.picker-window').getBoundingClientRect();
      const top = root.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        hidden: picker.hidden,
        display: getComputedStyle(picker).display,
        opacity: getComputedStyle(picker).opacity,
        rect: [rect.x, rect.y, rect.width, rect.height],
        top: top?.className,
        insidePicker: picker.contains(top),
      };
    });
    assert.equal(seen.insidePicker, true);
    assert.equal(await inShadow((root) => getComputedStyle(root.querySelector('.look-card')).animationName), 'card-in');
    await shot('picker');
  });

  await check('choosing a look applies it, saves it and closes the chooser', async () => {
    const card = await inShadow((root) => {
      const rect = root.querySelector('.look-card[data-look="linux"]').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.click(card.x, card.y);
    await settle();
    assert.equal(await hostTheme(), 'linux');
    assert.equal(await pickerOpen(), false);
    assert.deepEqual(await stored(), { theme: 'linux', lookChosen: true });
    await page.keyboard.press('Escape');
    await reset();
    await activate();
    assert.equal(await inShadow((root) => root.querySelector('.picker').hidden), true);
    await page.keyboard.press('Escape');
  });

  await check('Not now keeps the default and does not ask again', async () => {
    await sw.evaluate(() => chrome.storage.sync.remove(['theme', 'lookChosen']));
    await reset();
    await activate();
    await inShadow((root) => root.querySelector('.picker-later').click());
    await settle();
    assert.equal(await pickerOpen(), false);
    assert.equal(await hostTheme(), 'windows');
    assert.equal((await stored()).lookChosen, true);
    await page.keyboard.press('Escape');
  });

  await check('Escape closes only the chooser', async () => {
    await sw.evaluate(() => chrome.storage.sync.remove('lookChosen'));
    await reset();
    await activate();
    await page.keyboard.press('Escape');
    await settle();
    assert.equal(await hostCount(), 1);
    assert.equal(await pickerOpen(), false);
    assert.equal((await stored()).lookChosen, true);
    await page.keyboard.press('Escape');
    assert.equal(await hostCount(), 0);
  });

  await check('the Look button opens the chooser and keeps the selection', async () => {
    await reset();
    await activate();
    await drag('#english');
    const before = await panelText();
    await clickButton('look');
    await settle(100);
    assert.equal(await pickerOpen(), true);
    await chooseCard('print');
    await settle();
    assert.equal(await hostTheme(), 'print');
    assert.equal(await isShown('.photo'), true);
    assert.equal(await inShadow((root) => root.querySelector('.text').value), before);
    await page.waitForFunction(() => document.fonts.check('24px "Screen Select Hand"'), { timeout: 5000 });
    await page.keyboard.press('Escape');
    await sw.evaluate(() => chrome.storage.sync.remove('theme'));
  });

  await check('Linux shows a centred title and a round close button', async () => {
    await setTheme('linux');
    await reset();
    await activate();
    await drag('#english');
    await panelText();
    assert.equal(await isShown('.titlebar'), true);
    assert.equal(await isShown('.light'), false);
    await settle();
    await shot('linux');
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
    for (const look of ['windows', 'mac', 'linux']) {
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

  await check('Print keeps the photo and shows the text in a readable font', async () => {
    await setTheme('print');
    await reset();
    await activate();
    assert.equal(await hostTheme(), 'print');
    await drag('#english');
    await panelText();
    assert.equal(await isShown('.photo'), true);
    const font = await inShadow((root) => getComputedStyle(root.querySelector('.text')).fontFamily);
    assert.doesNotMatch(font, /Screen Select Hand/);
    await new Promise((resolve) => setTimeout(resolve, 1700));
    await shot('print');
    await page.keyboard.press('Escape');
  });

  await check('an old Basic setting opens as Windows', async () => {
    await setTheme('basic');
    await reset();
    await activate();
    assert.equal(await hostTheme(), 'windows');
    await page.keyboard.press('Escape');
  });

  await check('choosing a look in settings saves it', async () => {
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
    assert.equal(await options.$$eval('input[name="theme"]', (inputs) => inputs.length), 4);
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
  const clearKey = () => sw.evaluate(() => chrome.storage.local.remove(['apiKey', 'nvidiaKey', 'geminiKey']));

  await check('Brief with no key uses the free shared AI', async () => {
    await clearKey();
    await sw.evaluate(() => chrome.storage.sync.remove(['askTarget', 'briefModel']));
    sharedAi.requests = [];
    sharedAi.reply = { choices: [{ message: { content: 'A brief from the shared AI.' } }] };
    await reset();
    await activate();
    await drag('#english');
    await panelText();
    await clickButton('brief');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.brief').textContent.includes('shared AI'),
      { timeout: 10000 },
    );
    sharedAi.reply = null;
    const [request] = sharedAi.requests;
    assert.match(request.headers.origin, /^chrome-extension:\/\//);
    assert.equal(request.headers.authorization, undefined, 'no key is sent from the extension');
    assert.equal(request.body.stream, true);
    await page.keyboard.press('Escape');
  });

  await check('Brief without a key asks first and opens nothing', async () => {
    await clearKey();
    // Claude has no shared option, so it still needs a key of your own.
    await sw.evaluate(() => chrome.storage.sync.remove('askTarget'));
    await sw.evaluate(() => chrome.storage.sync.set({ briefModel: 'haiku' }));
    await reset();
    await activate();
    await drag('#english');
    await panelText();
    const tabsBefore = (await browser.pages()).length;
    await clickButton('brief');
    await page.waitForFunction(
      () => !document.querySelector('#screen-select-host').shadowRoot.querySelector('.choices').hidden,
      { timeout: 5000 },
    );
    assert.match(await inShadow((root) => root.querySelector('.choices').textContent), /no Claude key is saved/);
    if (process.env.CHOICE_SHOT) await page.screenshot({ path: process.env.CHOICE_SHOT });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal((await browser.pages()).length, tabsBefore);
  });

  await check('Add a key opens the settings page', async () => {
    await clickChoice('Add a key');
    const target = await waitForTab(`chrome-extension://${new URL(sw.url()).host}/options.html`);
    await (await target.page())?.close();
    await page.bringToFront();
  });

  await check('Use my chat instead copies a request and opens the chat', async () => {
    await clickChoice('Use my chat instead');
    const target = await waitForTab('https://claude.ai/');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.match(await status(), /Paste it into the chat/);
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

    await sw.evaluate(() => chrome.storage.sync.set({ briefModel: 'opus' }));
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
    assert.equal(body.messages[0].content[0].source.media_type, 'image/jpeg');
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

  await check('the free NVIDIA setup gives a brief in the panel', async () => {
    await sw.evaluate(() => chrome.storage.sync.remove('briefModel'));
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
    assert.equal(await options.$eval('input[value="nvidia"]', (radio) => radio.checked), true);
    await options.type('#nvidia-key', 'test-key');
    assert.match(await options.$eval('#nvidia-key-state', (el) => el.textContent), /No key saved yet/);
    await options.click('#save-nvidia-key');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const state = await options.$eval('#nvidia-key-state', (el) => ({ saved: el.classList.contains('saved'), text: el.textContent }));
    assert.equal(state.saved, true);
    assert.match(state.text, /Key saved\. It's ready to use\./);
    assert.doesNotMatch(state.text, /test-key/, 'the key itself is never shown');
    assert.equal(await sw.evaluate(async () => (await chrome.storage.local.get('nvidiaKey')).nvidiaKey), 'test-key');
    assert.equal(await sw.evaluate(async () => (await chrome.storage.sync.get('nvidiaKey')).nvidiaKey), undefined);
    await options.close();

    await reset();
    await activate();
    await drag('#english');
    await panelText();
    await stubBrief(200, { choices: [{ message: { content: 'Free brief.' } }] });
    await clickButton('brief');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await inShadow((root) => root.querySelector('.brief').textContent), 'Free brief.');
    const call = await sw.evaluate(() => globalThis.__briefCalls[0]);
    assert.equal(call.url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(call.init.headers.authorization, 'Bearer test-key');
    const image = JSON.parse(call.init.body).messages[1].content[1].image_url.url;
    assert.match(image, /^data:image\/jpeg;base64,/);
  });

  await check('a question typed in the panel goes with Brief on Enter', async () => {
    await stubBrief(200, { choices: [{ message: { content: 'It means this.' } }] });
    await inShadow((root) => root.querySelector('.question').focus());
    await page.keyboard.type('what does this mean?');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.brief').textContent.includes('It means this.'),
      { timeout: 5000 },
    );
    const call = await sw.evaluate(() => globalThis.__briefCalls[0]);
    const { messages } = JSON.parse(call.init.body);
    assert.equal(messages.at(-1).content, 'what does this mean?');
    assert.equal(messages.at(-1).role, 'user');
    assert.equal(messages.at(-2).role, 'assistant');
    assert.equal(await hostCount(), 1);
    assert.equal(await inShadow((root) => root.querySelector('.question').value), '');
    assert.equal(await inShadow((root) => root.querySelector('.question').placeholder), 'Ask a follow-up question');
  });

  await check('a follow-up keeps the earlier answers on screen', async () => {
    await stubBrief(200, { choices: [{ message: { content: 'Second answer.' } }] });
    await inShadow((root) => root.querySelector('.question').focus());
    await page.keyboard.type('why?');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.brief').textContent.includes('Second answer.'),
      { timeout: 5000 },
    );
    const text = await inShadow((root) => root.querySelector('.brief').textContent);
    assert.match(text, /It means this\.[\s\S]*why\?[\s\S]*Second answer\./);
    const { messages } = JSON.parse((await sw.evaluate(() => globalThis.__briefCalls[0])).init.body);
    assert.ok(messages.some((message) => message.role === 'assistant' && message.content === 'It means this.'));
    if (process.env.CHAT_SHOT) await page.screenshot({ path: process.env.CHAT_SHOT });
  });

  await check('Brief with an empty box starts the conversation again', async () => {
    await stubBrief(200, { choices: [{ message: { content: 'Fresh brief.' } }] });
    await clickButton('brief');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.brief').textContent === 'Fresh brief.',
      { timeout: 5000 },
    );
  });

  await check('a streamed answer appears piece by piece', async () => {
    await sw.evaluate(() => {
      globalThis.fetch = async () => {
        const encoder = new TextEncoder();
        const send = (text) => encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
        return new Response(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(send('First '));
              await new Promise((resolve) => setTimeout(resolve, 900));
              controller.enqueue(send('second.'));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      };
    });
    await clickButton('brief');
    const answer = () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.brief').textContent;
    await page.waitForFunction(`(${answer})() === 'First '`, { timeout: 5000 });
    await page.waitForFunction(`(${answer})() === 'First second.'`, { timeout: 5000 });
  });

  await check('selections and answers are saved, and settings can show, search and delete them', async () => {
    await page.waitForFunction(() => true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const { history } = await sw.evaluate(() => chrome.storage.local.get('history'));
    assert.ok(history.length > 0);
    assert.equal(history[0].turns.at(-1).answer, 'First second.');
    assert.equal(history[0].url, PAGE_URL);
    assert.equal('imageDataUrl' in history[0], false);
    await clickButton('history');
    const target = await waitForTab(`chrome-extension://${new URL(sw.url()).host}/options.html#history`);
    const options = await target.page();
    await options.waitForSelector('.history-entry');
    const before = await options.$$eval('.history-entry', (cards) => cards.length);
    if (process.env.HISTORY_SHOT) await options.screenshot({ path: process.env.HISTORY_SHOT });
    await options.type('#history-search', 'no such words');
    await options.waitForFunction(() => document.querySelector('#history-empty').textContent.includes('Nothing matches'));
    await options.$eval('#history-search', (box) => {
      box.value = '';
      box.dispatchEvent(new Event('input'));
    });
    await options.waitForSelector('.history-entry button');
    await options.click('.history-entry button');
    await options.waitForFunction((count) => document.querySelectorAll('.history-entry').length === count - 1, {}, before);
    await options.click('#keep-history');
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal((await sw.evaluate(() => chrome.storage.sync.get('keepHistory'))).keepHistory, false);
    const countBefore = (await sw.evaluate(() => chrome.storage.local.get('history'))).history.length;
    await page.bringToFront();
    await sw.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await clickButton('brief');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal((await sw.evaluate(() => chrome.storage.local.get('history'))).history.length, countBefore);
    await sw.evaluate(() => chrome.storage.sync.remove('keepHistory'));
    await options.close();
    await page.bringToFront();
  });

  await check('a long page title stays inside the history card', async () => {
    await sw.evaluate(() =>
      chrome.storage.local.set({
        history: [{ id: 'long', time: Date.now(), text: 'Short text', title: 'A very long page title '.repeat(12), url: 'https://example.com/' }],
      }),
    );
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html#history`);
    await options.waitForSelector('.history-entry');
    const fits = await options.evaluate(() => {
      const sheet = document.querySelector('main').getBoundingClientRect();
      const remove = document.querySelector('.history-entry button').getBoundingClientRect();
      const time = document.querySelector('.history-meta time');
      return {
        inside: remove.right <= sheet.right,
        noPageScroll: document.documentElement.scrollWidth <= innerWidth,
        oneLine: time.getBoundingClientRect().height < 30,
      };
    });
    assert.deepEqual(fits, { inside: true, noPageScroll: true, oneLine: true });
    if (process.env.HISTORY_SHOT) await options.screenshot({ path: process.env.HISTORY_SHOT });
    await options.close();
    await page.bringToFront();
  });

  await check('your glossary goes to the AI translator', async () => {
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
    await options.type('#glossary', 'Perception = الإدراك الخاص');
    await options.click('#save-glossary');
    await options.waitForFunction(() => document.querySelector('#glossary-status').textContent === 'Saved.');
    await options.close();
    await page.bringToFront();
    await stubBrief(200, { choices: [{ message: { content: 'ترجمة' } }] });
    await clickButton('translate');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.translation').textContent === 'ترجمة',
      { timeout: 5000 },
    );
    const { messages } = JSON.parse((await sw.evaluate(() => globalThis.__briefCalls[0])).init.body);
    assert.match(messages[0].content, /Perception is الإدراك الخاص/);
  });

  await check('your glossary also works with Google', async () => {
    await sw.evaluate(() => {
      globalThis.__sentToGoogle = '';
      globalThis.fetch = async (url) => {
        if (String(url).includes('nvidia') || String(url).includes('generativelanguage')) return new Response('{}', { status: 500 });
        globalThis.__sentToGoogle = String(url);
        return new Response(JSON.stringify([[['done', 'x']]]), { status: 200 });
      };
    });
    await clickButton('translate');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.status').textContent.includes('with Google'),
      { timeout: 5000 },
    );
    const sent = new URL(await sw.evaluate(() => globalThis.__sentToGoogle));
    assert.match(sent.searchParams.get('q'), /الإدراك الخاص/);
    assert.equal(sent.searchParams.get('sl'), 'en');
    await sw.evaluate(() => chrome.storage.local.remove('glossary'));
  });

  await check('Read speaks the text, and pressing it again stops', async () => {
    await clickButton('read');
    await page.waitForFunction(() => speechSynthesis.speaking, { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await clickButton('read');
    await page.waitForFunction(() => !speechSynthesis.speaking, { timeout: 5000 });
  });

  await check('Translate uses AI when an NVIDIA key is saved', async () => {
    await stubBrief(200, { choices: [{ message: { content: 'جافا فول ستاك' } }] });
    await clickButton('translate');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.status').textContent.includes('with AI'),
      { timeout: 5000 },
    );
    assert.equal(await inShadow((root) => root.querySelector('.translation').textContent), 'جافا فول ستاك');
    const calls = await sw.evaluate(() => globalThis.__briefCalls);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /nvidia/);
  });

  await check('Translate falls back to Google when AI fails', async () => {
    await sw.evaluate(() => {
      const real = globalThis.__realFetch;
      globalThis.fetch = (url, init) =>
        String(url).includes('nvidia') ? Promise.resolve(new Response('{}', { status: 500 })) : real(url, init);
    });
    await clickButton('translate');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.status').textContent.includes('with Google'),
      { timeout: 15000 },
    );
  });

  await check('a Gemini key saved in settings gives a brief in the panel', async () => {
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
    await options.type('#gemini-key', 'test-gemini-key');
    await options.click('#save-gemini-key');
    await options.waitForFunction(() => document.querySelector('#gemini-key-status').textContent === 'Saved.');
    await options.click('input[name="briefModel"][value="gemini"]');
    await new Promise((resolve) => setTimeout(resolve, 200));
    await options.close();
    await page.bringToFront();
    await stubBrief(200, { choices: [{ message: { content: 'Gemini brief.' } }] });
    await clickButton('brief');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.brief').textContent === 'Gemini brief.',
      { timeout: 5000 },
    );
    const call = await sw.evaluate(() => globalThis.__briefCalls[0]);
    assert.match(call.url, /generativelanguage/);
    assert.equal(call.init.headers.authorization, 'Bearer test-gemini-key');
    await sw.evaluate(() => chrome.storage.sync.remove('briefModel'));
  });

  await check('the other free service answers when the chosen one fails', async () => {
    await sw.evaluate(() => chrome.storage.sync.set({ briefModel: 'gemini' }));
    await sw.evaluate(() => {
      globalThis.fetch = async (url) =>
        String(url).includes('generativelanguage')
          ? new Response('{}', { status: 500 })
          : new Response(JSON.stringify({ choices: [{ message: { content: 'Backup brief.' } }] }), { status: 200 });
    });
    await clickButton('brief');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.brief').textContent === 'Backup brief.',
      { timeout: 5000 },
    );
    assert.match(await status(), /Gemini could not answer, so NVIDIA did/);
    await sw.evaluate(() => chrome.storage.sync.remove('briefModel'));
  });

  await check('Translate uses Gemini when only a Gemini key is saved', async () => {
    const { nvidiaKey } = await sw.evaluate(() => chrome.storage.local.get('nvidiaKey'));
    await sw.evaluate(() => chrome.storage.local.remove('nvidiaKey'));
    await stubBrief(200, { choices: [{ message: { content: 'ترجمة' } }] });
    await clickButton('translate');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.translation').textContent === 'ترجمة',
      { timeout: 5000 },
    );
    assert.match((await sw.evaluate(() => globalThis.__briefCalls[0])).url, /generativelanguage/);
    await sw.evaluate((key) => chrome.storage.local.set({ nvidiaKey: key }), nvidiaKey);
    await sw.evaluate(() => chrome.storage.local.remove('geminiKey'));
  });

  await check('Brief stops waiting and explains a server that never answers', async () => {
    await sw.evaluate(() => {
      globalThis.fetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason));
        });
    });
    await clickButton('brief');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.status').textContent.includes('too long'),
      { timeout: 30000 },
    );
    assert.match(await status(), /NVIDIA took too long/);
  });

  await check('a removed Brief option shows the default in settings', async () => {
    await sw.evaluate(() => chrome.storage.sync.set({ briefModel: 'deepseek' }));
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${new URL(sw.url()).host}/options.html`);
    await options.waitForFunction(() => document.querySelector('input[name="briefModel"]:checked'));
    assert.equal(await options.$eval('input[name="briefModel"]:checked', (radio) => radio.value), 'nvidia');
    await options.close();
    await page.bringToFront();
    await sw.evaluate(() => chrome.storage.sync.remove('briefModel'));
  });

  await check('the real NVIDIA server answers and a wrong key is explained', async () => {
    await sw.evaluate(() => {
      globalThis.fetch = globalThis.__realFetch;
    });
    await clickButton('brief');
    await page.waitForFunction(
      () => document.querySelector('#screen-select-host').shadowRoot.querySelector('.status').textContent.includes('NVIDIA'),
      { timeout: 20000 },
    );
    assert.match(await status(), /NVIDIA rejected your API key/);
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

  await check('reads text from a PDF in the browser', async () => {
    await page.bringToFront();
    await page.goto(`${PAGE_URL}page.pdf`);
    // The viewer draws the page a moment after it loads, so an early capture can come back empty.
    let text = '';
    for (let attempt = 0; attempt < 5 && !text.includes('Reading a PDF page'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await activate();
      await page.waitForSelector('#screen-select-host', { timeout: 5000 });
      await page.mouse.move(150, 40);
      await page.mouse.down();
      await page.mouse.move(1150, 420, { steps: 6 });
      await page.mouse.up();
      text = await panelText();
      await page.keyboard.press('Escape');
    }
    assert.match(text, /Reading a PDF page/);
  });
} finally {
  server.close();
  await browser.close();
  rmSync(workDir, { recursive: true, force: true });
}

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
