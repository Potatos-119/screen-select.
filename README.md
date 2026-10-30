# Screen Select

Select text from anything on screen in Brave, even inside a video, then copy, translate, search or ask AI.

## Install

1. Open `brave://extensions` in Brave.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder.
4. Optional: click the puzzle icon in the toolbar and pin Screen Select.

Keep the `extension` folder where it is. Brave loads it from there each time.

## Use

1. Press `Alt+Shift+S` (Option+Shift+S on a Mac) or click the icon.
2. Drag a box over what you want. `Esc` cancels.
3. Use the panel: Copy, Copy image, Translate, Search or Ask.

The text in the panel is real text, so you can fix it, select part of it and right-click it.

Translation goes both ways by itself: Arabic to English, anything else to Arabic.

## Settings

- **Shortcut:** change it at `brave://extensions/shortcuts`. If `Alt+Shift+S` does nothing, it may be taken by another extension, so set one there.
- **Ask button:** open the extension's Details page, then Extension options, to switch between Claude and ChatGPT.

## Limits

- Protected streaming sites such as Netflix show as a black picture, so no text can be read there.
- Brave blocks extensions on its own pages and the Chrome Web Store. The icon shows `!` there.
- Blurry, tiny or stylised text can be misread, and Arabic more often than English. Fix it in the panel.
- Copy image needs an `https` page.
- Videos embedded from another site may keep playing while you select.
- Translate sends the panel text to Google, only when you press it. Everything else stays on your computer.

## Development

```bash
npm install
npm run vendor
npm test
npm run e2e
```
