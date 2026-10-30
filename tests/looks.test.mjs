import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/lib/looks.js';

const { LOOKS, normalizeLook, cardMarkup } = globalThis.ScreenSelectLooks;

test('offers the four looks, Windows first', () => {
  assert.deepEqual(
    LOOKS.map((look) => look.id),
    ['windows', 'mac', 'linux', 'print'],
  );
});

test('the old Basic setting becomes Windows', () => assert.equal(normalizeLook('basic'), 'windows'));
test('an unknown look becomes Windows', () => assert.equal(normalizeLook('nope'), 'windows'));
test('a missing look becomes Windows', () => assert.equal(normalizeLook(undefined), 'windows'));
test('known looks stay the same', () => assert.equal(normalizeLook('linux'), 'linux'));

test('each preview names its look', () => {
  for (const look of LOOKS) assert.match(cardMarkup(look.id), new RegExp(`preview-${look.id}`));
});
