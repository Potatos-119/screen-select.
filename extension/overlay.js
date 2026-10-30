globalThis.__screenSelectStart = async (dataUrl) => {
  const { toImageRect, isUsableDrag, upscaleFactor, fitWithin } = globalThis.ScreenSelectCrop;
  const THEMES = ['basic', 'print', 'mac'];
  const saved = await chrome.storage.sync.get({ theme: 'basic' });
  const theme = THEMES.includes(saved.theme) ? saved.theme : 'basic';
  const BRIEF_IMAGE_MAX_EDGE = 1568;

  const STYLE = `
    :host {
      --surface: #ffffff;
      --text: #1d2129;
      --muted: #5c6470;
      --line: #e3e6eb;
      --well: #f5f6f8;
      --accent: #3563e9;
      --on-accent: #ffffff;
      --slip: #eef3ff;
      --radius: 14px;
      --control-radius: 8px;
      --ui-font: system-ui, -apple-system, 'Segoe UI', sans-serif;
      --frame-filter: brightness(0.5);
      --panel-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), 0 18px 44px -12px rgba(0, 0, 0, 0.5);
      --panel-in: settle 170ms ease-out;
    }
    @media (prefers-color-scheme: dark) {
      :host([data-theme='basic']) {
        --surface: #1f2228; --text: #eef0f3; --muted: #a2a9b5; --line: #343843; --well: #2a2e36;
        --accent: #6b8ff5; --on-accent: #10131a; --slip: #2a3350;
      }
    }
    :host([data-theme='mac']) {
      --surface: rgba(246, 246, 248, 0.74);
      --text: #1d1d1f;
      --muted: #6e6e73;
      --line: rgba(0, 0, 0, 0.1);
      --well: rgba(255, 255, 255, 0.55);
      --accent: #007aff;
      --slip: rgba(0, 122, 255, 0.12);
      --radius: 12px;
      --control-radius: 6px;
      --ui-font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
      --frame-filter: brightness(0.62);
      --panel-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.3), 0 22px 60px rgba(0, 0, 0, 0.42);
      --panel-in: pop 240ms cubic-bezier(0.2, 0.9, 0.3, 1.1);
    }
    @media (prefers-color-scheme: dark) {
      :host([data-theme='mac']) {
        --surface: rgba(44, 44, 48, 0.72); --text: #f5f5f7; --muted: #a1a1a6; --line: rgba(255, 255, 255, 0.12);
        --well: rgba(255, 255, 255, 0.08); --accent: #0a84ff; --slip: rgba(10, 132, 255, 0.22);
      }
    }
    :host([data-theme='print']) {
      --surface: #f7f8f4;
      --text: #1c2230;
      --muted: #4a5163;
      --line: #4a5163;
      --marker: #ffe94a;
      --slip: #fff3a3;
      --radius: 3px;
      --frame-filter: grayscale(0.92) brightness(0.48);
      --panel-shadow: 0 1px 1px rgba(20, 24, 34, 0.3), 0 22px 44px -10px rgba(0, 0, 0, 0.6);
      --panel-in: eject 420ms cubic-bezier(0.2, 0.9, 0.3, 1.15);
      --hand: 'Screen Select Hand', 'Screen Select Hand Arabic', Noteworthy, 'Segoe Print', 'Geeza Pro', cursive;
    }

    * { box-sizing: border-box; }
    .frame, .lit { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; }
    .frame { cursor: crosshair; filter: var(--frame-filter); }
    .lit { pointer-events: none; clip-path: inset(100%); }
    .hint {
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%); padding: 7px 14px;
      border-radius: 999px; background: var(--surface); color: var(--text);
      font: 500 13px/1.3 var(--ui-font); box-shadow: var(--panel-shadow); pointer-events: none;
    }
    .hint[hidden], .box[hidden], .size[hidden], .panel[hidden] { display: none; }
    .box { position: fixed; pointer-events: none; border: 2px solid var(--accent); border-radius: 2px; }
    .size { display: none; }
    .titlebar, .photo, .flash { display: none; }
    .panel {
      position: fixed; width: 470px; max-width: calc(100vw - 32px); max-height: calc(100vh - 16px);
      overflow: auto; padding: 12px; display: grid; gap: 10px;
      border-radius: var(--radius); background: var(--surface); color: var(--text);
      box-shadow: var(--panel-shadow); font: 14px/1.5 var(--ui-font); animation: var(--panel-in);
    }
    @keyframes settle { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    @keyframes pop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: none; } }
    @keyframes eject {
      from { opacity: 0; transform: translateY(-22px) rotate(-2.5deg); }
      to { opacity: 1; transform: none; }
    }
    .text {
      width: 100%; min-height: 86px; max-height: 36vh; padding: 8px 10px; resize: vertical;
      border: 1px solid var(--line); border-radius: var(--control-radius);
      background: var(--well); color: inherit; font: inherit;
    }
    .translation, .brief {
      max-height: 28vh; overflow: auto; padding: 8px 10px; border-radius: var(--control-radius);
      white-space: pre-wrap; user-select: text;
    }
    .translation { background: var(--well); }
    .brief { background: var(--slip); }
    .translation:empty, .brief:empty { display: none; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .actions button {
      padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--control-radius);
      background: var(--surface); color: var(--text); cursor: pointer; font: 600 13px/1.25 var(--ui-font);
    }
    .actions button:hover { background: var(--well); }
    .actions [data-action='brief'] { border-color: transparent; background: var(--accent); color: var(--on-accent); }
    .actions [data-action='brief']:hover { background: var(--accent); filter: brightness(1.08); }
    button:focus-visible, .text:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .actions button:disabled { opacity: 0.55; cursor: default; }
    .status { color: var(--muted); font-size: 13px; }
    .status:empty { display: none; }

    :host([data-theme='mac']) .box {
      border: 1px solid rgba(255, 255, 255, 0.9); border-radius: 0;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.28);
    }
    :host([data-theme='mac']) .size {
      display: block; position: fixed; padding: 1px 6px; border-radius: 5px; pointer-events: none;
      background: rgba(0, 0, 0, 0.62); color: #fff; font: 500 12px/1.4 var(--ui-font);
      font-variant-numeric: tabular-nums;
    }
    :host([data-theme='mac']) .size[hidden] { display: none; }
    :host([data-theme='mac']) .panel, :host([data-theme='mac']) .hint {
      backdrop-filter: blur(34px) saturate(180%);
      -webkit-backdrop-filter: blur(34px) saturate(180%);
    }
    :host([data-theme='mac']) .panel { padding: 0 14px 14px; gap: 10px; font-size: 13px; }
    :host([data-theme='mac']) .titlebar {
      position: relative; display: flex; align-items: center; gap: 8px; height: 34px; margin: 0 -2px;
    }
    .titlebar button, .light { width: 12px; height: 12px; padding: 0; border: 0; border-radius: 50%; }
    .titlebar button {
      display: grid; place-items: center; background: #ff5f57; color: transparent; cursor: pointer;
      font: 700 10px/1 var(--ui-font); box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.18);
    }
    .titlebar button:hover, .titlebar button:focus-visible { color: rgba(90, 0, 0, 0.75); }
    .light { box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.18); }
    .light.minimize { background: #febc2e; }
    .light.zoom { background: #28c840; }
    .title {
      position: absolute; left: 0; right: 0; text-align: center; pointer-events: none;
      font-weight: 600; font-size: 13px; color: var(--text);
    }
    :host([data-theme='mac']) .text { min-height: 78px; border-color: transparent; border-radius: 8px; font-size: 13px; }
    :host([data-theme='mac']) .text:focus-visible { outline: 3px solid rgba(0, 122, 255, 0.4); outline-offset: 0; }
    :host([data-theme='mac']) .actions button {
      padding: 4px 11px; border: 0; background: var(--well); font-weight: 500;
      box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.12), 0 0.5px 1px rgba(0, 0, 0, 0.14);
    }
    :host([data-theme='mac']) .actions [data-action='brief'] { background: var(--accent); color: #fff; }

    :host([data-theme='print']) .flash {
      display: block; position: fixed; inset: 0; background: #fff; opacity: 0; pointer-events: none;
      animation: shutter 260ms ease-out;
    }
    @keyframes shutter { from { opacity: 0.85; } to { opacity: 0; } }
    :host([data-theme='print']) .hint {
      top: 20px; padding: 4px 16px 6px; border-radius: 0; transform: translateX(-50%) rotate(-1.4deg);
      font: 500 23px/1.2 var(--hand);
    }
    :host([data-theme='print']) .box {
      border: 0; border-radius: 0;
      --corner: linear-gradient(var(--marker), var(--marker));
      background:
        var(--corner) 0 0 / 20px 3px, var(--corner) 0 0 / 3px 20px,
        var(--corner) 100% 0 / 20px 3px, var(--corner) 100% 0 / 3px 20px,
        var(--corner) 0 100% / 20px 3px, var(--corner) 0 100% / 3px 20px,
        var(--corner) 100% 100% / 20px 3px, var(--corner) 100% 100% / 3px 20px;
      background-repeat: no-repeat;
    }
    :host([data-theme='print']) .panel { padding: 14px 14px 12px; font-size: 15px; }
    :host([data-theme='print']) .photo {
      display: block; width: 100%; height: auto; max-height: 170px; object-fit: contain; background: #14161b;
    }
    :host([data-theme='print']) .panel[data-state='reading'] .photo { filter: brightness(0.22) sepia(0.7) contrast(0.75); }
    :host([data-theme='print']) .panel[data-state='ready'] .photo { filter: none; transition: filter 1.5s ease-out; }
    :host([data-theme='print']) .text {
      min-height: 54px; padding: 2px 4px; border: 0; border-radius: 0; background: transparent;
      font: 500 24px/1.22 var(--hand);
    }
    :host([data-theme='print']) .translation {
      border-top: 1px dashed var(--muted); border-radius: 0; background: transparent;
      font: 500 22px/1.3 var(--hand);
    }
    :host([data-theme='print']) .brief { border-radius: 0; }
    :host([data-theme='print']) .actions { gap: 4px 12px; }
    :host([data-theme='print']) .actions button,
    :host([data-theme='print']) .actions [data-action='brief'] {
      padding: 3px; border: 0; border-radius: 0; color: var(--text); filter: none; font: 600 14px/1.3 var(--ui-font);
      background: linear-gradient(var(--marker), var(--marker)) no-repeat 0 100% / 0 100%;
      transition: background-size 170ms ease-out;
    }
    :host([data-theme='print']) .actions button:hover { background-size: 100% 100%; }
    :host([data-theme='print']) button:focus-visible { outline-color: var(--text); }
    :host([data-theme='print']) .text:focus-visible { outline: 1px dashed var(--muted); outline-offset: 0; }
    :host([data-theme='print']) .status { font: 500 20px/1.2 var(--hand); }

    @media (prefers-reduced-motion: reduce) {
      :host([data-theme='print']) .flash { display: none; }
      .panel { animation: none; }
      :host([data-theme='print']) .panel[data-state='ready'] .photo,
      :host([data-theme='print']) .actions button { transition: none; }
    }
  `;

  const host = document.createElement('div');
  host.id = 'screen-select-host';
  host.dataset.theme = theme;
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
    <div class="size" hidden></div>
    <div class="panel" hidden>
      <div class="titlebar">
        <button class="close" aria-label="Close">&times;</button>
        <span class="light minimize"></span>
        <span class="light zoom"></span>
        <span class="title">Screen Select</span>
      </div>
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
  const size = root.querySelector('.size');
  const panel = root.querySelector('.panel');
  const textArea = root.querySelector('.text');
  const translation = root.querySelector('.translation');
  const brief = root.querySelector('.brief');
  const status = root.querySelector('.status');
  const buttons = [...root.querySelectorAll('[data-action]')];

  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (char) => char.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  frame.width = bitmap.width;
  frame.height = bitmap.height;
  frame.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0);
  lit.width = bitmap.width;
  lit.height = bitmap.height;
  lit.getContext('2d').drawImage(bitmap, 0, 0);
  const loadedFonts = [];
  if (theme === 'print') {
    root.querySelector('.flash').addEventListener('animationend', (event) => event.target.remove());
    loadFonts();
  }

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

    size.hidden = false;
    size.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    size.style.left = `${Math.min(rect.x + rect.width + 8, innerWidth - 90)}px`;
    size.style.top = `${Math.min(rect.y + rect.height + 8, innerHeight - 28)}px`;
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
    setStatus(theme === 'print' ? 'Developing the text...' : 'Reading the text...');
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
    size.hidden = true;
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
    size.hidden = true;
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

  root.querySelector('.close').addEventListener('click', close);

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
