# Free shared AI

This small Cloudflare Worker lets people use Translate and Brief with NVIDIA without making their own key.
Your NVIDIA key is saved as a Cloudflare secret, so it is never in the code, on GitHub or inside the extension.

It only allows the one Nemotron model, caps every answer at 2000 tokens, and lets each person make 10
requests a minute and everyone together 120. Change those numbers in `wrangler.toml`.

Cloudflare's free plan covers 100,000 requests a day.

## Set it up

You need a free Cloudflare account. Run these in this `proxy` folder:

```bash
npx wrangler login
```

```bash
npx wrangler secret put NVIDIA_API_KEY
```

It asks for the key in the Terminal. Paste it there, never in a chat or a file.

```bash
npx wrangler deploy
```

It prints an address like `https://screen-select-ai.<you>.workers.dev`. Put that address, followed by
`/v1/chat/completions`, in `SHARED_AI_URL` at the top of `extension/lib/brief.js`.

Once the extension has a fixed ID (after it's published in a store), you can lock the Worker to it:

```bash
npx wrangler secret put EXTENSION_IDS
```

Give it the ID, or several separated by commas.

## Change the key

Run `npx wrangler secret put NVIDIA_API_KEY` again. Nobody needs to update the extension.
