// Capital I and small l look alike in many fonts, so "AI" is often read as "Al".
// A capitalised word after it usually means a name such as Al Gore, unless it's a common AI term.
const AI_TERMS = 'Agents?|Models?|Tools?|Assistants?|Systems?|Chat|Research|Safety|Ethics|Engineers?|Engineering|Developers?|Features?|Applications?|Technology|Course|Overview|Mode|Powered|Generated';
const AI_READ_AS_AL = new RegExp(`\\bAl\\b(?:(?=[ -]+(?:${AI_TERMS})\\b)|(?![ -]+[A-Z][a-z]))`, 'g');
const NAME_ENDING_IN_AI = /\b(Open|Gen)Al\b/g;

// Arrows, borders and table lines in a picture come back as symbols around the real words.
const LINE_ART = /[|¦‖=~_<>]/g;
const LEADING_LINE_ART = /^(?:[|¦‖]\s*|[=~_<>]+\s+)+/;
const TRAILING_LINE_ART = /(?:\s*[|¦‖]|\s+[=~_<>]+)+$/;
const WORD_CHARACTER = /[\p{L}\p{N}]/gu;

function isLineArt(line) {
  const words = line.match(WORD_CHARACTER)?.length ?? 0;
  const marks = line.match(LINE_ART)?.length ?? 0;
  return words === 0 || (words <= 2 && marks >= 2);
}

export function removeLineArt(text) {
  return text
    .split('\n')
    .filter((line) => !line.trim() || !isLineArt(line))
    .map((line) => line.replace(LEADING_LINE_ART, '').replace(TRAILING_LINE_ART, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function fixMisreads(text) {
  return text.replace(NAME_ENDING_IN_AI, '$1AI').replace(AI_READ_AS_AL, 'AI');
}
