import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/lib/crop.js';

const { toImageRect, isUsableDrag, upscaleFactor, fitWithin } = globalThis.ScreenSelectCrop;

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

test('shrinks only images over the size limit', () => {
  assert.deepEqual(fitWithin(800, 600, 1568), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(3136, 1000, 1568), { width: 1568, height: 500 });
  assert.deepEqual(fitWithin(1000, 3136, 1568), { width: 500, height: 1568 });
});

const { adjustRect } = globalThis.ScreenSelectCrop;
const BOX = { x: 100, y: 100, width: 200, height: 50 };

test('dragging inside the box moves it without changing its size', () =>
  assert.deepEqual(adjustRect(BOX, 'move', 30, -20, 1000, 800), { x: 130, y: 80, width: 200, height: 50 }));

test('a moved box stays on screen', () => {
  assert.deepEqual(adjustRect(BOX, 'move', -500, 900, 1000, 800), { x: 0, y: 750, width: 200, height: 50 });
});

test('a corner handle resizes from that corner only', () => {
  assert.deepEqual(adjustRect(BOX, 'se', 40, 30, 1000, 800), { x: 100, y: 100, width: 240, height: 80 });
  assert.deepEqual(adjustRect(BOX, 'nw', -40, -30, 1000, 800), { x: 60, y: 70, width: 240, height: 80 });
});

test('a side handle changes one direction only', () => {
  assert.deepEqual(adjustRect(BOX, 'e', 50, 99, 1000, 800), { x: 100, y: 100, width: 250, height: 50 });
  assert.deepEqual(adjustRect(BOX, 'n', 99, -10, 1000, 800), { x: 100, y: 90, width: 200, height: 60 });
});

test('dragging an edge past the other side flips the box', () =>
  assert.deepEqual(adjustRect(BOX, 'w', 250, 0, 1000, 800), { x: 300, y: 100, width: 50, height: 50 }));

const { eraseRuleLines } = globalThis.ScreenSelectCrop;

function picture(width, height, darkAt) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (darkAt(x, y)) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    }
  }
  return { data, width, height };
}
const isDark = (image, x, y) => image.data[(y * image.width + x) * 4] < 128;

test('thin table borders are painted over', () => {
  const image = picture(100, 60, (x, y) => y === 30 || x === 50 || (x > 10 && x < 14 && y > 5 && y < 20));
  assert.equal(eraseRuleLines(image), 2);
  assert.equal(isDark(image, 20, 30), false);
  assert.equal(isDark(image, 50, 10), false);
  assert.equal(isDark(image, 12, 10), true, 'a letter stays');
});

test('tall letters in one line of text are kept', () => {
  // Stems of letters like l and h run most of the way down a tight selection, but with gaps.
  const image = picture(100, 40, (x, y) => (x % 12 === 0 && y > 2 && y < 34) || (x % 12 === 6 && y > 12 && y < 34));
  assert.equal(eraseRuleLines(image), 0);
  assert.equal(isDark(image, 12, 20), true);
});

test('a thick shaded band is kept', () => {
  const image = picture(100, 60, (_x, y) => y >= 10 && y < 30);
  assert.equal(eraseRuleLines(image), 0);
  assert.equal(isDark(image, 50, 20), true);
});
