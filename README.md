# Screen Select

Select text from anything on screen in Brave, even inside a video, then copy, translate, search or ask AI.

## Install

You don't need Git, npm or the Terminal.

1. Download `screen-select.zip`. Get it from whoever shared it, or use the green **Code** button on GitHub, then **Download ZIP**.
2. Unzip it and move the folder somewhere permanent, such as Documents.
3. Open `brave://extensions` in Brave and turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the folder with `manifest.json` inside. In the GitHub download, that's the `extension` folder.
5. Optional: click the puzzle icon in the toolbar and pin Screen Select.

Keep the folder where it is. Brave loads the extension from there each time.

**To update:** replace the folder with the new one, then press the reload icon on Screen Select in `brave://extensions`.

## Use

1. Press `Alt+Shift+S` (Option+Shift+S on a Mac) or click the icon.
2. Drag a box over what you want. `Esc` cancels.
3. Use the panel: Copy, Copy image, Translate, Brief, Search or Ask.

The text in the panel is real text, so you can fix it, select part of it and right-click it.

Translation goes both ways by itself: Arabic to English, anything else to Arabic.

## Brief

Brief gives you a short explanation of your selection. It works two ways:

- **With no key (free):** it copies a ready-made request and opens your chat. Paste it and send, and your Claude plan answers it. If you selected a picture with no text, it copies the picture instead.
- **With an API key:** the answer appears in the panel, and it can read diagrams and pictures. API use is billed separately from a Claude chat plan.

To add a key, create one at [console.anthropic.com](https://console.anthropic.com), add credit, then save it under Details, Extension options. A low spending limit is a good idea. The key is stored only in this browser profile, and anyone with access to that profile could read it.

## Looks

The first time you use it, a small window asks you to choose a look. Change it any time with the **Look** button in the panel, or in the extension's settings.

- **Windows:** the default, following Microsoft's Fluent design.
- **Mac:** frosted glass, window buttons and a live selection size, in the style of macOS.
- **Linux:** a clean header bar in the style of GNOME's Adwaita.
- **Print:** an instant print that develops while the text is read, with handwriting.

Windows, Mac and Linux follow your light or dark mode. They use their real system fonts where those are installed, and your computer's default font otherwise.

## Settings

- **Shortcut:** change it at `brave://extensions/shortcuts`. If `Alt+Shift+S` does nothing, it may be taken by another extension, so set one there.
- **Ask and Brief:** open the extension's Details page, then Extension options, to switch Ask between Claude and ChatGPT, and Brief between Opus and Haiku.

## Limits

- Protected streaming sites such as Netflix show as a black picture, so no text can be read there.
- Brave blocks extensions on its own pages and the Chrome Web Store. The icon shows `!` there.
- Blurry, tiny or stylised text can be misread, and Arabic more often than English. Fix it in the panel.
- Copy image needs an `https` page.
- Videos embedded from another site may keep playing while you select.
- Translate sends the panel text to Google, and Brief sends your selection to Anthropic, only when you press them. Everything else stays on your computer.

## Fonts

The handwriting uses Caveat and Aref Ruqaa, both under the SIL Open Font License.

## Development

```bash
npm install
npm run vendor
npm test
npm run e2e
npm run package
```

`npm run package` writes `dist/screen-select.zip`, ready to share or to upload to the Chrome Web Store.
