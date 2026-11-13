// The parts of `chrome` that extension/background.js calls, so it can run here unchanged.
function listeners() {
  const added = new Set();
  return { addListener: (listener) => added.add(listener), added };
}

export function createChrome({ storage, recognize, openUrl, openSettings }) {
  const onMessage = listeners();
  const onConnect = listeners();

  const ignored = async () => {};

  return {
    chrome: {
      storage,
      runtime: {
        getURL: (path) => `screen-select://app/extension/${path}`,
        openOptionsPage: async () => openSettings(''),
        onMessage,
        onConnect,
        // background.js only sends to the page that reads text.
        sendMessage: (message) => recognize(message.dataUrl),
      },
      offscreen: { hasDocument: async () => true },
      tabs: { create: async ({ url }) => openUrl(url) },
      action: { onClicked: listeners(), setBadgeText: ignored, setTitle: ignored },
    },

    send(message) {
      return new Promise((resolve) => {
        for (const listener of onMessage.added) {
          if (listener(message, {}, resolve)) return;
        }
        resolve(undefined);
      });
    },

    connect(port) {
      for (const listener of onConnect.added) listener(port);
    },
  };
}
