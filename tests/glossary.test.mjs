import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGlossary, matchGlossary, parseGlossary } from '../extension/lib/glossary.js';

const entries = parseGlossary('Full-Stack = فول ستاك\n\nno equals here\n = empty\nC++ = سي بلس بلس');

test('reads one entry per line and skips bad lines', () => {
  assert.deepEqual(entries, [
    { from: 'Full-Stack', to: 'فول ستاك' },
    { from: 'C++', to: 'سي بلس بلس' },
  ]);
  assert.deepEqual(parseGlossary(undefined), []);
});

test('finds only the words in the text, ignoring case', () => {
  assert.deepEqual(matchGlossary('java full-stack', entries, 'ar'), [{ source: 'Full-Stack', result: 'فول ستاك' }]);
});

test('works in both directions', () => {
  assert.deepEqual(matchGlossary('مطور فول ستاك', entries, 'en'), [{ source: 'فول ستاك', result: 'Full-Stack' }]);
});

test('a word inside a longer word does not match', () => {
  assert.deepEqual(matchGlossary('Full-Stacks', entries, 'ar'), []);
});

test('symbols in a word are safe', () => {
  assert.equal(matchGlossary('I use C++ daily', entries, 'ar').length, 1);
});

test('swaps the words into the text', () => {
  const matches = matchGlossary('java Full-Stack and full-stack', entries, 'ar');
  assert.equal(applyGlossary('java Full-Stack and full-stack', matches), 'java فول ستاك and فول ستاك');
});

test('no glossary leaves the text alone', () => {
  assert.equal(applyGlossary('hello', []), 'hello');
});
