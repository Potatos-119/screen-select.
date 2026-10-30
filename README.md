# Screen Select

I got tired of pausing a video, taking a screenshot and pasting it into a chat just to ask about one line on the screen. So I made this.

Press a shortcut, drag a box over anything in the tab, even a video, and you get the text. Then you can copy it, translate it, search it or ask AI about it.

It's made for Chrome and Brave.

## Install

It isn't on the Chrome Web Store, so you load it yourself. It only takes a minute, and you won't need Git, npm or the Terminal.

1. On this GitHub page, click the green **Code** button, then **Download ZIP**.
2. Unzip it and put the folder somewhere you won't delete it, like Documents.
3. Open `chrome://extensions` and turn on **Developer mode** (top right). Brave accepts this address too.
4. Click **Load unpacked** and pick the `extension` folder inside.
5. Click the puzzle icon in the toolbar and pin Screen Select, if you want it close by.

The browser reads the extension from that folder every time it starts, so if you delete the folder it stops working.

To update, download it again, replace the folder, and press the reload icon on Screen Select in `chrome://extensions`.

## Use

1. Press `Alt+Shift+S` (Option+Shift+S on a Mac) or click the icon.
2. Drag a box over what you want. `Esc` cancels.
3. Pick something in the panel: Copy, Copy image, Translate, Brief, Search or Ask.

The text in the panel is real text. If it misread a word you can just fix it, and you can select part of it and right-click like anywhere else.

Translate works out the direction by itself. Arabic goes to English and everything else goes to Arabic. If you grab Arabic and English together by mistake, it asks which one you want.

## Brief

Brief explains what you selected in a few sentences, right there in the panel. It needs an API key, and you pick the service under Details, then Extension options.

| Option | Cost |
|---|---|
| NVIDIA Nemotron (default) | Free trial with limited credits |
| Claude Opus or Haiku | Paid per use, separate from a Claude chat plan |

I tried a few of NVIDIA's free models and kept Nemotron because it's fast and it can see the picture.

To set up the free one:

1. Make an account at [build.nvidia.com](https://build.nvidia.com) and generate an API key.
2. Open the extension's Details page, then Extension options.
3. Paste the key under **Your NVIDIA API key** and click **Save NVIDIA key**.

Don't have a key? Brief will ask, and you can add one or copy a request and open your chat instead. If a service takes more than 25 seconds, Brief gives up and tells you.

Your key stays in this browser profile, which also means anyone who can open that profile can read it.

## Looks

The first time you use it, a small window asks you to pick a look. You can change your mind later with the **Look** button in the panel or in the settings.

Windows is the default and follows Microsoft's Fluent design. Mac has frosted glass and the three window buttons. Linux looks like GNOME. Print is my favourite: your selection comes out as an instant photo with handwriting on it.

The first three follow your light or dark mode. They use the real system fonts if you have them and your computer's default font if you don't.

## Settings

You can change the shortcut at `chrome://extensions/shortcuts`. If `Alt+Shift+S` does nothing, another extension probably took it, so set a new one there.

Extension options is also where you switch Ask between Claude and ChatGPT.

## What it can't do

- Netflix and other protected sites show up as a black picture, so there's nothing to read.
- Browsers don't let extensions run on their own pages or the Chrome Web Store. The icon shows `!` there.
- Blurry, tiny or fancy text can come out wrong, and Arabic more often than English.
- Capital I and small l look the same in a lot of fonts. It fixes "Al" to "AI" most of the time, but a title like "Al Revolution" can slip through.
- Copy image needs an `https` page.
- A video embedded from another site may keep playing while you select.

## Privacy

Translate sends the panel text to Google. Brief sends your selection, picture included, to the service you picked. Both happen only when you press the button, and everything else stays on your computer.

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
