import test from 'node:test';
import assert from 'node:assert/strict';
import {
  targetLang,
  arabicShare,
  buildTranslateUrl,
  parseTranslateResponse,
  fallbackUrl,
} from '../extension/lib/translate.js';

test('Arabic goes to English', () => assert.equal(targetLang('مرحبا بالعالم'), 'en'));
test('English goes to Arabic', () => assert.equal(targetLang('hello world'), 'ar'));
test('mostly English with one Arabic word goes to Arabic', () =>
  assert.equal(targetLang('the word مرحبا means hello'), 'ar'));
test('empty text goes to Arabic', () => assert.equal(targetLang(''), 'ar'));

test('arabicShare measures Arabic letters only', () => {
  assert.equal(arabicShare('300 732015 upon'), 0);
  assert.equal(arabicShare('مرحبا 123'), 1);
  assert.equal(arabicShare(''), 0);
});

test('parse joins segments', () =>
  assert.equal(parseTranslateResponse([[['مرحبا ', 'hello '], ['عالم', 'world']]]), 'مرحبا عالم'));
test('parse throws on unexpected shape', () => assert.throws(() => parseTranslateResponse({})));

test('URLs encode text', () => {
  assert.match(buildTranslateUrl('a&b', 'ar'), /tl=ar/);
  assert.match(buildTranslateUrl('a&b', 'ar'), /q=a%26b/);
  assert.match(fallbackUrl('a&b', 'ar'), /^https:\/\/translate\.google\.com\/\?.*text=a%26b/);
});
