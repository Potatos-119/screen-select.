import test from 'node:test';
import assert from 'node:assert/strict';
import { createSseReader } from '../extension/lib/stream.js';

const collect = () => {
  const events = [];
  return { events, feed: createSseReader((event) => events.push(event)) };
};

test('reads events that arrive whole', () => {
  const { events, feed } = collect();
  feed('data: {"a":1}\n\ndata: {"a":2}\n\n');
  assert.deepEqual(events, [{ a: 1 }, { a: 2 }]);
});

test('joins an event split across two chunks', () => {
  const { events, feed } = collect();
  feed('data: {"a"');
  assert.deepEqual(events, []);
  feed(':1}\n');
  assert.deepEqual(events, [{ a: 1 }]);
});

test('skips the end marker, event names and broken lines', () => {
  const { events, feed } = collect();
  feed('event: ping\ndata: [DONE]\ndata: not json\ndata: {"a":1}\n');
  assert.deepEqual(events, [{ a: 1 }]);
});
