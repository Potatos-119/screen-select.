const radios = document.querySelectorAll('input[name="askTarget"]');

chrome.storage.sync.get({ askTarget: 'claude' }).then(({ askTarget }) => {
  radios.forEach((radio) => {
    radio.checked = radio.value === askTarget;
  });
});

radios.forEach((radio) => {
  radio.addEventListener('change', () => chrome.storage.sync.set({ askTarget: radio.value }));
});
