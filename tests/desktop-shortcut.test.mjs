import assert from 'node:assert/strict';
import test from 'node:test';
import { shortcutFromKeys, shortcutLabel } from '../desktop/shortcut.mjs';

const press = (code, held = {}) => ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...held });

test('a letter with modifiers becomes a shortcut', () => {
  assert.equal(shortcutFromKeys(press('KeyQ', { ctrlKey: true, shiftKey: true }), false), 'Ctrl+Shift+Q');
  assert.equal(shortcutFromKeys(press('KeyD', { altKey: true, shiftKey: true }), false), 'Alt+Shift+D');
});

test('the Mac uses Command and Control', () => {
  assert.equal(shortcutFromKeys(press('KeyQ', { metaKey: true, shiftKey: true }), true), 'Command+Shift+Q');
  assert.equal(shortcutFromKeys(press('Digit1', { ctrlKey: true }), true), 'Control+1');
});

test('the key is read by its place, so other layouts and Shift still work', () => {
  assert.equal(shortcutFromKeys(press('Digit2', { altKey: true, shiftKey: true }), false), 'Alt+Shift+2');
  assert.equal(shortcutFromKeys(press('ArrowUp', { ctrlKey: true }), false), 'Ctrl+Up');
});

test('it waits while only modifiers are held', () => {
  assert.equal(shortcutFromKeys(press('ShiftLeft', { shiftKey: true }), false), null);
  assert.equal(shortcutFromKeys(press('ControlLeft', { ctrlKey: true }), false), null);
});

test('a plain key or Shift alone is refused, but F keys are fine', () => {
  assert.equal(shortcutFromKeys(press('KeyA'), false), null);
  assert.equal(shortcutFromKeys(press('KeyA', { shiftKey: true }), false), null);
  assert.equal(shortcutFromKeys(press('F9'), false), 'F9');
});

test('labels use the names on the keyboard', () => {
  assert.equal(shortcutLabel('Alt+Shift+D', false), 'Alt+Shift+D');
  assert.equal(shortcutLabel('Alt+Shift+D', true), 'Option+Shift+D');
  assert.equal(shortcutLabel('Command+Control+Q', true), 'Cmd+Ctrl+Q');
  assert.equal(shortcutLabel('Super+Q', false), 'Win+Q');
});
