globalThis.__screenSelectStart = async (dataUrl) => {
  const { toImageRect, isUsableDrag, upscaleFactor, fitWithin } = globalThis.ScreenSelectCrop;
  const BRIEF_IMAGE_MAX_EDGE = 1568;

  const STYLE = `
    * { box-sizing: border-box; }
    .frame { position: fixed; inset: 0; width: 100vw; height: 100vh; cursor: crosshair; display: block; }
    .hint {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      padding: 8px 14px; border-radius: 999px; background: #16181f; color: #f2f3f5;
      font: 13px/1.3 system-ui, sans-serif; pointer-events: none;
    }
    .box {
      position: fixed; border: 2px solid #8ab4ff; pointer-events: none;
      box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.4);
    }
    .panel {
      position: fixed; width: 500px; max-width: calc(100vw - 32px); max-height: calc(100vh - 16px);
      overflow: auto; padding: 12px;
      display: grid; gap: 8px; border-radius: 10px; background: #16181f; color: #f2f3f5;
      border: 1px solid #343845; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      font: 14px/1.4 system-ui, sans-serif;
    }
    .panel[hidden] { display: none; }
    .text {
      width: 100%; min-height: 96px; max-height: 40vh; padding: 8px; resize: vertical;
      border: 1px solid #343845; border-radius: 6px; background: #0f1116; color: inherit; font: inherit;
    }
    .translation, .brief {
      max-height: 30vh; overflow: auto; padding: 8px; border-radius: 6px; background: #20242f;
      white-space: pre-wrap; user-select: text;
    }
    .translation:empty, .brief:empty { display: none; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    button {
      padding: 6px 10px; border: 1px solid #343845; border-radius: 6px; background: #252936;
      color: inherit; font: inherit; cursor: pointer;
    }
    button:hover { background: #30364a; }
    button:focus-visible, .text:focus-visible { outline: 2px solid #8ab4ff; outline-offset: 1px; }
    button:disabled { opacity: 0.5; cursor: default; }
    .status { color: #aeb4c2; font-size: 13px; }
    .status:empty { display: none; }
  `;

  const host = document.createElement('div');
  host.id = 'screen-select-host';
  host.style.cssText = 'display: block !important; width: 100% !important; height: 100% !important;';

  // A modal dialog is the only layer that stays above a fullscreen element.
  const dialog = document.createElement('dialog');
  dialog.style.cssText = `
    display: block !important; position: fixed !important; inset: 0 !important;
    width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important;
    margin: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important;
    overflow: visible !important; opacity: 1 !important; transform: none !important;
  `;
  dialog.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>${STYLE}</style>
    <canvas class="frame"></canvas>
    <div class="hint">Drag over what you want. Esc to cancel.</div>
    <div class="box" hidden></div>
    <div class="panel" hidden>
      <textarea class="text" dir="auto" spellcheck="false" aria-label="Text from your selection"></textarea>
      <div class="translation" dir="auto"></div>
      <div class="brief" dir="auto"></div>
      <div class="actions">
        <button data-action="copy">Copy</button>
        <button data-action="copy-image">Copy image</button>
        <button data-action="translate">Translate</button>
        <button data-action="brief">Brief</button>
        <button data-action="search">Search</button>
        <button data-action="ask">Ask</button>
      </div>
      <div class="status" role="status"></div>
    </div>
  `;

  const frame = root.querySelector('.frame');
  const hint = root.querySelector('.hint');
  const box = root.querySelector('.box');
  const panel = root.querySelector('.panel');
  const textArea = root.querySelector('.text');
  const translation = root.querySelector('.translation');
  const brief = root.querySelector('.brief');
  const status = root.querySelector('.status');
  const buttons = [...root.querySelectorAll('button')];

  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (char) => char.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  frame.width = bitmap.width;
  frame.height = bitmap.height;
  frame.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0);

  document.documentElement.append(dialog);
  dialog.showModal();
  dialog.addEventListener('cancel', close);

  const pausedVideos = [...document.querySelectorAll('video')].filter((video) => !video.paused);
  pausedVideos.forEach((video) => video.pause());

  // Keeps site shortcuts such as Space on YouTube from firing while the overlay is open.
  const blockKey = (event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.type === 'keydown' && event.key === 'Escape') close();
  };
  const blockMenu = (event) => event.stopPropagation();
  const keyEvents = ['keydown', 'keypress', 'keyup'];
  keyEvents.forEach((type) => window.addEventListener(type, blockKey, true));
  window.addEventListener('contextmenu', blockMenu, true);

  function close() {
    keyEvents.forEach((type) => window.removeEventListener(type, blockKey, true));
    window.removeEventListener('contextmenu', blockMenu, true);
    pausedVideos.forEach((video) => video.play().catch(() => {}));
    dialog.remove();
    delete globalThis.__screenSelect;
  }

  globalThis.__screenSelect = { close };

  let cropCanvas = null;
  let dragStart = null;
  let dragRect = null;
  let panelAnchor = null;
  let requestId = 0;

  function setStatus(message) {
    status.textContent = message;
  }

  function placeBox(rect) {
    box.hidden = false;
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  function placePanel(rect) {
    panelAnchor = rect;
    panel.hidden = false;
    const { width, height } = panel.getBoundingClientRect();
    const gap = 8;
    const fitsBelow = rect.y + rect.height + gap + height <= innerHeight;
    const top = fitsBelow ? rect.y + rect.height + gap : Math.max(gap, rect.y - height - gap);
    panel.style.top = `${Math.min(top, Math.max(gap, innerHeight - height - gap))}px`;
    panel.style.left = `${Math.max(gap, Math.min(rect.x, innerWidth - width - gap))}px`;
  }

  // The panel grows with translations and when the text box is resized.
  new ResizeObserver(() => {
    if (!panel.hidden && panelAnchor) placePanel(panelAnchor);
  }).observe(panel);

  function cropTo(imageRect) {
    const canvas = new OffscreenCanvas(imageRect.width, imageRect.height);
    canvas
      .getContext('2d')
      .drawImage(bitmap, imageRect.x, imageRect.y, imageRect.width, imageRect.height, 0, 0, imageRect.width, imageRect.height);
    return canvas;
  }

  async function toDataUrl(canvas) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const buffer = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buffer.length; i += 0x8000) {
      binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
    }
    return `data:image/png;base64,${btoa(binary)}`;
  }

  async function readSelection(rect) {
    const id = ++requestId;
    const view = frame.getBoundingClientRect();
    cropCanvas = cropTo(toImageRect(rect, view.width, view.height, bitmap.width, bitmap.height));

    const factor = upscaleFactor(cropCanvas.height);
    const large = new OffscreenCanvas(cropCanvas.width * factor, cropCanvas.height * factor);
    const context = large.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(cropCanvas, 0, 0, large.width, large.height);

    panel.dataset.state = 'reading';
    textArea.value = '';
    translation.textContent = '';
    brief.textContent = '';
    setStatus('Reading...');
    placePanel(rect);

    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: 'ss-recognize', dataUrl: await toDataUrl(large) });
    } catch (error) {
      result = { error: String(error?.message ?? error) };
    }
    if (id !== requestId) return;

    panel.dataset.state = 'ready';
    if (result?.error) {
      setStatus(`Could not read this: ${result.error}`);
    } else if (result?.text) {
      textArea.value = result.text;
      setStatus('');
      textArea.focus();
    } else {
      setStatus('No text found. You can still copy the image.');
    }
  }

  frame.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    frame.setPointerCapture(event.pointerId);
    dragStart = { x: event.clientX, y: event.clientY };
    dragRect = null;
    requestId += 1;
    panel.hidden = true;
    hint.hidden = true;
  });

  frame.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    dragRect = {
      x: Math.min(dragStart.x, event.clientX),
      y: Math.min(dragStart.y, event.clientY),
      width: Math.abs(event.clientX - dragStart.x),
      height: Math.abs(event.clientY - dragStart.y),
    };
    placeBox(dragRect);
  });

  frame.addEventListener('pointerup', () => {
    const rect = dragRect;
    dragStart = null;
    if (rect && isUsableDrag(rect)) {
      readSelection(rect);
    } else {
      box.hidden = true;
      hint.hidden = false;
    }
  });

  frame.addEventListener('pointercancel', () => {
    dragStart = null;
    box.hidden = true;
  });

  async function copyText(text) {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Falls through to the older copy command below.
      }
    }
    textArea.select();
    return document.execCommand('copy');
  }

  async function copyImage() {
    if (!navigator.clipboard?.write || !cropCanvas) return false;
    try {
      const blob = await cropCanvas.convertToBlob({ type: 'image/png' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }

  const actions = {
    async copy() {
      if (await copyText(textArea.value)) {
        setStatus('Copied.');
      } else {
        textArea.select();
        setStatus('Could not copy. The text is selected, so press Cmd+C.');
      }
    },

    async 'copy-image'() {
      setStatus((await copyImage()) ? 'Image copied.' : 'Could not copy the image on this page.');
    },

    async translate() {
      const text = textArea.value.trim();
      if (!text) return setStatus('There is no text to translate.');
      setStatus('Translating...');
      const result = await chrome.runtime.sendMessage({ type: 'ss-translate', text });
      if (result?.translation) {
        translation.textContent = result.translation;
        setStatus('');
      } else {
        setStatus('Translation failed here, so it opened in Google Translate.');
      }
    },

    async brief() {
      setStatus('Writing a brief...');
      const size = fitWithin(cropCanvas.width, cropCanvas.height, BRIEF_IMAGE_MAX_EDGE);
      const image = new OffscreenCanvas(size.width, size.height);
      const context = image.getContext('2d');
      context.imageSmoothingQuality = 'high';
      context.drawImage(cropCanvas, 0, 0, size.width, size.height);

      const result = await chrome.runtime.sendMessage({
        type: 'ss-brief',
        text: textArea.value.trim(),
        imageDataUrl: await toDataUrl(image),
      });
      if (result?.brief) {
        brief.textContent = result.brief;
        setStatus('');
      } else {
        setStatus(result?.error ?? 'Could not get a brief. Try again.');
      }
    },

    async search() {
      const text = textArea.value.trim();
      if (!text) return setStatus('There is no text to search for.');
      await chrome.runtime.sendMessage({ type: 'ss-search', text });
    },

    async ask() {
      const text = textArea.value.trim();
      const copied = text ? await copyText(textArea.value) : await copyImage();
      setStatus(copied ? 'Copied. Paste it into the chat.' : 'Could not copy. Copy it by hand before asking.');
      await chrome.runtime.sendMessage({ type: 'ss-ask' });
    },
  };

  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await actions[button.dataset.action]();
      } catch (error) {
        setStatus(`Something went wrong: ${error?.message ?? error}`);
      } finally {
        button.disabled = false;
      }
    });
  });
};
