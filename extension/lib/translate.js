const ARABIC_LETTER = /\p{Script=Arabic}/gu;
const ANY_LETTER = /\p{L}/gu;
const MIXED_MIN_SHARE = 0.1;

export function arabicShare(text) {
  const letters = text.match(ANY_LETTER)?.length ?? 0;
  const arabic = text.match(ARABIC_LETTER)?.length ?? 0;
  return letters > 0 ? arabic / letters : 0;
}

export function targetLang(text) {
  return arabicShare(text) > 0.5 ? 'en' : 'ar';
}

export function hasTwoLanguages(text) {
  const share = arabicShare(text);
  return share >= MIXED_MIN_SHARE && share <= 1 - MIXED_MIN_SHARE;
}

// With sl=auto, Google calls mixed text one language and can return it unchanged.
export function sourceLang(target) {
  return target === 'ar' ? 'en' : 'ar';
}

export function buildTranslateUrl(text, target, source = 'auto') {
  const params = new URLSearchParams({ client: 'gtx', sl: source, dt: 't', tl: target, q: text });
  return `https://translate.googleapis.com/translate_a/single?${params}`;
}

export function parseTranslateResponse(json) {
  if (!Array.isArray(json) || !Array.isArray(json[0])) {
    throw new Error('Unexpected translation response');
  }
  return json[0].map((segment) => segment[0]).join('');
}

export function fallbackUrl(text, target, source = 'auto') {
  const params = new URLSearchParams({ sl: source, tl: target, text, op: 'translate' });
  return `https://translate.google.com/?${params}`;
}
