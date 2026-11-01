export function createSseReader(onEvent) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      onEvent(event);
    }
  };
}
