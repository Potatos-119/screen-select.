// Passes Screen Select's AI requests to NVIDIA with the owner's key, which stays a Cloudflare secret.
// Only the one model is allowed, answers are capped, and each person gets a few requests a minute,
// so nobody can use the key for anything else or spend all its credits.
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';
export const MAX_TOKENS = 2000;
// A brief carries one picture of at most 1568 pixels, which stays well under this.
export const MAX_BODY_BYTES = 4_000_000;
const PATH = '/v1/chat/completions';
const EXTENSION_ORIGIN = /^(chrome-extension|extension):\/\/[a-z]{32}$/;

const reply = (status, message) => Response.json({ error: { message } }, { status });

// Keeps only what Screen Select sends, so the key can't be used for other models or long answers.
export function cleanBody(body) {
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) return null;
  return {
    model: MODEL,
    messages: body.messages,
    stream: body.stream === true,
    max_tokens: Math.min(Number(body.max_tokens) || MAX_TOKENS, MAX_TOKENS),
    chat_template_kwargs: { enable_thinking: false },
  };
}

function allowedOrigin(origin, env) {
  if (!EXTENSION_ORIGIN.test(origin ?? '')) return false;
  const ids = (env.EXTENSION_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  return ids.length === 0 || ids.some((id) => origin.endsWith(`://${id}`));
}

async function overLimit(env, person) {
  const checks = [env.PER_PERSON?.limit({ key: person }), env.EVERYONE?.limit({ key: 'everyone' })];
  const results = await Promise.all(checks.filter(Boolean));
  return results.some((result) => !result.success);
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== PATH) return reply(404, 'Not found.');
    if (request.method !== 'POST') return reply(405, 'Use POST.');
    if (!allowedOrigin(request.headers.get('origin'), env)) return reply(403, 'Only Screen Select can use this.');
    if (!env.NVIDIA_API_KEY) return reply(503, 'The free AI is not set up yet.');
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return reply(413, 'The selection is too big.');

    const person = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (await overLimit(env, person)) return reply(429, 'The free AI is busy. Wait a minute and try again.');

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reply(413, 'The selection is too big.');
    let body;
    try {
      body = cleanBody(JSON.parse(raw));
    } catch {
      body = null;
    }
    if (!body) return reply(400, 'The request was not understood.');

    const upstream = await fetch(NVIDIA_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: body.stream ? 'text/event-stream' : 'application/json',
        authorization: `Bearer ${env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    // NVIDIA's own key errors are about the owner's key, not the person using the extension.
    if (upstream.status === 401 || upstream.status === 403 || upstream.status === 402) {
      return reply(503, 'The free AI is not available right now.');
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  },
};
