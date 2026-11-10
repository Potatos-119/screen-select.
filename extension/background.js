import {
  BRIEF_ATTEMPT_MS,
  BRIEF_TIMEOUT_MS,
  backupFor,
  briefRequestText,
  buildBriefRequest,
  buildTranslationRequest,
  describeBriefError,
  describeBriefTimeout,
  keyNameFor,
  parseBriefResponse,
  streamText,
  providerFor,
  FREE_MODELS,
  usesSharedAi,
} from './lib/brief.js';
import { applyGlossary, matchGlossary, parseGlossary } from './lib/glossary.js';
import { saveEntry } from './lib/history.js';
import { aiSearchUrl } from './lib/search.js';
import { fillSegments, partsToText, segmentsOf, textToParts } from './lib/table.js';
import { createSseReader } from './lib/stream.js';
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
const AI_TRANSLATE_TIMEOUT_MS = 12000;

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

async function translateWith(model, text, target, glossary, table) {
  const apiKey = await readKey(model);
  if (!apiKey && !usesSharedAi(model, apiKey)) return null;
  try {
    const { url, init } = buildTranslationRequest({ apiKey, model, text, target, glossary, table });
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(AI_TRANSLATE_TIMEOUT_MS) });
    if (!response.ok) return null;
    return parseBriefResponse(await response.json(), model);
  } catch {
    return null;
  }
}

async function translateWithAi(text, target, glossary, table) {
  for (const model of FREE_MODELS) {
    const translation = await translateWith(model, text, target, glossary, table);
    if (translation) return translation;
  }
  return null;
}

async function translateWithGoogle(text, target, source, glossary) {
  try {
    const response = await fetch(buildTranslateUrl(applyGlossary(text, glossary), target, source));
    if (!response.ok) return null;
    return parseTranslateResponse(await response.json());
  } catch {
    return null;
  }
}

async function translationSetup(text, chosenTarget) {
  const target = chosenTarget ?? targetLang(text);
  const { glossary: savedGlossary } = await chrome.storage.local.get('glossary');
  const glossary = matchGlossary(text, parseGlossary(savedGlossary), target);
  // Google leaves the words swapped in below alone once it's told the source language.
  const source = chosenTarget || glossary.length ? sourceLang(target) : 'auto';
  return { target, glossary, source };
}

// Each cell is one line, and the answer is used only if every line comes back.
async function translateTable(parts, chosenTarget) {
  const segments = segmentsOf(parts);
  if (!segments.length) return null;
  const text = segments.join('\n');
  const { target, glossary, source } = await translationSetup(text, chosenTarget);
  const fromAi = fillSegments(parts, await translateWithAi(text, target, glossary, true));
  if (fromAi) return { table: fromAi, engine: 'AI' };
  const fromGoogle = fillSegments(parts, await translateWithGoogle(text, target, source, glossary));
  if (fromGoogle) return { table: fromGoogle, engine: 'Google' };
  return null;
}

async function translate(text, chosenTarget) {
  if (!chosenTarget && hasTwoLanguages(text)) return { twoLanguages: true };
  const parts = textToParts(text);
  const table = parts && (await translateTable(parts, chosenTarget));
  if (table) return { ...table, translation: partsToText(table.table) };

  const { target, glossary, source } = await translationSetup(text, chosenTarget);
  const aiTranslation = await translateWithAi(text, target, glossary, false);
  if (aiTranslation) return { translation: aiTranslation, engine: 'AI' };
  const googleTranslation = await translateWithGoogle(text, target, source, glossary);
  if (googleTranslation) return { translation: googleTranslation, engine: 'Google' };
  await chrome.tabs.create({ url: fallbackUrl(text, target, source) });
  return { fallbackOpened: true };
}

async function readKey(model) {
  const keyName = keyNameFor(model);
  const { [keyName]: apiKey } = await chrome.storage.local.get(keyName);
  return apiKey;
}

