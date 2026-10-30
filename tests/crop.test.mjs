import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/lib/crop.js';

const { toImageRect, isUsableDrag, upscaleFactor } = globalThis.ScreenSelectCrop;

test('maps a rect at 2x', () =>
  assert.deepEqual(toImageRect({ x: 10, y: 20, width: 30, height: 40 }, 100, 100, 200, 200), {
    x: 20,
    y: 40,
    width: 60,
    height: 80,
  }));

test('maps a rect with browser zoom, where the ratio is not a whole number', () =>
  assert.deepEqual(toImageRect({ x: 10, y: 10, width: 10, height: 10 }, 800, 600, 1000, 750), {
    x: 13,
    y: 13,
    width: 12,
    height: 12,
  }));

test('clamps to the image', () =>
  assert.deepEqual(toImageRect({ x: 90, y: 90, width: 50, height: 50 }, 100, 100, 100, 100), {
    x: 90,
    y: 90,
    width: 10,
    height: 10,
  }));

test('rejects tiny drags', () => {
  assert.equal(isUsableDrag({ width: 3, height: 50 }), false);
  assert.equal(isUsableDrag({ width: 20, height: 20 }), true);
});

test('upscales short crops only', () => {
  assert.equal(upscaleFactor(100), 2);
  assert.equal(upscaleFactor(800), 1);
});
