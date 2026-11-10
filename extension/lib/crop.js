// Classic script so it can be injected before overlay.js.
globalThis.ScreenSelectCrop = {
  toImageRect(rect, viewW, viewH, imgW, imgH) {
    const scaleX = imgW / viewW;
    const scaleY = imgH / viewH;
    const left = Math.max(0, Math.round(rect.x * scaleX));
    const top = Math.max(0, Math.round(rect.y * scaleY));
    const right = Math.min(imgW, Math.round((rect.x + rect.width) * scaleX));
    const bottom = Math.min(imgH, Math.round((rect.y + rect.height) * scaleY));
    return { x: left, y: top, width: right - left, height: bottom - top };
  },

  isUsableDrag(rect) {
    return rect.width >= 8 && rect.height >= 8;
  },

  upscaleFactor(height) {
    return height < 300 ? 2 : 1;
  },

  // Moves the whole box, or one edge or corner of it, and keeps it on screen.
  adjustRect(rect, edge, dx, dy, viewW, viewH) {
    const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
    if (edge === 'move') {
      return {
        x: clamp(rect.x + dx, 0, viewW - rect.width),
        y: clamp(rect.y + dy, 0, viewH - rect.height),
        width: rect.width,
        height: rect.height,
      };
    }
    let left = rect.x;
    let top = rect.y;
    let right = rect.x + rect.width;
    let bottom = rect.y + rect.height;
    if (edge.includes('w')) left = clamp(left + dx, 0, viewW);
    if (edge.includes('e')) right = clamp(right + dx, 0, viewW);
    if (edge.includes('n')) top = clamp(top + dy, 0, viewH);
    if (edge.includes('s')) bottom = clamp(bottom + dy, 0, viewH);
    return {
      x: Math.min(left, right),
      y: Math.min(top, bottom),
      width: Math.abs(right - left),
      height: Math.abs(bottom - top),
    };
  },

  // Table borders confuse text recognition, so thin unbroken lines that cross nearly the whole
  // picture are painted over with the background. Letters never make one unbroken line that long,
  // and thick bands, like a shaded header row, stay.
  eraseRuleLines(image, { coverage = 0.9, maxThickness = 6, contrast = 60 } = {}) {
    const { data, width, height } = image;
    const light = (index) => (data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000;
    const buckets = new Array(32).fill(0);
    for (let i = 0; i < data.length; i += 16) buckets[Math.min(31, Math.floor(light(i) / 8))] += 1;
    const background = buckets.indexOf(Math.max(...buckets)) * 8 + 4;
    const marked = (x, y) => Math.abs(light((y * width + x) * 4) - background) > contrast;
    const paint = (x, y) => {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = background;
    };

    const longestRun = (length, at) => {
      let best = 0;
      let run = 0;
      for (let i = 0; i < length; i += 1) {
        run = at(i) ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return best;
    };
    const thinRuns = (count, isLine) => {
      const runs = [];
      let start = -1;
      for (let i = 0; i <= count; i += 1) {
        const line = i < count && isLine(i);
        if (line && start < 0) start = i;
        if (!line && start >= 0) {
          if (i - start <= maxThickness) runs.push([start, i]);
          start = -1;
        }
      }
      return runs;
    };
    const rows = thinRuns(height, (y) => longestRun(width, (x) => marked(x, y)) >= width * coverage);
    const columns = thinRuns(width, (x) => longestRun(height, (y) => marked(x, y)) >= height * coverage);
    for (const [from, to] of rows) for (let y = from; y < to; y += 1) for (let x = 0; x < width; x += 1) paint(x, y);
    for (const [from, to] of columns) for (let x = from; x < to; x += 1) for (let y = 0; y < height; y += 1) paint(x, y);
    return rows.length + columns.length;
  },

  fitWithin(width, height, maxEdge) {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
  },
};
