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

function wireKey({ inputId, buttonId, statusId, storageKey }) {
  const input = document.getElementById(inputId);
  const status = document.getElementById(statusId);
  const showState = (hasKey) => {
    input.value = '';
    input.placeholder = hasKey ? 'A key is saved. Paste a new one to replace it.' : 'Paste your API key';
  };

  chrome.storage.local.get(storageKey).then((saved) => showState(Boolean(saved[storageKey])));

  document.getElementById(buttonId).addEventListener('click', async () => {
    const value = input.value.trim();
    if (!value) {
      status.textContent = 'Paste a key first.';
      return;
    }
    await chrome.storage.local.set({ [storageKey]: value });
    showState(true);
    status.textContent = 'Saved.';
  });
}

wireKey({ inputId: 'nvidia-key', buttonId: 'save-nvidia-key', statusId: 'nvidia-key-status', storageKey: 'nvidiaKey' });
wireKey({ inputId: 'gemini-key', buttonId: 'save-gemini-key', statusId: 'gemini-key-status', storageKey: 'geminiKey' });
wireKey({ inputId: 'api-key', buttonId: 'save-key', statusId: 'key-status', storageKey: 'apiKey' });

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
