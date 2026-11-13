// Turns a key press into a shortcut Electron understands, and back into words people know.
export const DEFAULT_SHORTCUT = 'Alt+Shift+D';

const KEY_NAMES = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
};

// `code` is the key's place on the keyboard, so Shift+1 stays 1 and an Arabic layout still gives A to Z.
function keyName(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return KEY_NAMES[code];
}

// Returns null until the keys make a whole shortcut, so the box can wait for the last key.
export function shortcutFromKeys({ code, ctrlKey, altKey, shiftKey, metaKey }, isMac) {
  const key = keyName(code);
  if (!key) return null;
  const modifiers = [];
  if (isMac) {
    if (metaKey) modifiers.push('Command');
    if (ctrlKey) modifiers.push('Control');
  } else {
    if (ctrlKey) modifiers.push('Ctrl');
    if (metaKey) modifiers.push('Super');
  }
  if (altKey) modifiers.push('Alt');
  if (shiftKey) modifiers.push('Shift');
  // Shift alone would take a capital letter away from every app.
  const onlyShift = modifiers.length === 1 && shiftKey;
  if (!/^F\d+$/.test(key) && (!modifiers.length || onlyShift)) return null;
  return [...modifiers, key].join('+');
}

export function shortcutLabel(shortcut, isMac) {
  if (!isMac) return shortcut.replace('Super', 'Win');
  return shortcut.replace('Command', 'Cmd').replace('Alt', 'Option').replace('Control', 'Ctrl');
}
