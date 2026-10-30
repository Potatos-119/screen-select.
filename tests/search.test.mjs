import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiSearchUrl } from '../extension/lib/search.js';

test('search goes to Google AI Mode', () => {
  const url = new URL(aiSearchUrl('what is an agent'));
  assert.equal(url.origin + url.pathname, 'https://www.google.com/search');
  assert.equal(url.searchParams.get('udm'), '50');
  assert.equal(url.searchParams.get('q'), 'what is an agent');
});

test('Arabic and symbols survive the address', () => {
  assert.equal(new URL(aiSearchUrl('ما هو AI & ML؟')).searchParams.get('q'), 'ما هو AI & ML؟');
});

test('very long text is cut to fit an address', () => {
  assert.equal(new URL(aiSearchUrl('a'.repeat(5000))).searchParams.get('q').length, 1000);
});

test('the search permission is no longer needed', () => {
  const manifest = JSON.parse(readFileSync('extension/manifest.json'));
  assert.equal(manifest.permissions.includes('search'), false);
});
