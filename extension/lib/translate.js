const ARABIC_LETTER = /\p{Script=Arabic}/gu;
const ANY_LETTER = /\p{L}/gu;

export function arabicShare(text) {
  const letters = text.match(ANY_LETTER)?.length ?? 0;
  const arabic = text.match(ARABIC_LETTER)?.length ?? 0;
  return letters > 0 ? arabic / letters : 0;
}

export function targetLang(text) {
  return arabicShare(text) > 0.5 ? 'en' : 'ar';
}

export function buildTranslateUrl(text, target) {
  const params = new URLSearchParams({ client: 'gtx', sl: 'auto', dt: 't', tl: target, q: text });
  return `https://translate.googleapis.com/translate_a/single?${params}`;
}

export function parseTranslateResponse(json) {
  if (!Array.isArray(json) || !Array.isArray(json[0])) {
    throw new Error('Unexpected translation response');
  }
  return json[0].map((segment) => segment[0]).join('');
}

export function fallbackUrl(text, target) {
  const params = new URLSearchParams({ sl: 'auto', tl: target, text, op: 'translate' });
  return `https://translate.google.com/?${params}`;
}
