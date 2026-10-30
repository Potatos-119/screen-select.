# Screen Select

Drag a box over anything in a browser tab, even a video, and get the text out of it. Then copy it, translate it, search it or ask AI about it. It's made for Chrome and Brave.

## Install

You can do this without Git, npm or the Terminal.

1. On this GitHub page, click the green **Code** button, then **Download ZIP**.
2. Unzip it and move the folder somewhere permanent, such as Documents.
3. Open `chrome://extensions` in your browser and turn on **Developer mode** (top right). Brave accepts this address too.
4. Click **Load unpacked** and choose the `extension` folder inside it.
5. To keep it handy, click the puzzle icon in the toolbar and pin Screen Select.

Leave the folder where it is, because the browser loads the extension from there every time it starts.

To update, download it again, replace the folder, then press the reload icon on Screen Select in `chrome://extensions`.

## Use

1. Press `Alt+Shift+S` (Option+Shift+S on a Mac) or click the icon.
2. Drag a box over what you want. `Esc` cancels.
3. Pick something from the panel: Copy, Copy image, Translate, Brief, Search or Ask.

The panel holds real text, so you can fix mistakes, select part of it and right-click it.

Translate picks the direction for you: Arabic goes to English, and everything else goes to Arabic. If your selection has both Arabic and English, it asks which one you want first.

## Brief

Brief explains your selection in a few sentences. You choose who writes it under Details, then Extension options.

| Option | Cost | Where the answer appears |
|---|---|---|
| NVIDIA Nemotron (default) | Free trial with limited credits | In the panel |
| NVIDIA DeepSeek | Free trial with limited credits, can be very slow | In the panel |
| Claude Opus or Haiku | Paid per use, separate from a Claude chat plan | In the panel |

Every option needs an API key, and both NVIDIA options share one. If yours is missing, the panel asks what you want to do: add a key, or copy a request and open your chat.

To set up the free option:

1. Create an account at [build.nvidia.com](https://build.nvidia.com) and generate an API key.
2. Open the extension's Details page, then Extension options.
3. Paste the key under **Your NVIDIA API key** and click **Save NVIDIA key**.

Brief gives up after 25 seconds and tells you. If that keeps happening, choose another option in Extension options.

Keys stay in this browser profile, so anyone who can open that profile could read them.

## Looks

The first time you use it, a small window asks you to choose a look. You can change it later with the **Look** button in the panel or in the extension's settings.

Windows is the default and follows Microsoft's Fluent design. Mac has frosted glass, window buttons and a live selection size. Linux has a clean header bar in the style of GNOME's Adwaita. Print turns your selection into an instant photo that develops while the text is read, with handwritten notes.

Windows, Mac and Linux follow your light or dark mode. They use the real system fonts when you have them, and your computer's default font when you don't.

## Settings

Change the shortcut at `chrome://extensions/shortcuts`. If `Alt+Shift+S` does nothing, another extension may have taken it, and you can set a new one there.

Extension options is also where you switch Ask between Claude and ChatGPT.

## Limits

- Protected streaming sites such as Netflix show up as a black picture, so there's no text to read.
- Browsers block extensions on their own pages and on the Chrome Web Store. The icon shows `!` there.
- Blurry, tiny or stylised text can be misread, Arabic more often than English. You can fix it in the panel.
- Copy image needs an `https` page.
- Videos embedded from another site may keep playing while you select.

## Privacy

Translate sends the panel text to Google. Brief sends your selection, including the picture, to the service you chose. Both happen only when you press the button. Everything else stays on your computer.

## Fonts

The handwriting uses Caveat and Aref Ruqaa, both under the SIL Open Font License.

## Development

```bash
npm install
npm run vendor
npm test
npm run e2e
```

`npm run e2e` drives Brave. To use another browser, set `BROWSER_PATH` to its executable.
