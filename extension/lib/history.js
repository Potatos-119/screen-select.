export const MAX_HISTORY = 100;

export function saveEntry(history, entry, max = MAX_HISTORY) {
  const others = history.filter((saved) => saved.id !== entry.id);
  return [entry, ...others].slice(0, max);
}

export function matchesSearch(entry, search) {
  const wanted = search.trim().toLowerCase();
  if (!wanted) return true;
  const answers = (entry.turns ?? []).flatMap((turn) => [turn.question, turn.answer]);
  return [entry.text, entry.translation, entry.title, ...answers].some((part) => part?.toLowerCase().includes(wanted));
}

export function safeLink(url) {
  return /^https?:\/\//.test(url ?? '') ? url : '';
}