// The time limit restarts with each piece of text, so a long answer can finish.
async function streamModel({ model, apiKey, request, timeout, onText, stop }) {
  const timer = new AbortController();
  let timeoutId;
  const restartTimer = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => timer.abort(new DOMException('Timed out', 'TimeoutError')), timeout);
  };
  let wrote = false;
  const write = (text) => {
    if (!text) return;
    wrote = true;
    restartTimer();
    onText(text);
  };

  try {
    restartTimer();
    const { url, init } = buildBriefRequest({ ...request, apiKey, model });
    const response = await fetch(url, { ...init, signal: AbortSignal.any([timer.signal, stop]) });
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      return { error: describeBriefError(response.status, json, model, usesSharedAi(model, apiKey)) };
    }

    const feed = createSseReader((event) => write(streamText(event, model)));
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let raw = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      raw += chunk;
      feed(chunk);
    }
    // Some servers ignore streaming and send the whole reply at once.
    if (!wrote) write(parseBriefResponse(JSON.parse(raw), model));
    return {};
  } catch (error) {
    if (wrote) return { error: 'The answer stopped early. Ask again to continue.', partial: true };
    if (error?.name === 'TimeoutError') return { error: describeBriefTimeout(model) };
    if (error instanceof TypeError || error instanceof SyntaxError) {
      return { error: 'Could not reach the AI service. Check your connection and try again.' };
    }
    return { error: error?.message ?? 'Could not get an answer. Try again.' };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function brief({ text, question, turns, imageDataUrl }, onText, stop) {
  const { briefModel } = await chrome.storage.sync.get('briefModel');
  const apiKey = await readKey(briefModel);
  if (!apiKey && !usesSharedAi(briefModel, apiKey)) {
    return { noKey: true, provider: providerFor(briefModel), requestText: text ? briefRequestText(text, question) : '' };
  }

  const request = { text, question, turns, imageDataUrl };
  const shared = { request, onText, stop };
  const backup = backupFor(briefModel);
  const backupKey = backup && (await readKey(backup));
  const backupReady = backup && (backupKey || usesSharedAi(backup, backupKey));
  if (!backupReady) return streamModel({ ...shared, model: briefModel, apiKey, timeout: BRIEF_TIMEOUT_MS });

  const first = await streamModel({ ...shared, model: briefModel, apiKey, timeout: BRIEF_ATTEMPT_MS });
  if (!first.error || first.partial || stop.aborted) return first;
  const second = await streamModel({ ...shared, model: backup, apiKey: backupKey, timeout: BRIEF_ATTEMPT_MS });
  if (second.error) return first;
  return { note: `${providerFor(briefModel)} could not answer, so ${providerFor(backup)} did.` };
}

let historyWrites = Promise.resolve();

// Writes run one at a time so that two quick saves can't overwrite each other.
function saveHistory(entry) {
  historyWrites = historyWrites.then(async () => {
    const { keepHistory } = await chrome.storage.sync.get({ keepHistory: true });
    if (!keepHistory) return;
    const { history = [] } = await chrome.storage.local.get('history');
    await chrome.storage.local.set({ history: saveEntry(history, entry) });
  });
  return historyWrites;
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
    'ss-history': () => saveHistory(message.entry),
    'ss-open-history': () => chrome.tabs.create({ url: chrome.runtime.getURL('options.html#history') }),
    'ss-fonts': fonts,
    'ss-search': () => chrome.tabs.create({ url: aiSearchUrl(message.text) }),
    'ss-ask': ask,
    'ss-settings': () => chrome.runtime.openOptionsPage(),
  };
  const handler = handlers[message.type];
  if (!handler) return false;

  handler().then(sendResponse, (error) => sendResponse({ error: String(error?.message ?? error) }));
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ss-brief') return;
  const stop = new AbortController();
  port.onDisconnect.addListener(() => stop.abort());
  port.onMessage.addListener(async (message) => {
    const onText = (text) => port.postMessage({ text });
    const result = await brief(message, onText, stop.signal).catch((error) => ({ error: String(error?.message ?? error) }));
    if (!stop.signal.aborted) port.postMessage({ finished: true, ...result });
  });
});

globalThis.__recognize = recognize;
globalThis.__activate = activate;
