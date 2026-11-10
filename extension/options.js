import { matchesSearch, safeLink } from './lib/history.js';

const radios = document.querySelectorAll('input[name="askTarget"]');

chrome.storage.sync.get({ askTarget: 'claude' }).then(({ askTarget }) => {
  radios.forEach((radio) => {
    radio.checked = radio.value === askTarget;
  });
});

radios.forEach((radio) => {
  radio.addEventListener('change', () => chrome.storage.sync.set({ askTarget: radio.value }));
});

const modelRadios = document.querySelectorAll('input[name="briefModel"]');

// Only the last four characters are shown, which is enough to tell keys apart.
function keyEnding(key) {
  return key.length > 8 ? key.slice(-4) : '';
}

function wireKey({ inputId, buttonId, statusId, stateId, storageKey }) {
  const input = document.getElementById(inputId);
  const status = document.getElementById(statusId);
  const state = document.getElementById(stateId);
  const fieldset = input.closest('fieldset');
  const showState = (key) => {
    input.value = '';
    input.placeholder = key ? 'Paste a new key here to replace it.' : 'Paste your API key';
    state.classList.toggle('saved', Boolean(key));
    const ending = key && keyEnding(key);
    state.querySelector('span').textContent = key
      ? `Key saved${ending ? `, ending in ${ending}` : ''}. It's ready to use.`
      : 'No key saved yet.';
  };

  chrome.storage.local.get(storageKey).then((saved) => showState(saved[storageKey] ?? ''));

  document.getElementById(buttonId).addEventListener('click', async () => {
    const value = input.value.trim();
    if (!value) {
      status.textContent = 'Paste a key first.';
      return;
    }
    await chrome.storage.local.set({ [storageKey]: value });
    showState(value);
    status.textContent = 'Saved.';
    fieldset.classList.remove('just-saved');
    void fieldset.offsetWidth;
    fieldset.classList.add('just-saved');
  });

  state.querySelector('button').addEventListener('click', async () => {
    await chrome.storage.local.remove(storageKey);
    showState('');
    status.textContent = 'Removed.';
  });
}

wireKey({ inputId: 'nvidia-key', buttonId: 'save-nvidia-key', statusId: 'nvidia-key-status', stateId: 'nvidia-key-state', storageKey: 'nvidiaKey' });
wireKey({ inputId: 'gemini-key', buttonId: 'save-gemini-key', statusId: 'gemini-key-status', stateId: 'gemini-key-state', storageKey: 'geminiKey' });
wireKey({ inputId: 'api-key', buttonId: 'save-key', statusId: 'key-status', stateId: 'key-state', storageKey: 'apiKey' });

chrome.storage.sync.get({ briefModel: 'nvidia' }).then(({ briefModel }) => {
  // A choice saved before an option was removed falls back to the default.
  const known = [...modelRadios].some((radio) => radio.value === briefModel);
  modelRadios.forEach((radio) => {
    radio.checked = radio.value === (known ? briefModel : 'nvidia');
  });
});

modelRadios.forEach((radio) => {
  radio.addEventListener('change', () => chrome.storage.sync.set({ briefModel: radio.value }));
});

const { LOOKS, PREVIEW_CSS, normalizeLook, cardMarkup } = globalThis.ScreenSelectLooks;

document.head.append(Object.assign(document.createElement('style'), { textContent: PREVIEW_CSS }));
document.getElementById('looks').innerHTML = LOOKS.map(
  (look) => `<label>${cardMarkup(look.id)}<input type="radio" name="theme" value="${look.id}" /> ${look.name}</label>`,
).join('');

const themeRadios = document.querySelectorAll('input[name="theme"]');

chrome.storage.sync.get('theme').then(({ theme }) => {
  const look = normalizeLook(theme);
  document.documentElement.dataset.theme = look;
  themeRadios.forEach((radio) => {
    radio.checked = radio.value === look;
  });
});

themeRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    document.documentElement.dataset.theme = radio.value;
    chrome.storage.sync.set({ theme: radio.value, lookChosen: true });
  });
});

const glossaryBox = document.getElementById('glossary');
const glossaryStatus = document.getElementById('glossary-status');

chrome.storage.local.get('glossary').then(({ glossary = '' }) => {
  glossaryBox.value = glossary;
});

document.getElementById('save-glossary').addEventListener('click', async () => {
  await chrome.storage.local.set({ glossary: glossaryBox.value });
  glossaryStatus.textContent = 'Saved.';
});

const keepHistory = document.getElementById('keep-history');
const historySearch = document.getElementById('history-search');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');

chrome.storage.sync.get({ keepHistory: true }).then((saved) => {
  keepHistory.checked = saved.keepHistory;
});
keepHistory.addEventListener('change', () => chrome.storage.sync.set({ keepHistory: keepHistory.checked }));

function paragraph(text, className) {
  const line = Object.assign(document.createElement('p'), { textContent: text, dir: 'auto' });
  if (className) line.className = className;
  return line;
}

function historyDetails(entry) {
  const lines = entry.translation ? [paragraph(entry.translation)] : [];
  for (const { question, answer } of entry.turns ?? []) {
    if (question) lines.push(paragraph(question, 'asked'));
    lines.push(paragraph(answer));
  }
  if (!lines.length) return null;
  const details = Object.assign(document.createElement('details'), { className: 'history-more' });
  const summary = Object.assign(document.createElement('summary'), { textContent: 'Translation and answers' });
  details.append(summary, ...lines);
  return details;
}

async function deleteEntry(id) {
  const { history = [] } = await chrome.storage.local.get('history');
  await chrome.storage.local.set({ history: history.filter((entry) => entry.id !== id) });
}

function historyCard(entry) {
  const meta = Object.assign(document.createElement('div'), { className: 'history-meta' });
  const time = Object.assign(document.createElement('time'), { textContent: new Date(entry.time).toLocaleString() });
  meta.append(time);
  const link = safeLink(entry.url);
  if (link) {
    const page = Object.assign(document.createElement('a'), {
      href: link,
      textContent: entry.title || link,
      target: '_blank',
      rel: 'noreferrer',
    });
    meta.append(page);
  }
  const remove = Object.assign(document.createElement('button'), { className: 'quiet', textContent: 'Delete' });
  remove.addEventListener('click', () => deleteEntry(entry.id));
  meta.append(remove);

  const card = Object.assign(document.createElement('article'), { className: 'history-entry' });
  card.append(meta, paragraph(entry.text, 'history-text'));
  const details = historyDetails(entry);
  if (details) card.append(details);
  return card;
}

async function showHistory() {
  const { history = [] } = await chrome.storage.local.get('history');
  const found = history.filter((entry) => matchesSearch(entry, historySearch.value));
  historyList.replaceChildren(...found.map(historyCard));
  if (found.length) historyEmpty.textContent = '';
  else historyEmpty.textContent = history.length ? 'Nothing matches your search.' : 'Your selections will show up here.';
}

historySearch.addEventListener('input', showHistory);
document.getElementById('clear-history').addEventListener('click', async () => {
  if (confirm('Delete your whole history?')) await chrome.storage.local.remove('history');
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.history) showHistory();
});
showHistory().then(() => {
  if (location.hash === '#history') document.getElementById('history').scrollIntoView();
});
