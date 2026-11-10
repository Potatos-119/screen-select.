import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  net,
  protocol,
  safeStorage,
  screen,
  shell,
  systemPreferences,
} from 'electron';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChrome } from './chrome-shim.mjs';
import { createStore } from './store.mjs';
import { createVision } from './vision.mjs';
import { fixMisreads, removeLineArt } from './extension/lib/ocr-fixes.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SCHEME = 'screen-select';
const PAGE_BASE = `${SCHEME}://app/`;
const SHORTCUT = 'Alt+Shift+D';
const SHORTCUT_LABEL = process.platform === 'darwin' ? 'Option+Shift+D' : 'Alt+Shift+D';
const ICON_PLACE = process.platform === 'darwin' ? 'menu bar icon' : 'tray icon';
const PERMISSION_CHECK_MS = 5000;
const PRIVACY_SETTINGS = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.gz': 'application/gzip',
  '.woff2': 'font/woff2',
};

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

const webPreferences = { preload: join(ROOT, 'preload.cjs'), sandbox: true, contextIsolation: true };

let overlay = null;
let overlayLoaded = null;
let overlayOpen = false;
let textReader = null;
let settings = null;
let permission = null;
let tray = null;
let bridge = null;
let vision = null;
let starting = false;

const windows = () => BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());

function isWebUrl(url) {
  return /^https?:\/\//i.test(url);
}

function keepToAppPages(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) openOutside(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(PAGE_BASE)) return;
    event.preventDefault();
    if (isWebUrl(url)) openOutside(url);
  });
}

