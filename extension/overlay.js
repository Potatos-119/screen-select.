globalThis.__screenSelectStart = async (dataUrl) => {
  const { toImageRect, isUsableDrag, upscaleFactor, fitWithin } = globalThis.ScreenSelectCrop;
  const BRIEF_IMAGE_MAX_EDGE = 1568;

  const STYLE = `
    :host {
      --paper: #f7f8f4;
      --ink: #1c2230;
      --ink-soft: #4a5163;
      --marker: #ffe94a;
      --slip: #fff3a3;
      --hand: 'Screen Select Hand', 'Screen Select Hand Arabic', Noteworthy, 'Segoe Print', 'Geeza Pro', cursive;
    }
    * { box-sizing: border-box; }
    .frame, .lit { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; }
    .frame { cursor: crosshair; filter: grayscale(0.92) brightness(0.48); }
    .lit { pointer-events: none; clip-path: inset(100%); }
    .flash {
      position: fixed; inset: 0; background: #fff; opacity: 0; pointer-events: none;
      animation: shutter 260ms ease-out;
    }
    @keyframes shutter { from { opacity: 0.85; } to { opacity: 0; } }
    .hint {
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%) rotate(-1.4deg);
      padding: 4px 16px 6px; background: var(--paper); color: var(--ink);
      font: 500 23px/1.2 var(--hand); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45); pointer-events: none;
    }
    .hint[hidden], .box[hidden], .panel[hidden] { display: none; }
    .box {
      position: fixed; pointer-events: none;
      --corner: linear-gradient(var(--marker), var(--marker));
      background:
        var(--corner) 0 0 / 20px 3px, var(--corner) 0 0 / 3px 20px,
        var(--corner) 100% 0 / 20px 3px, var(--corner) 100% 0 / 3px 20px,
        var(--corner) 0 100% / 20px 3px, var(--corner) 0 100% / 3px 20px,
        var(--corner) 100% 100% / 20px 3px, var(--corner) 100% 100% / 3px 20px;
      background-repeat: no-repeat;
    }
    .panel {
      position: fixed; width: 430px; max-width: calc(100vw - 32px); max-height: calc(100vh - 16px);
      overflow: auto; padding: 14px 14px 12px; display: grid; gap: 10px;
      border-radius: 3px; background: var(--paper); color: var(--ink);
      box-shadow: 0 1px 1px rgba(20, 24, 34, 0.3), 0 22px 44px -10px rgba(0, 0, 0, 0.6);
      font: 15px/1.45 system-ui, sans-serif;
      animation: eject 420ms cubic-bezier(0.2, 0.9, 0.3, 1.15);
    }
    @keyframes eject {
      from { opacity: 0; transform: translateY(-22px) rotate(-2.5deg); }
      to { opacity: 1; transform: none; }
    }
    .photo {
      display: block; width: 100%; height: auto; max-height: 170px; object-fit: contain;
      background: #14161b;
    }
    .panel[data-state='reading'] .photo { filter: brightness(0.22) sepia(0.7) contrast(0.75); }
    .panel[data-state='ready'] .photo { filter: none; transition: filter 1.5s ease-out; }
    .text {
      width: 100%; min-height: 54px; max-height: 36vh; padding: 2px 4px; resize: vertical;
      border: 0; border-radius: 2px; background: transparent; color: inherit;
      font: 500 24px/1.22 var(--hand);
    }
    .translation, .brief {
      max-height: 28vh; overflow: auto; padding: 8px 10px; white-space: pre-wrap; user-select: text;
    }
    .translation { border-top: 1px dashed var(--ink-soft); font: 500 22px/1.3 var(--hand); }
    .brief { background: var(--slip); }
    .translation:empty, .brief:empty { display: none; }
    .actions { display: flex; flex-wrap: wrap; gap: 4px 12px; }
    button {
      padding: 3px 3px; border: 0; color: var(--ink); cursor: pointer;
      font: 600 14px/1.3 system-ui, sans-serif;
      background: linear-gradient(var(--marker), var(--marker)) no-repeat 0 100% / 0 100%;
      transition: background-size 170ms ease-out;
    }
    button:hover { background-size: 100% 100%; }
    button:focus-visible, .text:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
    button:disabled { color: var(--ink-soft); cursor: default; }
    .status { color: var(--ink-soft); font: 500 20px/1.2 var(--hand); }
    .status:empty { display: none; }
    @media (prefers-reduced-motion: reduce) {
      .flash { display: none; }
      .panel { animation: none; }
      .panel[data-state='ready'] .photo, button { transition: none; }
    }
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
    <canvas class="lit"></canvas>
    <div class="flash"></div>
    <div class="hint">Drag over anything. Esc cancels.</div>
    <div class="box" hidden></div>
    <div class="panel" hidden>
      <canvas class="photo"></canvas>
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
  const lit = root.querySelector('.lit');
  const photo = root.querySelector('.photo');
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
  lit.width = bitmap.width;
  lit.height = bitmap.height;
  lit.getContext('2d').drawImage(bitmap, 0, 0);
  root.querySelector('.flash').addEventListener('animationend', (event) => event.target.remove());
  const loadedFonts = [];
  loadFonts();

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

  async function loadFonts() {
    try {
      const { latin, arabic } = await chrome.runtime.sendMessage({ type: 'ss-fonts' });
      const faces = [
        ['Screen Select Hand', latin],
        ['Screen Select Hand Arabic', arabic],
      ];
      for (const [name, data] of faces) {
        const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
        const face = await new FontFace(name, bytes).load();
        document.fonts.add(face);
        loadedFonts.push(face);
      }
    } catch {
      // The handwriting is decoration, so the system fonts in --hand take over.
    }
  }

  function close() {
    keyEvents.forEach((type) => window.removeEventListener(type, blockKey, true));
    window.removeEventListener('contextmenu', blockMenu, true);
    pausedVideos.forEach((video) => video.play().catch(() => {}));
    dialog.remove();
    loadedFonts.forEach((face) => document.fonts.delete(face));
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
    const right = innerWidth - rect.x - rect.width;
    const bottom = innerHeight - rect.y - rect.height;
    lit.style.clipPath = `inset(${rect.y}px ${right}px ${bottom}px ${rect.x}px)`;
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
    photo.width = cropCanvas.width;
    photo.height = cropCanvas.height;
    photo.getContext('2d').drawImage(cropCanvas, 0, 0);

    const factor = upscaleFactor(cropCanvas.height);
    const large = new OffscreenCanvas(cropCanvas.width * factor, cropCanvas.height * factor);
    const context = large.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(cropCanvas, 0, 0, large.width, large.height);

    panel.dataset.state = 'reading';
    textArea.value = '';
    translation.textContent = '';
    brief.textContent = '';
    setStatus('Developing the text...');
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
      setStatus('No text found. You can still copy the image or get a brief.');
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
      lit.style.clipPath = 'inset(100%)';
    }
  });

  frame.addEventListener('pointercancel', () => {
    dragStart = null;
    box.hidden = true;
    lit.style.clipPath = 'inset(100%)';
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
