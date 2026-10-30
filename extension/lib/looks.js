// Classic script, shared by the overlay and the settings page.
(() => {
  const LOOKS = [
    { id: 'windows', name: 'Windows' },
    { id: 'mac', name: 'Mac' },
    { id: 'linux', name: 'Linux' },
    { id: 'print', name: 'Print' },
  ];
  const DEFAULT_LOOK = 'windows';

  const PREVIEWS = {
    windows: '<span class="mini"><i class="mini-bar"><b class="mini-x"></b></i><i class="mini-action"></i></span>',
    mac: '<span class="mini"><i class="mini-bar"><b class="mini-dot"></b><b class="mini-dot"></b><b class="mini-dot"></b></i><i class="mini-action"></i></span>',
    linux: '<span class="mini"><i class="mini-bar"><b class="mini-title"></b><b class="mini-round"></b></i><i class="mini-action"></i></span>',
    print: '<span class="mini"><i class="mini-photo"></i><i class="mini-note">hello</i></span>',
  };

  const PREVIEW_CSS = `
    .preview { display: block; height: 84px; padding: 11px; overflow: hidden; border-radius: 6px; }
    .preview i, .preview b { display: block; font-style: normal; }
    .mini { display: block; height: 100%; overflow: hidden; }
    .preview .mini-bar { position: relative; display: flex; align-items: center; gap: 4px; height: 17px; padding: 0 6px; }
    .mini-action { width: 42%; height: 11px; margin: 13px 0 0 8px; }
    .preview-windows { background: linear-gradient(140deg, #0f6cbd, #3aa0e8); }
    .preview-windows .mini { border-radius: 6px; background: #f3f3f3; }
    .preview-windows .mini-x { width: 13px; height: 17px; margin-left: auto; margin-right: -6px; background: #c42b1c; }
    .preview-windows .mini-action { border-radius: 3px; background: #0067c0; }
    .preview-mac { background: linear-gradient(150deg, #8fa8cf, #cdd6e6); }
    .preview-mac .mini { border-radius: 8px; background: rgba(246, 246, 248, 0.86); }
    .preview-mac .mini-dot { width: 6px; height: 6px; border-radius: 50%; background: #ff5f57; }
    .preview-mac .mini-dot:nth-child(2) { background: #febc2e; }
    .preview-mac .mini-dot:nth-child(3) { background: #28c840; }
    .preview-mac .mini-action { border-radius: 4px; background: #007aff; }
    .preview-linux { background: #241f31; }
    .preview-linux .mini { border-radius: 9px; background: #fafafb; }
    .preview-linux .mini-bar { background: #ebebed; }
    .preview-linux .mini-title { width: 30%; height: 4px; margin: 0 auto; border-radius: 2px; background: #77767b; }
    .preview-linux .mini-round { position: absolute; right: 4px; width: 9px; height: 9px; border-radius: 50%; background: #c0bfbc; }
    .preview-linux .mini-action { border-radius: 5px; background: #3584e4; }
    .preview-print { background: #2a2e38; }
    .preview-print .mini { padding: 5px; border-radius: 1px; background: #f7f8f4; transform: rotate(-2deg); }
    .preview-print .mini-photo { height: 30px; background: linear-gradient(135deg, #14161b, #5c6470); }
    .preview-print .mini-note { text-align: left; color: #1c2230; font: 500 16px/1.2 Noteworthy, 'Segoe Print', cursive; }
  `;

  function normalizeLook(look) {
    return LOOKS.some((known) => known.id === look) ? look : DEFAULT_LOOK;
  }

  function cardMarkup(id) {
    return `<span class="preview preview-${id}">${PREVIEWS[id]}</span>`;
  }

  globalThis.ScreenSelectLooks = { LOOKS, DEFAULT_LOOK, PREVIEW_CSS, normalizeLook, cardMarkup };
})();
