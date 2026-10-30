import { arabicShare } from './lib/translate.js';

const VENDOR = chrome.runtime.getURL('vendor/tesseract');
const MIN_ARABIC_SHARE = 0.2;

const workers = new Map();

function getWorker(langs) {
  const key = langs.join('+');
  if (!workers.has(key)) {
    workers.set(
      key,
      Tesseract.createWorker(langs, Tesseract.OEM.LSTM_ONLY, {
        workerPath: `${VENDOR}/worker.min.js`,
        corePath: VENDOR,
        langPath: VENDOR,
        workerBlobURL: false,
        cacheMethod: 'none',
        gzip: true,
      }),
    );
  }
  return workers.get(key);
}

// The combined model garbles some English lines, so English-looking text is read again alone.
async function readText(dataUrl) {
  const combined = await getWorker(['eng', 'ara']);
  const { data } = await combined.recognize(dataUrl);
  if (arabicShare(data.text) >= MIN_ARABIC_SHARE) return data.text;

  const english = await getWorker(['eng']);
  return (await english.recognize(dataUrl)).data.text;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen' || message.type !== 'recognize') return false;

  readText(message.dataUrl)
    .then((text) => sendResponse({ text: text.trim() }))
    .catch((error) => sendResponse({ error: String(error?.message ?? error) }));
  return true;
});