function serveAppFiles() {
  protocol.handle(SCHEME, async (request) => {
    const path = normalize(join(ROOT, decodeURIComponent(new URL(request.url).pathname)));
    if (!path.startsWith(`${ROOT}${sep}`)) return new Response('Not found', { status: 404 });
    try {
      const type = MIME_TYPES[extname(path)] ?? 'application/octet-stream';
      return new Response(await readFile(path), { headers: { 'content-type': type } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

// background.js reads its own fonts through fetch, which Node can't do for this app's address.
function fetchAppFilesToo() {
  const webFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => (String(url).startsWith(PAGE_BASE) ? net.fetch(url, init) : webFetch(url, init));
}

function createSecrets() {
  return {
    encrypt: async (value) => (await safeStorage.encryptStringAsync(value)).toString('base64'),
    async decrypt(value) {
      try {
        return (await safeStorage.decryptStringAsync(Buffer.from(value, 'base64'))).result;
      } catch {
        return undefined;
      }
    },
  };
}

function createOverlay() {
  overlay = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences,
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  keepToAppPages(overlay);
  // The shortcut can be pressed before the page has loaded, and its first message would be lost.
  overlayLoaded = overlay.loadURL(`${PAGE_BASE}overlay.html`);
}

async function readWithTesseract(dataUrl) {
  if (!textReader) {
    textReader = new BrowserWindow({ show: false, webPreferences });
    await textReader.loadURL(`${PAGE_BASE}extension/offscreen.html`);
  }
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const reply = (_event, replyId, response) => {
      if (replyId !== id) return;
      ipcMain.off('ss-message-reply', reply);
      resolve(response);
    };
    ipcMain.on('ss-message-reply', reply);
    textReader.webContents.send('ss-message', id, { target: 'offscreen', type: 'recognize', dataUrl });
  });
}

async function recognize(dataUrl) {
  if (vision.ready) {
    try {
      return { text: fixMisreads(removeLineArt(await vision.read(dataUrl))) };
    } catch {
      // Tesseract below can still read it.
    }
  }
  return readWithTesseract(dataUrl);
}

function openSettings(hash) {
  if (settings) {
    settings.loadURL(`${PAGE_BASE}extension/options.html${hash}`);
    settings.show();
  } else {
    settings = new BrowserWindow({ width: 760, height: 760, title: 'Screen Select', webPreferences });
    settings.on('closed', () => {
      settings = null;
    });
    keepToAppPages(settings);
    settings.loadURL(`${PAGE_BASE}extension/options.html${hash}`);
  }
  // The selection stays open behind this, so a saved key can be used straight away.
  if (overlayOpen) settings.setAlwaysOnTop(true, 'screen-saver', 1);
  settings.focus();
}

function closeOverlay() {
  if (overlayOpen) overlay.webContents.executeJavaScript('globalThis.__screenSelect?.close()').catch(() => {});
}

function openOutside(url) {
  closeOverlay();
  return shell.openExternal(url);
}

function openUrl(url) {
  if (url.startsWith(PAGE_BASE)) return openSettings(new URL(url).hash);
  if (isWebUrl(url)) return openOutside(url);
  return undefined;
}

function showPermissionHelp() {
  if (permission) {
    permission.show();
    return;
  }
  permission = new BrowserWindow({ width: 520, height: 340, title: 'Screen Select', resizable: false, webPreferences });
  permission.on('closed', () => {
    permission = null;
  });
  permission.loadURL(`${PAGE_BASE}permission.html`);
}

function needsPermission() {
  return process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted';
}

// A refused capture can hang forever, so this never waits on one for long.
function askForPermission() {
  const asked = desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => {});
  return Promise.race([asked, new Promise((resolve) => setTimeout(resolve, PERMISSION_CHECK_MS))]);
}

async function captureDisplay(display) {
  const thumbnailSize = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0];
  if (!source || source.thumbnail.isEmpty()) throw new Error('Nothing came back from the screen');
  return source.thumbnail.toDataURL();
}

async function toggleSelection() {
  if (starting) return;
  if (overlayOpen) {
    closeOverlay();
    return;
  }
  if (needsPermission()) {
    await askForPermission();
    if (needsPermission()) {
      showPermissionHelp();
      return;
    }
  }

  starting = true;
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const dataUrl = await captureDisplay(display);
    await overlayLoaded;
    overlay.setBounds(display.bounds);
    overlayOpen = true;
    overlay.webContents.send('ss-start', dataUrl);
    overlay.show();
    // Moving onto a screen with different scaling can resize the window on Windows, so the size is set again.
    if (process.platform === 'win32') overlay.setBounds(display.bounds);
    overlay.focus();
  } catch (error) {
    overlayOpen = false;
    dialog.showErrorBox('Screen Select', `Could not capture the screen. ${error?.message ?? error}`);
  } finally {
    starting = false;
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(join(ROOT, 'extension/icons/icon16.png'));
  // At 125% and 150% scaling Windows draws a bigger tray icon, and the 16px one would look blurry.
  const large = nativeImage.createFromPath(join(ROOT, 'extension/icons/icon48.png'));
  for (const scaleFactor of [1.25, 1.5, 2]) {
    const size = Math.round(16 * scaleFactor);
    icon.addRepresentation({ scaleFactor, buffer: large.resize({ width: size, height: size, quality: 'best' }).toPNG() });
  }
  tray = new Tray(icon);
  tray.setToolTip(`Screen Select (${SHORTCUT_LABEL})`);
  const menu = Menu.buildFromTemplate([
    { label: `Select on screen (${SHORTCUT_LABEL})`, click: toggleSelection },
    { label: 'History', click: () => openSettings('#history') },
    { label: 'Settings', click: () => openSettings('') },
    { type: 'separator' },
    { label: 'Quit Screen Select', role: 'quit' },
  ]);
  tray.setContextMenu(menu);
  // Windows only shows the menu on a right-click, so a left-click on the tray icon opens it too.
  if (process.platform === 'win32') tray.on('click', () => tray.popUpContextMenu());
}

function listenToPages() {
  ipcMain.handle('ss-storage', (_event, area, method, argument) => bridge.chrome.storage[area][method](argument));
  ipcMain.handle('ss-send', (_event, message) => bridge.send(message));

  const ports = new Map();
  const portKey = (event, id) => `${event.sender.id}:${id}`;

  ipcMain.on('ss-port-open', (event, id, name) => {
    const messageListeners = new Set();
    const disconnectListeners = new Set();
    const key = portKey(event, id);
    const close = () => {
      if (!ports.delete(key)) return;
      disconnectListeners.forEach((listener) => listener());
    };
    ports.set(key, { messageListeners, close });
    event.sender.once('destroyed', close);
    bridge.connect({
      name,
      onMessage: { addListener: (listener) => messageListeners.add(listener) },
      onDisconnect: { addListener: (listener) => disconnectListeners.add(listener) },
      postMessage(message) {
        if (ports.has(key) && !event.sender.isDestroyed()) event.sender.send('ss-port-message', id, message);
      },
    });
  });
  ipcMain.on('ss-port-message', (event, id, message) => {
    ports.get(portKey(event, id))?.messageListeners.forEach((listener) => listener(message));
  });
  ipcMain.on('ss-port-close', (event, id) => ports.get(portKey(event, id))?.close());

  ipcMain.on('ss-overlay-closed', () => {
    overlayOpen = false;
    overlay.hide();
    settings?.setAlwaysOnTop(false);
  });
  ipcMain.on('ss-open-privacy', () => shell.openExternal(PRIVACY_SETTINGS));
  ipcMain.on('ss-restart', () => {
    app.relaunch();
    app.quit();
  });
}

async function start() {
  serveAppFiles();
  fetchAppFilesToo();
  vision = createVision(app.isPackaged ? join(process.resourcesPath, 'bin') : join(ROOT, 'bin'));

  const storage = createStore({
    path: join(app.getPath('userData'), 'settings.json'),
    secrets: createSecrets(),
    onChanged(changes, area) {
      windows().forEach((window) => window.webContents.send('ss-storage-changed', changes, area));
    },
  });
  bridge = createChrome({ storage, recognize, openUrl, openSettings });
  globalThis.chrome = bridge.chrome;
  await import('./extension/background.js');

  listenToPages();
  createOverlay();
  createTray();
  if (!globalShortcut.register(SHORTCUT, toggleSelection)) {
    dialog.showErrorBox('Screen Select', `Another app is using ${SHORTCUT_LABEL}. Use the ${ICON_PLACE} instead.`);
  }
  if (needsPermission()) {
    await askForPermission();
    if (needsPermission()) showPermissionHelp();
  }
}

app.dock?.hide();
// Windows uses this to group the app's windows and notifications under its own name.
if (process.platform === 'win32') app.setAppUserModelId('com.screenselect.desktop');
app.on('second-instance', toggleSelection);
app.on('will-quit', () => globalShortcut.unregisterAll());
// It lives in the menu bar or the tray, so closing the last window doesn't quit.
app.on('window-all-closed', () => {});
app.whenReady().then(start);
