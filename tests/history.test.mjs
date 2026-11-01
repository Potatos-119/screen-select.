import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, safeLink, saveEntry } from '../extension/lib/history.js';

test('the newest entry comes first', () => {
  assert.deepEqual(saveEntry([{ id: 'a' }], { id: 'b' }).map((entry) => entry.id), ['b', 'a']);
});

test('saving the same selection updates it', () => {
  const history = saveEntry([{ id: 'a', text: 'old' }, { id: 'b' }], { id: 'a', text: 'new' });
  assert.equal(history.length, 2);
  assert.equal(history[0].text, 'new');
});

test('old entries drop off at the limit', () => {
  const history = saveEntry([{ id: 'a' }, { id: 'b' }], { id: 'c' }, 2);
  assert.deepEqual(history.map((entry) => entry.id), ['c', 'a']);
});

test('search looks through text, translations and answers', () => {
  const entry = { text: 'Hello', translation: 'مرحبا', title: 'Page', turns: [{ question: 'why', answer: 'Because' }] };
  for (const word of ['hello', 'مرحبا', 'page', 'WHY', 'because', '']) assert.equal(matchesSearch(entry, word), true);
  assert.equal(matchesSearch(entry, 'nothing'), false);
});

test('search handles an entry with only text', () => assert.equal(matchesSearch({ text: 'x' }, 'x'), true));

test('only web links are shown', () => {
  assert.equal(safeLink('https://example.com/'), 'https://example.com/');
  assert.equal(safeLink('javascript:alert(1)'), '');
  assert.equal(safeLink(undefined), '');
});
