import test from 'node:test';
import assert from 'node:assert/strict';
import {
  targetLang,
  arabicShare,
  buildTranslateUrl,
  parseTranslateResponse,
  fallbackUrl,
  hasTwoLanguages,
  sourceLang,
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

test('text with a real mix counts as two languages', () => {
  assert.equal(hasTwoLanguages('The price is high السعر مرتفع جدا'), true);
  assert.equal(hasTwoLanguages('the word مرحبا means hello'), true);
});
test('one language stays automatic', () => {
  assert.equal(hasTwoLanguages('hello world'), false);
  assert.equal(hasTwoLanguages('مرحبا بالعالم'), false);
  assert.equal(hasTwoLanguages('123'), false);
});
test('a chosen language translates from the other one', () => {
  assert.equal(sourceLang('ar'), 'en');
  assert.equal(sourceLang('en'), 'ar');
  assert.match(buildTranslateUrl('hi', 'ar', sourceLang('ar')), /sl=en&.*tl=ar/);
  assert.match(fallbackUrl('hi', 'en', sourceLang('en')), /sl=ar&tl=en/);
});
test('the source stays automatic unless chosen', () => {
  assert.match(buildTranslateUrl('hi', 'ar'), /sl=auto/);
  assert.match(fallbackUrl('hi', 'ar'), /sl=auto/);
});

test('parse joins segments', () =>
  assert.equal(parseTranslateResponse([[['مرحبا ', 'hello '], ['عالم', 'world']]]), 'مرحبا عالم'));
test('parse throws on unexpected shape', () => assert.throws(() => parseTranslateResponse({})));

test('URLs encode text', () => {
  assert.match(buildTranslateUrl('a&b', 'ar'), /tl=ar/);
  assert.match(buildTranslateUrl('a&b', 'ar'), /q=a%26b/);
  assert.match(fallbackUrl('a&b', 'ar'), /^https:\/\/translate\.google\.com\/\?.*text=a%26b/);
});
