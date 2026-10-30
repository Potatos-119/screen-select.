const radios = document.querySelectorAll('input[name="askTarget"]');

chrome.storage.sync.get({ askTarget: 'claude' }).then(({ askTarget }) => {
  radios.forEach((radio) => {
    radio.checked = radio.value === askTarget;
  });
});

radios.forEach((radio) => {
  radio.addEventListener('change', () => chrome.storage.sync.set({ askTarget: radio.value }));
});

const keyInput = document.getElementById('api-key');
const keyStatus = document.getElementById('key-status');
const modelRadios = document.querySelectorAll('input[name="briefModel"]');

function showKeyState(hasKey) {
  keyInput.value = '';
  keyInput.placeholder = hasKey ? 'A key is saved. Paste a new one to replace it.' : 'Paste your API key';
}

chrome.storage.local.get('apiKey').then(({ apiKey }) => showKeyState(Boolean(apiKey)));

document.getElementById('save-key').addEventListener('click', async () => {
  const apiKey = keyInput.value.trim();
  if (!apiKey) {
    keyStatus.textContent = 'Paste a key first.';
    return;
  }
  await chrome.storage.local.set({ apiKey });
  showKeyState(true);
  keyStatus.textContent = 'Saved.';
});

chrome.storage.sync.get({ briefModel: 'opus' }).then(({ briefModel }) => {
  modelRadios.forEach((radio) => {
    radio.checked = radio.value === briefModel;
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
