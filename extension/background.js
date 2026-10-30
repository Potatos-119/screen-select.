import {
  briefRequestText,
  buildBriefRequest,
  describeBriefError,
  keyNameFor,
  parseBriefResponse,
  providerFor,
} from './lib/brief.js';
import {
  buildTranslateUrl,
  fallbackUrl,
  hasTwoLanguages,
  parseTranslateResponse,
  sourceLang,
  targetLang,
} from './lib/translate.js';

const ASK_URLS = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
};

const CAPTURE_RETRY_MS = 600;

const startingTabs = new Set();
let offscreenReady = null;

// Shared so that two reads starting together don't both try to create the document.
function ensureOffscreen() {
  offscreenReady ??= (async () => {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Runs text recognition with WebAssembly',
    });
  })().finally(() => {
    offscreenReady = null;
  });
  return offscreenReady;
}

async function recognize(dataUrl) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'recognize', dataUrl });
}

async function translate(text, chosenTarget) {
  if (!chosenTarget && hasTwoLanguages(text)) return { twoLanguages: true };
  const target = chosenTarget ?? targetLang(text);
  const source = chosenTarget ? sourceLang(target) : 'auto';
  try {
    const response = await fetch(buildTranslateUrl(text, target, source));
    if (!response.ok) throw new Error(`Translate returned ${response.status}`);
    return { translation: parseTranslateResponse(await response.json()) };
  } catch {
    await chrome.tabs.create({ url: fallbackUrl(text, target, source) });
    return { fallbackOpened: true };
  }
}

async function brief(text, imageDataUrl) {
  const { briefModel } = await chrome.storage.sync.get('briefModel');
  const keyName = keyNameFor(briefModel);
  const { [keyName]: apiKey } = await chrome.storage.local.get(keyName);
  if (!apiKey) {
    return { noKey: true, provider: providerFor(briefModel), requestText: text ? briefRequestText(text) : '' };
  }
  const { url, init } = buildBriefRequest({ apiKey, model: briefModel, text, imageDataUrl });

  let response;
  try {
    response = await fetch(url, init);
  } catch {
    return { error: 'Could not reach the AI service. Check your connection and try again.' };
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) return { error: describeBriefError(response.status, json, briefModel) };
  return { brief: parseBriefResponse(json, briefModel) };
}

// The page's content security policy can block font URLs, so the overlay gets the bytes.
async function readFont(name) {
  const response = await fetch(chrome.runtime.getURL(`fonts/${name}.woff2`));
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function fonts() {
  const [latin, arabic] = await Promise.all([readFont('caveat'), readFont('aref-ruqaa')]);
  return { latin, arabic };
}

async function ask() {
  const { askTarget } = await chrome.storage.sync.get({ askTarget: 'claude' });
  await chrome.tabs.create({ url: ASK_URLS[askTarget] ?? ASK_URLS.claude });
}

async function showBlocked(tabId) {
  await chrome.action.setBadgeText({ tabId, text: '!' });
  await chrome.action.setTitle({ tabId, title: 'Screen Select cannot run on this page because the browser blocks it' });
}

// Browsers allow two captures per second, which a quick repeat press can exceed.
async function captureTab(windowId) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    } catch (error) {
      if (attempt === 2 || !String(error?.message).includes('MAX_CAPTURE')) throw error;
      await new Promise((resolve) => setTimeout(resolve, CAPTURE_RETRY_MS));
    }
  }
}

async function activate(tab) {
  if (startingTabs.has(tab.id)) return;
  startingTabs.add(tab.id);
  await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  const target = { tabId: tab.id };
  try {
    // Runs first so a second press closes the overlay rather than capturing it.
    const [{ result: closed }] = await chrome.scripting.executeScript({
      target,
      func: () => {
        if (!globalThis.__screenSelect) return false;
        globalThis.__screenSelect.close();
        return true;
      },
    });
    if (closed) return;

    const dataUrl = await captureTab(tab.windowId);
    await chrome.scripting.executeScript({ target, files: ['lib/crop.js', 'lib/looks.js', 'overlay.js'] });
    await chrome.scripting.executeScript({
      target,
      func: (url) => globalThis.__screenSelectStart(url),
      args: [dataUrl],
    });
  } catch {
    await showBlocked(tab.id);
  } finally {
    startingTabs.delete(tab.id);
  }
}

chrome.action.onClicked.addListener(activate);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = {
    'ss-recognize': () => recognize(message.dataUrl),
    'ss-translate': () => translate(message.text, message.target),
    'ss-brief': () => brief(message.text, message.imageDataUrl),
    'ss-fonts': fonts,
    'ss-search': () => chrome.search.query({ text: message.text, disposition: 'NEW_TAB' }),
    'ss-ask': ask,
    'ss-settings': () => chrome.runtime.openOptionsPage(),
  };
  const handler = handlers[message.type];
  if (!handler) return false;

  handler().then(sendResponse, (error) => sendResponse({ error: String(error?.message ?? error) }));
  return true;
});

globalThis.__recognize = recognize;
globalThis.__activate = activate;
