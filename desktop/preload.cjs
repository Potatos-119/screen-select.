// Gives the extension's pages the parts of `chrome` they call, plus `desktop` for this app's own pages.
const { contextBridge, ipcRenderer } = require('electron');

const BASE = 'screen-select://app/extension/';

function listeners() {
  const added = new Set();
  return {
    // Returns nothing, because a page can't be handed the set of its own functions.
    addListener: (listener) => {
      added.add(listener);
    },
    fire: (...args) => added.forEach((listener) => listener(...args)),
  };
}

const storageChanged = listeners();
ipcRenderer.on('ss-storage-changed', (_event, changes, area) => storageChanged.fire(changes, area));

const storageArea = (area) => ({
  get: (keys) => ipcRenderer.invoke('ss-storage', area, 'get', keys),
  set: (values) => ipcRenderer.invoke('ss-storage', area, 'set', values),
  remove: (keys) => ipcRenderer.invoke('ss-storage', area, 'remove', keys),
});

const messages = listeners();
ipcRenderer.on('ss-message', (_event, id, message) => {
  messages.fire(message, {}, (response) => ipcRenderer.send('ss-message-reply', id, response));
});

let nextPort = 0;
const openPorts = new Map();

ipcRenderer.on('ss-port-message', (_event, id, message) => openPorts.get(id)?.onMessage.fire(message));
ipcRenderer.on('ss-port-closed', (_event, id) => {
  openPorts.get(id)?.onDisconnect.fire();
  openPorts.delete(id);
});

function connect({ name }) {
  nextPort += 1;
  const id = nextPort;
  const port = { onMessage: listeners(), onDisconnect: listeners() };
  openPorts.set(id, port);
  ipcRenderer.send('ss-port-open', id, name);
  return {
    onMessage: { addListener: port.onMessage.addListener },
    onDisconnect: { addListener: port.onDisconnect.addListener },
    postMessage: (message) => ipcRenderer.send('ss-port-message', id, message),
    disconnect: () => {
      openPorts.delete(id);
      ipcRenderer.send('ss-port-close', id);
    },
  };
}

// Electron pages already have a `chrome` object, which contextBridge won't replace.
contextBridge.exposeInMainWorld('screenSelectChrome', {
  storage: {
    sync: storageArea('sync'),
    local: storageArea('local'),
    onChanged: { addListener: storageChanged.addListener },
  },
  runtime: {
    getURL: (path) => `${BASE}${path}`,
    sendMessage: (message) => ipcRenderer.invoke('ss-send', message),
    onMessage: { addListener: messages.addListener },
    connect,
  },
});

contextBridge.executeInMainWorld({
  func: () => {
    Object.defineProperty(globalThis, 'chrome', { value: globalThis.screenSelectChrome, configurable: true });
  },
});

contextBridge.exposeInMainWorld('desktop', {
  onStart: (listener) => ipcRenderer.on('ss-start', (_event, dataUrl) => listener(dataUrl)),
  overlayClosed: () => ipcRenderer.send('ss-overlay-closed'),
  openPrivacySettings: () => ipcRenderer.send('ss-open-privacy'),
  restart: () => ipcRenderer.send('ss-restart'),
});
