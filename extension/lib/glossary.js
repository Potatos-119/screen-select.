import { arabicShare } from './translate.js';

export function parseGlossary(raw = '') {
  return raw
    .split('\n')
    .map((line) => {
      const split = line.indexOf('=');
      return split < 0 ? null : { from: line.slice(0, split).trim(), to: line.slice(split + 1).trim() };
    })
    .filter((entry) => entry?.from && entry.to);
}

function wordPattern(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
}

// An entry works both ways, so its Arabic side is the one used when translating to Arabic.
function forTarget({ from, to }, target) {
  const toIsArabic = arabicShare(to) > 0.5;
  const fromIsArabic = arabicShare(from) > 0.5;
  if (toIsArabic === fromIsArabic) return { source: from, result: to };
  return (target === 'ar') === toIsArabic ? { source: from, result: to } : { source: to, result: from };
}

export function matchGlossary(text, entries, target) {
  return entries.map((entry) => forTarget(entry, target)).filter(({ source }) => text.search(wordPattern(source)) >= 0);
}

export function applyGlossary(text, matches) {
  return matches.reduce((result, { source, result: word }) => result.replace(wordPattern(source), word), text);
}
