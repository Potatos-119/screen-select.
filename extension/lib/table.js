import { fixMisreads } from './ocr-fixes.js';

// Tesseract's TSV has one word per row at level 5, with its box in pixels.
const WORD_LEVEL = '5';
// A gap this many letter heights wide splits two cells. Spaces between words are far narrower.
const CELL_GAP = 1.2;
const MIN_ROWS = 2;
const MIN_COLUMNS = 2;
// Two columns of long sentences is a page layout, not a table.
const MAX_PROSE_WORDS = 7;
const HAS_WORD = /[\p{L}\p{N}]/u;
const ARABIC = /\p{Script=Arabic}/gu;
const LETTER = /\p{L}/gu;
const ONLY_NUMBER = /^[\d\s.,:%+\-/()$€£٠-٩]*$/u;

function isArabic(text) {
  const letters = text.match(LETTER)?.length ?? 0;
  return letters > 0 && (text.match(ARABIC)?.length ?? 0) / letters > 0.5;
}

export function wordsFromTsv(tsv) {
  return String(tsv ?? '')
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((fields) => fields[0] === WORD_LEVEL && fields.length >= 12)
    .map((fields) => {
      const [left, top, width, height] = fields.slice(6, 10).map(Number);
      return { text: fields.slice(11).join(' ').trim(), left, top, right: left + width, bottom: top + height };
    })
    .filter((word) => HAS_WORD.test(word.text));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function groupRows(words) {
  const rows = [];
  const byMiddle = [...words].sort((a, b) => a.top + a.bottom - (b.top + b.bottom));
  for (const word of byMiddle) {
    const middle = (word.top + word.bottom) / 2;
    const row = rows.at(-1);
    if (row && middle >= row.top && middle <= row.bottom) {
      row.words.push(word);
      row.top = Math.min(row.top, word.top);
      row.bottom = Math.max(row.bottom, word.bottom);
    } else {
      rows.push({ top: word.top, bottom: word.bottom, words: [word] });
    }
  }
  rows.forEach((row) => row.words.sort((a, b) => a.left - b.left));
  return rows;
}

function splitCells(words, gap) {
  const cells = [];
  for (const word of words) {
    const cell = cells.at(-1);
    if (cell && word.left - cell.right <= gap) {
      cell.words.push(word);
      cell.right = Math.max(cell.right, word.right);
    } else {
      cells.push({ left: word.left, right: word.right, words: [word] });
    }
  }
  return cells;
}

// Cells that overlap from row to row belong to one column.
function findColumns(cells) {
  const bands = [];
  for (const cell of [...cells].sort((a, b) => a.left - b.left)) {
    const band = bands.at(-1);
    if (band && cell.left <= band.right) band.right = Math.max(band.right, cell.right);
    else bands.push({ left: cell.left, right: cell.right });
  }
  return bands;
}

function columnOf(word, bands) {
  const middle = (word.left + word.right) / 2;
  const distance = (band) => (middle < band.left ? band.left - middle : middle > band.right ? middle - band.right : 0);
  return bands.reduce((best, band, index) => (distance(band) < distance(bands[best]) ? index : best), 0);
}

function cellText(words) {
  const text = words.map((word) => word.text).join(' ');
  // Arabic reads right to left, so its words come in the opposite order to their positions.
  if (!isArabic(text)) return fixMisreads(text);
  return fixMisreads([...words].reverse().map((word) => word.text).join(' '));
}

// Returns the selection as lines and table rows when the words line up in columns, or null.
export function findTable(words) {
  if (words.length < MIN_ROWS * MIN_COLUMNS) return null;
  const gap = median(words.map((word) => word.bottom - word.top)) * CELL_GAP;
  const rows = groupRows(words).map((row) => ({ ...row, cells: splitCells(row.words, gap) }));
  const tableRows = rows.map((row, index) => (row.cells.length >= MIN_COLUMNS ? index : -1)).filter((i) => i >= 0);
  if (tableRows.length < MIN_ROWS) return null;

  const first = tableRows[0];
  const last = tableRows.at(-1);
  const inside = rows.slice(first, last + 1);
  if (tableRows.length < inside.length / 2) return null;
  const bands = findColumns(inside.flatMap((row) => (row.cells.length >= MIN_COLUMNS ? row.cells : [])));
  if (bands.length < MIN_COLUMNS) return null;

  const grid = inside.map((row) => {
    const columns = bands.map(() => []);
    row.words.forEach((word) => columns[columnOf(word, bands)].push(word));
    return columns.map(cellText);
  });
  const filled = grid.flat().filter(Boolean);
  const wordsPerCell = filled.join(' ').split(/\s+/).length / filled.length;
  if (bands.length === MIN_COLUMNS && wordsPerCell > MAX_PROSE_WORDS) return null;

  // An Arabic table starts on the right, so its first column is the last one on screen.
  if (isArabic(filled.join(' '))) grid.forEach((cells) => cells.reverse());
  const line = (row) => ({ type: 'line', text: cellText(row.words) });
  return [
    ...rows.slice(0, first).map(line),
    ...grid.map((cells) => ({ type: 'row', cells })),
    ...rows.slice(last + 1).map(line),
  ];
}

// Tabs between cells paste as a real table into Sheets, Excel and Docs.
export function partsToText(parts) {
  return parts.map((part) => (part.type === 'row' ? part.cells.join('\t') : part.text)).join('\n');
}

export function textToParts(text) {
  const lines = String(text ?? '').split('\n');
  if (lines.filter((line) => line.includes('\t')).length < MIN_ROWS) return null;
  const columns = Math.max(...lines.map((line) => line.split('\t').length));
  return lines.map((line) => {
    if (!line.includes('\t')) return { type: 'line', text: line };
    const cells = line.split('\t').map((cell) => cell.trim());
    return { type: 'row', cells: [...cells, ...Array(columns - cells.length).fill('')] };
  });
}

export function tableSize(parts) {
  const rows = parts.filter((part) => part.type === 'row');
  return { rows: rows.length, columns: Math.max(0, ...rows.map((row) => row.cells.length)) };
}

const needsTranslation = (text) => text.trim() !== '' && !ONLY_NUMBER.test(text);

// Each cell goes on its own line, so one request translates the whole table.
export function segmentsOf(parts) {
  return parts
    .flatMap((part) => (part.type === 'row' ? part.cells : [part.text]))
    .map((text) => text.replace(/\s*\n\s*/g, ' '))
    .filter(needsTranslation);
}

export function fillSegments(parts, translated) {
  const lines = String(translated ?? '').trim().split(/\n+/).map((line) => line.trim());
  const count = segmentsOf(parts).length;
  if (lines.length !== count) return null;
  let next = 0;
  const swap = (text) => (needsTranslation(text) ? lines[next++] : text);
  return parts.map((part) =>
    part.type === 'row' ? { type: 'row', cells: part.cells.map(swap) } : { type: 'line', text: swap(part.text) },
  );
}
