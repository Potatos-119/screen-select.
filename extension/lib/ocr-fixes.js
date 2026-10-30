// Capital I and small l look alike in many fonts, so "AI" is often read as "Al".
// A capitalised word after it usually means a name such as Al Gore, unless it's a common AI term.
const AI_TERMS = 'Agents?|Models?|Tools?|Assistants?|Systems?|Chat|Research|Safety|Ethics|Engineers?|Engineering|Developers?|Features?|Applications?|Technology|Course|Overview|Mode|Powered|Generated';
const AI_READ_AS_AL = new RegExp(`\\bAl\\b(?:(?=[ -]+(?:${AI_TERMS})\\b)|(?![ -]+[A-Z][a-z]))`, 'g');
const NAME_ENDING_IN_AI = /\b(Open|Gen)Al\b/g;

export function fixMisreads(text) {
  return text.replace(NAME_ENDING_IN_AI, '$1AI').replace(AI_READ_AS_AL, 'AI');
}
