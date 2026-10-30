const MAX_QUERY_LENGTH = 1000;

// udm=50 is where the AI Mode tab on Google's results page links to.
export function aiSearchUrl(text) {
  const params = new URLSearchParams({ udm: '50', q: text.slice(0, MAX_QUERY_LENGTH) });
  return `https://www.google.com/search?${params}`;
}
