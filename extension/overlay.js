globalThis.__screenSelectStart = async (dataUrl) => {
  const { toImageRect, isUsableDrag, upscaleFactor, fitWithin, adjustRect } = globalThis.ScreenSelectCrop;
  const { LOOKS, PREVIEW_CSS, normalizeLook, cardMarkup } = globalThis.ScreenSelectLooks;
  const saved = await chrome.storage.sync.get(['theme', 'lookChosen']);
  let theme = normalizeLook(saved.theme);
  const BRIEF_IMAGE_MAX_EDGE = 1568;
  const BRIEF_IMAGE_QUALITY = 0.8;
  const ASK_PLACEHOLDER = 'Ask about this selection (optional)';
  const FOLLOW_UP_PLACEHOLDER = 'Ask a follow-up question';
  const EDGES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  // Enough of a dragged panel stays on screen to grab it again.
  const PANEL_KEEP_VISIBLE = 120;
  const COPY_KEY = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform ?? navigator.platform) ? 'Cmd+C' : 'Ctrl+C';

  const STYLE = `
    :host {
      --surface: rgba(243, 243, 243, 0.88);
      --text: #1b1b1b;
      --muted: #5d5d5d;
      --line: rgba(0, 0, 0, 0.09);
      --well: #ffffff;
      --accent: #0067c0;
      --on-accent: #ffffff;
      --slip: rgba(0, 103, 192, 0.1);
      --radius: 8px;
      --control-radius: 4px;
      --ui-font: 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif;
      --frame-filter: brightness(0.55);
      --blur: blur(30px) saturate(125%);
      --panel-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 16px 48px rgba(0, 0, 0, 0.32);
      --panel-in: rise 200ms cubic-bezier(0.1, 0.9, 0.2, 1);
    }
    @media (prefers-color-scheme: dark) {
      :host([data-theme='windows']) {
        --surface: rgba(32, 32, 32, 0.88); --text: #ffffff; --muted: #c8c8c8; --line: rgba(255, 255, 255, 0.09);
        --well: rgba(255, 255, 255, 0.06); --accent: #60cdff; --on-accent: #000000; --slip: rgba(96, 205, 255, 0.14);
      }
    }
    :host([data-theme='linux']) {
      --surface: #fafafb;
      --text: #1e1e22;
      --muted: #6a6a70;
      --line: rgba(0, 0, 0, 0.12);
      --well: #ffffff;
      --header: #ebebed;
      --flat: rgba(0, 0, 6, 0.08);
      --accent: #3584e4;
      --on-accent: #ffffff;
      --slip: rgba(53, 132, 228, 0.13);
      --radius: 12px;
      --control-radius: 6px;
      --ui-font: 'Adwaita Sans', Cantarell, Inter, system-ui, -apple-system, sans-serif;
      --frame-filter: brightness(0.5);
      --blur: none;
      --panel-shadow: 0 0 0 1px rgba(0, 0, 6, 0.14), 0 14px 40px rgba(0, 0, 6, 0.38);
      --panel-in: settle 180ms ease-out;
    }
    @media (prefers-color-scheme: dark) {
      :host([data-theme='linux']) {
        --surface: #222226; --text: #ffffff; --muted: #b0b0b6; --line: rgba(255, 255, 255, 0.1); --well: #2e2e32;
        --header: #2e2e32; --flat: rgba(255, 255, 255, 0.1); --accent: #3584e4; --slip: rgba(53, 132, 228, 0.25);
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
      --blur: blur(34px) saturate(180%);
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
      --blur: none;
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
      border-radius: var(--radius); background: var(--surface); color: var(--text);
      font: 500 13px/1.3 var(--ui-font); box-shadow: var(--panel-shadow); pointer-events: none;
      backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
    }
    .hint[hidden], .box[hidden], .size[hidden], .panel[hidden], .choices[hidden],
    .text[hidden], .source[hidden], .edit-text[hidden] { display: none; }
    .box { position: fixed; pointer-events: none; border: 2px solid var(--accent); border-radius: 2px; }
    .box.ready { pointer-events: auto; cursor: move; touch-action: none; }
    .handle {
      position: absolute; display: none; width: 12px; height: 12px; margin: -7px 0 0 -7px;
      border: 2px solid var(--accent); border-radius: 50%; background: #ffffff; touch-action: none;
    }
    .box.ready .handle { display: block; }
    .handle[data-edge='nw'] { left: 0; top: 0; cursor: nwse-resize; }
    .handle[data-edge='n'] { left: 50%; top: 0; cursor: ns-resize; }
    .handle[data-edge='ne'] { left: 100%; top: 0; cursor: nesw-resize; }
    .handle[data-edge='e'] { left: 100%; top: 50%; cursor: ew-resize; }
    .handle[data-edge='se'] { left: 100%; top: 100%; cursor: nwse-resize; }
    .handle[data-edge='s'] { left: 50%; top: 100%; cursor: ns-resize; }
    .handle[data-edge='sw'] { left: 0; top: 100%; cursor: nesw-resize; }
    .handle[data-edge='w'] { left: 0; top: 50%; cursor: ew-resize; }
    .size { display: none; }
    .photo, .flash { display: none; }
    .titlebar {
      position: relative; display: flex; align-items: center; gap: 8px; min-height: 34px; margin: 0 -14px;
      padding: 0 14px; cursor: move; user-select: none;
    }
    .panel.dragging { user-select: none; cursor: move; }
    .light { display: none; }
    .title { font-size: 12px; color: var(--text); }
    .close {
      display: grid; place-items: center; width: 44px; height: 34px; margin: 0 -14px 0 auto; padding: 0; border: 0;
      border-radius: 0 var(--radius) 0 0; background: transparent; color: var(--text); cursor: pointer;
      font: 400 17px/1 var(--ui-font);
    }
    .close:hover { background: #c42b1c; color: #ffffff; }
    .panel {
      position: fixed; width: 640px; max-width: calc(100vw - 32px); max-height: calc(100vh - 16px);
      overflow: auto; padding: 0 14px 14px; display: grid; gap: 10px;
      border-radius: var(--radius); background: var(--surface); color: var(--text);
      box-shadow: var(--panel-shadow); font: 14px/1.5 var(--ui-font); animation: var(--panel-in);
      backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
    }
    @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
    @keyframes settle { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    @keyframes pop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: none; } }
    @keyframes eject {
      from { opacity: 0; transform: translateY(-22px) rotate(-2.5deg); }
      to { opacity: 1; transform: none; }
    }
    .text {
      width: 100%; min-height: 86px; max-height: 50vh; padding: 8px 10px; resize: vertical;
      border: 1px solid var(--line); border-radius: var(--control-radius);
      background: var(--well); color: inherit; font: inherit;
    }
    .translation, .brief {
      max-height: 28vh; overflow: auto; padding: 8px 10px; border-radius: var(--control-radius);
      white-space: pre-wrap; user-select: text;
    }
    .translation, .source { background: var(--well); }
    .source { max-height: 32vh; overflow: auto; padding: 8px 10px; border-radius: var(--control-radius); user-select: text; }
    .edit-text {
      justify-self: start; margin-top: -6px; padding: 0; border: 0; background: none; color: var(--accent);
      cursor: pointer; font: 500 12px/1.3 var(--ui-font);
    }
    .edit-text:hover { text-decoration: underline; }
    .text { tab-size: 4; }
    .sheet { width: 100%; border-collapse: collapse; white-space: normal; }
    .sheet td { padding: 4px 8px; border: 1px solid var(--line); vertical-align: top; }
    .sheet tr:first-child td { font-weight: 600; }
    .sheet-line { margin: 0 0 6px; }
    .brief { max-height: 40vh; background: var(--slip); }
    .turn-question { margin: 0 0 4px; color: var(--muted); font-weight: 600; }
    .turn-answer { margin: 0; }
    .turn-answer + .turn-question { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
    .translation:empty, .brief:empty { display: none; }
    .question-form { margin: 0; }
    .question {
      width: 100%; padding: 7px 10px; border: 1px solid var(--line); border-radius: var(--control-radius);
      background: var(--well); color: inherit; font: inherit;
    }
    .question::placeholder { color: var(--muted); opacity: 1; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .actions button {
      padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--control-radius);
      background: var(--surface); color: var(--text); cursor: pointer; font: 600 13px/1.25 var(--ui-font);
    }
    .actions button:hover { background: var(--well); }
    .actions [data-action='look'] { margin-left: auto; }
    .choices span { width: 100%; color: var(--muted); font-size: 13px; }
    .actions [data-action='brief'] { border-color: transparent; background: var(--accent); color: var(--on-accent); }
    .actions [data-action='brief']:hover { background: var(--accent); filter: brightness(1.08); }
    button:focus-visible, .text:focus-visible, .question:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
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
    :host([data-theme='mac']) .panel { font-size: 13px; }
    :host([data-theme='mac']) .close, :host([data-theme='mac']) .light {
      display: block; width: 12px; height: 12px; padding: 0; border: 0; border-radius: 50%;
      box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.18);
    }
    :host([data-theme='mac']) .close {
      display: grid; order: -1; margin: 0; background: #ff5f57; color: transparent; font: 700 10px/1 var(--ui-font);
    }
    :host([data-theme='mac']) .close:hover, :host([data-theme='mac']) .close:focus-visible { color: rgba(90, 0, 0, 0.75); }
    :host([data-theme='mac']) .light.minimize { background: #febc2e; }
    :host([data-theme='mac']) .light.zoom { background: #28c840; }
    :host([data-theme='mac']) .title, :host([data-theme='linux']) .title {
      position: absolute; left: 0; right: 0; text-align: center; pointer-events: none;
      font-weight: 600; font-size: 13px;
    }
    :host([data-theme='mac']) .text { min-height: 78px; border-color: transparent; border-radius: 8px; font-size: 13px; }
    :host([data-theme='mac']) .text:focus-visible { outline: 3px solid rgba(0, 122, 255, 0.4); outline-offset: 0; }
    :host([data-theme='mac']) .actions button {
      padding: 4px 11px; border: 0; background: var(--well); font-weight: 500;
      box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.12), 0 0.5px 1px rgba(0, 0, 0, 0.14);
    }
    :host([data-theme='mac']) .actions [data-action='brief'] { background: var(--accent); color: #fff; }

    :host([data-theme='windows']) .text { border-bottom-color: var(--muted); }
    :host([data-theme='windows']) .text:focus-visible {
      outline: 0; border-bottom: 2px solid var(--accent);
    }
    :host([data-theme='windows']) .actions button { font-weight: 500; border-bottom-color: rgba(127, 127, 127, 0.4); }
    :host([data-theme='windows']) .actions [data-action='brief'] { border-color: transparent; }

    :host([data-theme='linux']) .panel { padding-bottom: 12px; }
    :host([data-theme='linux']) .titlebar { min-height: 42px; margin-bottom: 2px; background: var(--header); }
    :host([data-theme='linux']) .close {
      width: 24px; height: 24px; margin: 0 -6px 0 auto; border-radius: 50%; background: var(--flat);
      font-size: 15px; font-weight: 600;
    }
    :host([data-theme='linux']) .close:hover { background: var(--flat); color: var(--text); filter: brightness(0.92); }
    :host([data-theme='linux']) .text { border-color: transparent; background: var(--flat); }
    :host([data-theme='linux']) .actions button { border: 0; background: var(--flat); font-weight: 700; }
    :host([data-theme='linux']) .actions button:hover { filter: brightness(0.95); }
    :host([data-theme='linux']) .actions [data-action='brief'] { background: var(--accent); }

    :host([data-theme='print']) .titlebar { display: none; }
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
    :host([data-theme='print']) .panel { padding: 14px 14px 12px; font-size: 16px; }
    :host([data-theme='print']) .photo { cursor: move; }
    :host([data-theme='print']) .handle { border-color: var(--marker); background: #14161b; }
    :host([data-theme='print']) .photo {
      display: block; width: 100%; height: auto; max-height: 170px; object-fit: contain; background: #14161b;
    }
    :host([data-theme='print']) .panel[data-state='reading'] .photo { filter: brightness(0.22) sepia(0.7) contrast(0.75); }
    :host([data-theme='print']) .panel[data-state='ready'] .photo { filter: none; transition: filter 1.5s ease-out; }
    :host([data-theme='print']) .text {
      min-height: 64px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 0; background: var(--well);
      line-height: 1.5;
    }
    :host([data-theme='print']) .translation {
      border: 1px solid var(--line); border-radius: 0;
    }
    :host([data-theme='print']) .brief { border-radius: 0; }
    :host([data-theme='print']) .question { border-radius: 0; }
    :host([data-theme='print']) .actions { gap: 4px 12px; }
    :host([data-theme='print']) .actions button,
    :host([data-theme='print']) .actions [data-action='brief'] {
      padding: 3px; border: 0; border-radius: 0; color: var(--text); filter: none; font: 600 14px/1.3 var(--ui-font);
      background: linear-gradient(var(--marker), var(--marker)) no-repeat 0 100% / 100% 4px;
      transition: background-size 170ms ease-out;
    }
    :host([data-theme='print']) .actions [data-action='brief'] { background-size: 100% 100%; }
    :host([data-theme='print']) .actions button:hover { background-size: 100% 100%; }
    :host([data-theme='print']) button:focus-visible { outline-color: var(--text); }
    :host([data-theme='print']) .text:focus-visible, :host([data-theme='print']) .question:focus-visible {
      outline: 2px solid var(--text); outline-offset: 0;
    }
    :host([data-theme='print']) .status { font-size: 14px; }

    .picker {
      position: fixed; inset: 0; display: grid; place-items: center; padding: 16px;
      background: rgba(0, 0, 0, 0.42); animation: fade-in 220ms ease-out;
      transition: opacity 200ms ease-in;
    }
    .picker[hidden] { display: none; }
    .picker.leaving { opacity: 0; }
    .picker-window {
      width: 640px; max-width: 100%; max-height: calc(100vh - 32px); overflow: auto; padding: 24px;
      border-radius: calc(var(--radius) + 4px); background: var(--surface); color: var(--text);
      box-shadow: var(--panel-shadow); font: 14px/1.5 var(--ui-font);
      backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
      animation: window-in 440ms cubic-bezier(0.2, 1.3, 0.35, 1);
      transition: transform 200ms ease-in;
    }
    .picker.leaving .picker-window { transform: scale(0.96); }
    .picker h2 { margin: 0; font: 600 22px/1.25 var(--ui-font); }
    :host([data-theme='print']) .picker h2 { font: 500 36px/1.15 var(--hand); }
    .picker p { margin: 4px 0 18px; color: var(--muted); }
    .look-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .look-card {
      display: grid; gap: 7px; padding: 7px 7px 9px; border: 1px solid var(--line); border-radius: 10px;
      background: transparent; color: var(--text); cursor: pointer; font: 600 13px/1.2 var(--ui-font);
      animation: card-in 480ms cubic-bezier(0.2, 1.35, 0.35, 1) backwards;
      animation-delay: calc(90ms + var(--order) * 65ms);
      transition: transform 170ms cubic-bezier(0.2, 1.4, 0.4, 1), border-color 120ms, box-shadow 170ms;
    }
    .look-card:hover {
      border-color: var(--accent); transform: translateY(-5px) scale(1.03);
      box-shadow: 0 12px 24px -10px rgba(0, 0, 0, 0.45);
    }
    .look-card:active { transform: scale(0.96); }
    .look-card[aria-pressed='true'] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
    .look-card:focus-visible, .picker-later:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .picker-later {
      display: block; margin: 16px 0 0 auto; padding: 5px 10px; border: 0; border-radius: var(--control-radius);
      background: transparent; color: var(--muted); cursor: pointer; font: 500 13px/1.3 var(--ui-font);
    }
    .picker-later:hover { background: var(--line); color: var(--text); }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes window-in { from { opacity: 0; transform: translateY(18px) scale(0.92); } to { opacity: 1; transform: none; } }
    @keyframes card-in { from { opacity: 0; transform: translateY(26px) scale(0.86); } to { opacity: 1; transform: none; } }
    @media (max-width: 640px) { .look-grid { grid-template-columns: repeat(2, 1fr); } }
    ${PREVIEW_CSS}

    @media (prefers-reduced-motion: reduce) {
      :host([data-theme='print']) .flash { display: none; }
      .panel, .picker, .picker-window, .look-card { animation: none; }
      .picker, .picker-window, .look-card { transition: none; }
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
    <div class="box" hidden>${EDGES.map((edge) => `<span class="handle" data-edge="${edge}"></span>`).join('')}</div>
    <div class="size" hidden></div>
    <div class="panel" hidden>
      <div class="titlebar">
        <span class="title" title="Drag to move">Screen Select</span>
        <span class="light minimize"></span>
        <span class="light zoom"></span>
        <button class="close" aria-label="Close">&times;</button>
      </div>
      <canvas class="photo" title="Drag to move"></canvas>
      <textarea class="text" dir="auto" spellcheck="false" aria-label="Text from your selection"></textarea>
      <div class="source" hidden></div>
      <button class="edit-text" type="button" hidden></button>
      <div class="translation" dir="auto"></div>
      <div class="brief" dir="auto"></div>
      <div class="actions choices" hidden></div>
      <form class="question-form">
        <input class="question" type="text" dir="auto" autocomplete="off" spellcheck="false"
          placeholder="${ASK_PLACEHOLDER}" aria-label="Question for Brief" />
      </form>
      <div class="actions">
        <button data-action="copy">Copy</button>
        <button data-action="copy-image">Copy image</button>
        <button data-action="translate">Translate</button>
        <button data-action="brief">Brief</button>
        <button data-action="search">Search</button>
        <button data-action="ask">Ask</button>
        <button data-action="read">Read</button>
        <button data-action="history">History</button>
        <button data-action="look">Look</button>
      </div>
      <div class="status" role="status"></div>
    </div>
    <div class="picker" hidden>
      <div class="picker-window" role="group" aria-labelledby="picker-title">
        <h2 id="picker-title">Choose your look</h2>
        <p>Pick the one you like. You can change it any time with the Look button.</p>
        <div class="look-grid">
          ${LOOKS.map(
            (look, order) => `
              <button class="look-card" data-look="${look.id}" style="--order: ${order}">
                ${cardMarkup(look.id)}${look.name}
              </button>`,
          ).join('')}
        </div>
        <button class="picker-later">Not now</button>
      </div>
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
  const source = root.querySelector('.source');
  const editText = root.querySelector('.edit-text');
  const brief = root.querySelector('.brief');
  const choices = root.querySelector('.choices');
  const questionForm = root.querySelector('.question-form');
  const questionInput = root.querySelector('.question');
  const status = root.querySelector('.status');
  const buttons = [...root.querySelectorAll('[data-action]')];
  const picker = root.querySelector('.picker');
  const lookCards = [...root.querySelectorAll('.look-card')];

  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (char) => char.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  frame.width = bitmap.width;
  frame.height = bitmap.height;
  frame.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0);
  lit.width = bitmap.width;
  lit.height = bitmap.height;
  lit.getContext('2d').drawImage(bitmap, 0, 0);
  const loadedFonts = [];
  root.querySelector('.flash').addEventListener('animationend', (event) => event.target.remove());
  if (theme === 'print') loadFonts();

  document.documentElement.append(dialog);
  dialog.closedBy = 'none';
  dialog.showModal();
  dialog.addEventListener('cancel', (event) => event.preventDefault());

  const pausedVideos = [...document.querySelectorAll('video')].filter((video) => !video.paused);
  pausedVideos.forEach((video) => video.pause());

  // Keeps site shortcuts such as Space on YouTube from firing while the overlay is open.
  const blockKey = (event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.type !== 'keydown' || event.key !== 'Escape') return;
    if (picker.hidden) close();
    else dismissPicker();
  };
  const blockMenu = (event) => event.stopPropagation();
  const keyEvents = ['keydown', 'keypress', 'keyup'];
  keyEvents.forEach((type) => window.addEventListener(type, blockKey, true));
  window.addEventListener('contextmenu', blockMenu, true);

  async function loadFonts() {
    if (loadedFonts.length) return;
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
    speechSynthesis.cancel();
    briefPort?.disconnect();
    dialog.remove();
    loadedFonts.forEach((face) => document.fonts.delete(face));
    delete globalThis.__screenSelect;
  }

  globalThis.__screenSelect = { close };

  let cropCanvas = null;
  let dragStart = null;
  let dragRect = null;
  let panelAnchor = null;
  let panelMoved = false;
  let panelDrag = null;
  let boxRect = null;
  let boxEdit = null;
  let translatedText = '';
  let requestId = 0;
  let briefPort = null;
  let turns = [];
  let historyEntry = null;

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

  function movePanelTo(left, top) {
    const { width } = panel.getBoundingClientRect();
    panel.style.left = `${Math.min(Math.max(left, PANEL_KEEP_VISIBLE - width), innerWidth - PANEL_KEEP_VISIBLE)}px`;
    panel.style.top = `${Math.min(Math.max(top, 0), innerHeight - PANEL_KEEP_VISIBLE / 3)}px`;
  }

  function placePanel(rect) {
    panelAnchor = rect;
    panel.hidden = false;
    // Once the panel is dragged away it stays where it was put.
    if (panelMoved) return;
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

  function fitTextBox() {
    textArea.style.height = 'auto';
    const border = textArea.offsetHeight - textArea.clientHeight;
    // One extra pixel covers rounding, which would otherwise leave the box scrollable.
    textArea.style.height = `${textArea.scrollHeight + border + 1}px`;
  }

  textArea.addEventListener('input', fitTextBox);

  function cropTo(imageRect) {
    const canvas = new OffscreenCanvas(imageRect.width, imageRect.height);
    canvas
      .getContext('2d')
      .drawImage(bitmap, imageRect.x, imageRect.y, imageRect.width, imageRect.height, 0, 0, imageRect.width, imageRect.height);
    return canvas;
  }

  async function toDataUrl(canvas, type = 'image/png', quality) {
    const blob = await canvas.convertToBlob({ type, quality });
    const buffer = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buffer.length; i += 0x8000) {
      binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
    }
    return `data:${type};base64,${btoa(binary)}`;
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
    const pixels = context.getImageData(0, 0, large.width, large.height);
    if (globalThis.ScreenSelectCrop.eraseRuleLines(pixels)) context.putImageData(pixels, 0, 0);

    panel.dataset.state = 'reading';
    textArea.value = '';
    textArea.style.height = '';
    setTableView(false);
    editText.hidden = true;
    translation.textContent = '';
    translatedText = '';
    brief.textContent = '';
    choices.hidden = true;
    resetConversation();
    questionInput.value = '';
    historyEntry = null;
    speechSynthesis.cancel();
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
      setStatus(
        result.table
          ? `Found a table: ${result.table.rows} rows, ${result.table.columns} columns. Copy pastes it into a spreadsheet.`
          : '',
      );
      startHistoryEntry(result.text);
      if (result.table && showSource()) return;
      fitTextBox();
      // Focus puts the cursor at the end, which would scroll long text out of view.
      textArea.setSelectionRange(0, 0);
      textArea.focus({ preventScroll: true });
      textArea.scrollTop = 0;
    } else {
      setStatus('No text found. You can still copy the image or get a brief.');
    }
  }

  frame.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    frame.setPointerCapture(event.pointerId);
    dragStart = { x: event.clientX, y: event.clientY };
    dragRect = null;
    boxRect = null;
    panelMoved = false;
    box.classList.remove('ready');
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
      boxRect = rect;
      box.classList.add('ready');
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

  // After a selection, the box can be moved or resized to take in more, and is read again.
  box.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !boxRect) return;
    event.stopPropagation();
    box.setPointerCapture(event.pointerId);
    boxEdit = { edge: event.target.dataset.edge ?? 'move', x: event.clientX, y: event.clientY, rect: boxRect, current: boxRect };
  });

  box.addEventListener('pointermove', (event) => {
    if (!boxEdit) return;
    const { edge, x, y, rect } = boxEdit;
    boxEdit.current = adjustRect(rect, edge, event.clientX - x, event.clientY - y, innerWidth, innerHeight);
    placeBox(boxEdit.current);
  });

  function finishBoxEdit() {
    if (!boxEdit) return;
    const { rect, current } = boxEdit;
    boxEdit = null;
    size.hidden = true;
    const changed = ['x', 'y', 'width', 'height'].some((key) => Math.round(rect[key]) !== Math.round(current[key]));
    if (!changed) return;
    if (!isUsableDrag(current)) {
      placeBox(rect);
      size.hidden = true;
      return;
    }
    boxRect = current;
    readSelection(current);
  }

  box.addEventListener('pointerup', finishBoxEdit);
  box.addEventListener('pointercancel', finishBoxEdit);

  // The panel moves by its title bar or any empty part of it, so it can uncover the page.
  panel.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('button, textarea, input, select, a, .translation, .brief')) return;
    const { left, top } = panel.getBoundingClientRect();
    panelDrag = { x: event.clientX - left, y: event.clientY - top };
    panel.setPointerCapture(event.pointerId);
    panel.classList.add('dragging');
  });

  panel.addEventListener('pointermove', (event) => {
    if (!panelDrag) return;
    panelMoved = true;
    movePanelTo(event.clientX - panelDrag.x, event.clientY - panelDrag.y);
  });

  function finishPanelDrag() {
    panelDrag = null;
    panel.classList.remove('dragging');
  }

  panel.addEventListener('pointerup', finishPanelDrag);
  panel.addEventListener('pointercancel', finishPanelDrag);

  async function copyText(text) {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Falls through to the older copy command below.
      }
    }
    const scratch = document.createElement('textarea');
    scratch.value = text;
    root.append(scratch);
    scratch.select();
    const copied = document.execCommand('copy');
    scratch.remove();
    return copied;
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

  function showChoices(question, options) {
    const label = document.createElement('span');
    label.textContent = question;
    const optionButtons = options.map(([name, run]) => {
      const button = document.createElement('button');
      button.textContent = name;
      button.addEventListener('click', () => runAction(button, run));
      return button;
    });
    choices.replaceChildren(label, ...optionButtons);
    choices.hidden = false;
  }

  // Same rules as textToParts in lib/table.js, which this classic script can't import.
  function tableParts(text) {
    const lines = text.split('\n');
    if (lines.filter((line) => line.includes('\t')).length < 2) return null;
    const columns = Math.max(...lines.map((line) => line.split('\t').length));
    return lines.map((line) => {
      if (!line.includes('\t')) return { type: 'line', text: line };
      const cells = line.split('\t').map((cell) => cell.trim());
      return { type: 'row', cells: [...cells, ...Array(columns - cells.length).fill('')] };
    });
  }

  function setTableView(on) {
    source.hidden = !on;
    textArea.hidden = on;
    editText.hidden = false;
    editText.textContent = on ? 'Edit as text' : 'Show as table';
    if (!on) fitTextBox();
  }

  // The original table shows as a table. Its text, with tabs between cells, stays editable.
  function showSource() {
    const parts = tableParts(textArea.value);
    if (!parts) {
      setTableView(false);
      editText.hidden = true;
      return false;
    }
    source.replaceChildren(...buildSheet(parts));
    setTableView(true);
    return true;
  }

  editText.addEventListener('click', () => {
    if (source.hidden) {
      showSource();
      return;
    }
    setTableView(false);
    textArea.focus();
  });

  function showTable(parts) {
    translation.replaceChildren(...buildSheet(parts));
  }

  function buildSheet(parts) {
    const nodes = [];
    let table = null;
    for (const part of parts) {
      if (part.type !== 'row') {
        table = null;
        const line = document.createElement('p');
        line.className = 'sheet-line';
        line.dir = 'auto';
        line.textContent = part.text;
        nodes.push(line);
        continue;
      }
      if (!table) {
        table = document.createElement('table');
        table.className = 'sheet';
        nodes.push(table);
      }
      const row = table.insertRow();
      part.cells.forEach((text) => {
        const cell = row.insertCell();
        // Cells with only numbers follow the table's direction.
        if (/\p{L}/u.test(text)) cell.dir = 'auto';
        cell.textContent = text;
      });
    }
    // An Arabic table reads from the right, so its first column goes on the right.
    nodes
      .filter((node) => node.tagName === 'TABLE')
      .forEach((node) => {
        const letters = node.textContent.match(/\p{L}/gu)?.length ?? 0;
        const arabic = node.textContent.match(/\p{Script=Arabic}/gu)?.length ?? 0;
        node.dir = arabic > letters / 2 ? 'rtl' : 'ltr';
      });
    return nodes;
  }

  async function translateText(target) {
    const text = textArea.value.trim();
    if (!text) return setStatus('There is no text to translate.');
    setStatus('Translating...');
    const result = await chrome.runtime.sendMessage({ type: 'ss-translate', text, target });
    if (result?.twoLanguages) {
      setStatus('');
      showChoices('This text has two languages. Translate it to:', [
        ['English', () => translateText('en')],
        ['Arabic', () => translateText('ar')],
      ]);
    } else if (result?.table) {
      showTable(result.table);
      translatedText = result.translation;
      setStatus(`Translated the table with ${result.engine}.`);
      saveToHistory({ translation: result.translation });
    } else if (result?.translation) {
      translation.textContent = result.translation;
      translatedText = result.translation;
      setStatus(`Translated with ${result.engine}.`);
      saveToHistory({ translation: result.translation });
    } else {
      setStatus('Translation failed here, so it opened in Google Translate.');
    }
  }

  function resetConversation() {
    briefPort?.disconnect();
    briefPort = null;
    turns = [];
    brief.textContent = '';
    questionInput.placeholder = ASK_PLACEHOLDER;
  }

  function startHistoryEntry(text) {
    historyEntry = { id: crypto.randomUUID(), time: Date.now(), text, title: document.title, url: location.href };
    saveToHistory({});
  }

  function saveToHistory(changes) {
    historyEntry ??= { id: crypto.randomUUID(), time: Date.now(), text: textArea.value, title: document.title, url: location.href };
    Object.assign(historyEntry, changes);
    chrome.runtime.sendMessage({ type: 'ss-history', entry: historyEntry }).catch(() => {});
  }

  function addTurnLine(className, text) {
    const line = document.createElement('p');
    line.className = className;
    line.dir = 'auto';
    line.textContent = text;
    brief.append(line);
    return line;
  }

  function streamBrief(request, onText) {
    return new Promise((resolve) => {
      const port = chrome.runtime.connect({ name: 'ss-brief' });
      briefPort = port;
      port.onMessage.addListener((message) => {
        if (message.finished) {
          port.disconnect();
          resolve(message);
        } else {
          onText(message.text);
        }
      });
      port.onDisconnect.addListener(() => resolve({ stopped: true }));
      port.postMessage(request);
    });
  }

  // Edge and Windows offer natural-sounding online voices, which read far better than the old ones.
  function speechVoice(lang) {
    const voices = speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(lang));
    return voices.find((voice) => /Natural|Online|Neural/i.test(voice.name)) ?? voices.find((voice) => voice.default) ?? voices[0];
  }

  async function voicesReady() {
    if (speechSynthesis.getVoices().length) return;
    await new Promise((resolve) => {
      speechSynthesis.addEventListener('voiceschanged', resolve, { once: true });
      setTimeout(resolve, 800);
    });
  }

  function textToRead() {
    const lastAnswer = turns.at(-1)?.answer;
    return lastAnswer || translatedText || textArea.value.trim();
  }

  function setReadLabel(label) {
    root.querySelector('[data-action="read"]').textContent = label;
  }

  async function briefInChat(requestText) {
    const copied = requestText ? await copyText(requestText) : await copyImage();
    setStatus(copied ? 'Copied. Paste it into the chat to get your brief.' : 'Could not copy. Copy it by hand first.');
    await chrome.runtime.sendMessage({ type: 'ss-ask' });
  }

  const actions = {
    async copy() {
      if (await copyText(textArea.value)) {
        setStatus('Copied.');
      } else {
        textArea.select();
        setStatus(`Could not copy. The text is selected, so press ${COPY_KEY}.`);
      }
    },

    async 'copy-image'() {
      setStatus((await copyImage()) ? 'Image copied.' : 'Could not copy the image on this page.');
    },

    async translate() {
      choices.hidden = true;
      await translateText();
    },

    async brief() {
      choices.hidden = true;
      const question = questionInput.value.trim();
      if (!question) resetConversation();
      setStatus(question ? 'Answering...' : 'Writing a brief...');
      const size = fitWithin(cropCanvas.width, cropCanvas.height, BRIEF_IMAGE_MAX_EDGE);
      const image = new OffscreenCanvas(size.width, size.height);
      const context = image.getContext('2d');
      context.imageSmoothingQuality = 'high';
      context.drawImage(cropCanvas, 0, 0, size.width, size.height);

      const questionLine = question ? addTurnLine('turn-question', question) : null;
      const answerLine = addTurnLine('turn-answer', '');
      const turn = { question, answer: '' };
      const result = await streamBrief(
        {
          text: textArea.value.trim(),
          question,
          turns,
          imageDataUrl: await toDataUrl(image, 'image/jpeg', BRIEF_IMAGE_QUALITY),
        },
        (text) => {
          turn.answer += text;
          answerLine.textContent = turn.answer;
          brief.scrollTop = brief.scrollHeight;
          setStatus('');
        },
      );
      if (result.stopped) return;
      if (!turn.answer) {
        questionLine?.remove();
        answerLine.remove();
      }
      if (turn.answer) {
        turns.push(turn);
        questionInput.value = '';
        questionInput.placeholder = FOLLOW_UP_PLACEHOLDER;
        saveToHistory({ turns });
      }
      if (result?.noKey) {
        setStatus('');
        showChoices(`Brief uses ${result.provider}, but no ${result.provider} key is saved.`, [
          ['Add a key', () => chrome.runtime.sendMessage({ type: 'ss-settings' })],
          ['Use my chat instead', () => briefInChat(result.requestText)],
        ]);
      } else if (result.error) {
        setStatus(result.error);
      } else {
        setStatus(result.note ?? '');
      }
    },

    async look() {
      openPicker();
    },

    async history() {
      await chrome.runtime.sendMessage({ type: 'ss-open-history' });
    },

    async read() {
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        return;
      }
      const text = textToRead();
      if (!text) return setStatus('There is nothing to read aloud.');
      await voicesReady();
      const lang = /\p{Script=Arabic}/u.test(text) ? 'ar' : 'en';
      const voice = speechVoice(lang);
      if (lang === 'ar' && !voice) return setStatus('No Arabic voice is installed on this computer.');
      const speech = new SpeechSynthesisUtterance(text);
      speech.lang = voice?.lang ?? 'en-US';
      if (voice) speech.voice = voice;
      speech.onstart = () => setReadLabel('Stop');
      speech.onend = () => setReadLabel('Read');
      speech.onerror = () => setReadLabel('Read');
      speechSynthesis.speak(speech);
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

  function openPicker() {
    lookCards.forEach((card) => card.setAttribute('aria-pressed', String(card.dataset.look === theme)));
    picker.classList.remove('leaving');
    picker.hidden = false;
    lookCards.find((card) => card.dataset.look === theme).focus();
  }

  function hidePicker() {
    picker.classList.add('leaving');
    setTimeout(() => {
      picker.hidden = true;
    }, 200);
  }

  function dismissPicker() {
    chrome.storage.sync.set({ lookChosen: true });
    hidePicker();
  }

  function chooseLook(look) {
    theme = look;
    host.dataset.theme = look;
    if (look === 'print') loadFonts();
    chrome.storage.sync.set({ theme: look, lookChosen: true });
    hidePicker();
  }

  lookCards.forEach((card) => card.addEventListener('click', () => chooseLook(card.dataset.look)));
  root.querySelector('.picker-later').addEventListener('click', dismissPicker);
  root.querySelector('.close').addEventListener('click', close);
  if (!saved.lookChosen) openPicker();

  async function runAction(button, run) {
    button.disabled = true;
    try {
      await run();
    } catch (error) {
      setStatus(`Something went wrong: ${error?.message ?? error}`);
    } finally {
      button.disabled = false;
    }
  }

  questionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const briefButton = root.querySelector('[data-action="brief"]');
    if (!briefButton.disabled) runAction(briefButton, actions.brief);
  });

  buttons.forEach((button) => {
    button.addEventListener('click', () => runAction(button, actions[button.dataset.action]));
  });
};
