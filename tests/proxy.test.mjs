import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { MAX_TOKENS, MODEL, cleanBody } from '../proxy/worker.js';
import { buildBriefRequest, buildTranslationRequest, describeBriefError, usesSharedAi } from '../extension/lib/brief.js';

const ORIGIN = `chrome-extension://${'a'.repeat(32)}`;
const URL_ = 'https://screen-select-ai.example.workers.dev/v1/chat/completions';
const allow = { limit: async () => ({ success: true }) };
const deny = { limit: async () => ({ success: false }) };

function call(body, { origin = ORIGIN, env = {}, method = 'POST', url = URL_ } = {}) {
  const request = new Request(url, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  return worker.fetch(request, { NVIDIA_API_KEY: 'owner-key', PER_PERSON: allow, EVERYONE: allow, ...env });
}

async function withNvidia(answer, run) {
  const real = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url, init });
    return answer();
  };
  try {
    return { response: await run(), sent };
  } finally {
    globalThis.fetch = real;
  }
}

const MESSAGES = [{ role: 'user', content: 'hello' }];

test('only the one model and short answers are allowed', () => {
  assert.deepEqual(cleanBody({ model: 'other/huge-model', max_tokens: 99999, messages: MESSAGES, tools: [1] }), {
    model: MODEL,
    messages: MESSAGES,
    stream: false,
    max_tokens: MAX_TOKENS,
    chat_template_kwargs: { enable_thinking: false },
  });
  assert.equal(cleanBody({ messages: [] }), null);
  assert.equal(cleanBody(null), null);
});

test('a request from the extension goes to NVIDIA with the owner key', async () => {
  const { response, sent } = await withNvidia(
    () => Response.json({ choices: [{ message: { content: 'hi' } }] }),
    () => call({ model: 'x', messages: MESSAGES, stream: false }),
  );
  assert.equal(response.status, 200);
  assert.equal(sent[0].url, 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(sent[0].init.headers.authorization, 'Bearer owner-key');
  assert.equal(JSON.parse(sent[0].init.body).model, MODEL);
  assert.equal((await response.json()).choices[0].message.content, 'hi');
});

test('websites and other tools are turned away', async () => {
  assert.equal((await call({ messages: MESSAGES }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call({ messages: MESSAGES }, { origin: '' })).status, 403);
});

test('a list of extension IDs limits it to those', async () => {
  const env = { EXTENSION_IDS: 'b'.repeat(32) };
  assert.equal((await call({ messages: MESSAGES }, { env })).status, 403);
});

test('too many requests are refused without reaching NVIDIA', async () => {
  const { response, sent } = await withNvidia(
    () => Response.json({}),
    () => call({ messages: MESSAGES }, { env: { PER_PERSON: deny } }),
  );
  assert.equal(response.status, 429);
  assert.equal(sent.length, 0);
});

test('bad requests and wrong paths are refused', async () => {
  assert.equal((await call({ nothing: true })).status, 400);
  assert.equal((await call(null, { method: 'GET' })).status, 405);
  assert.equal((await call({ messages: MESSAGES }, { url: 'https://x.workers.dev/other' })).status, 404);
  assert.equal((await call({ messages: MESSAGES }, { env: { NVIDIA_API_KEY: '' } })).status, 503);
});

test('a problem with the owner key is not blamed on the person', async () => {
  const { response } = await withNvidia(
    () => new Response('{}', { status: 401 }),
    () => call({ messages: MESSAGES }),
  );
  assert.equal(response.status, 503);
});

test('with no NVIDIA key, requests go to the shared AI without a key', () => {
  assert.equal(usesSharedAi('nvidia', '', URL_), true);
  assert.equal(usesSharedAi(undefined, '', URL_), true, 'NVIDIA is the default');
  assert.equal(usesSharedAi('nvidia', 'my-key', URL_), false);
  assert.equal(usesSharedAi('gemini', '', URL_), false);
  assert.equal(usesSharedAi('nvidia', '', ''), false, 'off until the Worker is deployed');

  const translation = buildTranslationRequest({ apiKey: '', model: 'nvidia', text: 'hi', target: 'ar', sharedUrl: URL_ });
  assert.equal(translation.url, URL_);
  assert.equal(translation.init.headers.authorization, undefined);

  const brief = buildBriefRequest({ apiKey: '', model: 'nvidia', text: 'hi', imageDataUrl: 'data:image/jpeg;base64,AA', sharedUrl: URL_ });
  assert.equal(brief.url, URL_);

  const own = buildTranslationRequest({ apiKey: 'my-key', model: 'nvidia', text: 'hi', target: 'ar', sharedUrl: URL_ });
  assert.equal(own.url, 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(own.init.headers.authorization, 'Bearer my-key');
});

test('a busy shared AI suggests adding your own key', () => {
  assert.match(describeBriefError(429, null, 'nvidia', true), /free AI is busy.*your own free NVIDIA key/);
  assert.match(describeBriefError(429, null, 'nvidia', false), /your API rate limit/);
});
