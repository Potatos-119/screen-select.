# Windows desktop app: handoff

Read this first if you are a Claude Code session on the Windows PC.

## What exists

- `extension/` is the Chrome, Edge and Brave extension, at version 1.17.0 on `main`.
  It reads text in any selected area with Tesseract (English and Arabic), and can copy, translate, brief, search and read it.
  It also finds tables, lets you move and resize the selection box, and uses a free shared NVIDIA AI from `proxy/`.
- `desktop/` (this branch only) is an Electron app that runs the same extension code outside the browser.
  It was built and tested on a Mac:
  - It lives in the menu bar, and `Alt+Shift+D` (Option+Shift+D on a Mac) opens the selection overlay.
  - It reads text with Apple Vision on a Mac, and falls back to Tesseract by loading `extension/offscreen.html` in a hidden window.
  - `chrome-shim.mjs` stands in for the `chrome` APIs that `extension/background.js` uses.
  - `store.mjs` saves settings to a file, with API keys encrypted by Electron's `safeStorage`.
- The plan: https://claude.ai/artifact/8CgDY9fsbf7yG9571rCADD (step 3 is Windows).

## First step

This branch is behind `main`. Before anything else:

```bash
git checkout feature/desktop-mac
git merge main
```

`main` changed `extension/offscreen.js` (it now returns `{ text, table }`), `extension/background.js`,
`extension/lib/brief.js`, `extension/overlay.js` and `extension/options.*`. Check that `desktop/` still works with them.
Then make a branch for this work, for example `feature/desktop-windows`.

## Goal

A Windows version of the desktop app that anyone can download and use for free.

- Use Tesseract for text on Windows. Vision is Mac only, and Windows OCR is not needed for now.
- Shortcut `Alt+Shift+D`, a tray icon instead of the menu bar, and an overlay over the whole screen.
  Check it on more than one monitor and at 125% and 150% display scaling.
- Package with electron-builder. Add a `win` section to `desktop/package.json` with an NSIS installer and a portable `.exe`.
  The icon needs a Windows `.ico` or a 256px PNG. `prepare.mjs` only makes the icon on a Mac today.
- Share it free through GitHub Releases. It is unsigned, so Windows SmartScreen shows "Windows protected your PC".
  The README must tell people to click **More info**, then **Run anyway**.
  The Microsoft Store can come later.
- Keys are saved through `safeStorage`, which uses Windows DPAPI. Check that saving, reading and removing a key works.

## How to check it

```bash
npm install
npm test
cd desktop
npm install
npm start
npm test
```

`npm test` in the root runs the logic tests. `npm test` in `desktop/` runs the Electron tests in `tests/desktop/entry.mjs`.
Test on the real screen:

- Select text on the desktop, in another app, and over a video.
- Select a table and translate it.
- Move and resize the selection box.
- Brief with no key, which uses the free shared AI.
- Save a key, close the app, open it again and check the key is still saved.

## Rules from the owner

- Commits must look like the owner's own. No Claude attribution: no Co-Authored-By line, no "Generated with" line.
- Check the git branch before every commit.
- Never ask the owner to paste an API key in the chat. Keys go in the app's settings or in the Terminal only.
- Write commit messages and docs in the same plain style as the existing ones.
