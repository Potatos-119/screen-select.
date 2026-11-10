import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fillSegments,
  findTable,
  partsToText,
  segmentsOf,
  tableSize,
  textToParts,
  wordsFromTsv,
} from '../extension/lib/table.js';

// Lays words out like a screen: each row is a list of [text, left] at 20px tall letters.
function layout(rows, { rowHeight = 30, letter = 10 } = {}) {
  return rows.flatMap((words, row) =>
    words.map(([text, left]) => ({
      text,
      left,
      top: row * rowHeight,
      right: left + text.length * letter,
      bottom: row * rowHeight + 20,
    })),
  );
}

const PRICES = layout([
  [['Plan', 0], ['Price', 200], ['Users', 400]],
  [['Free', 0], ['0', 200], ['1', 400]],
  [['Team', 0], ['plan', 50], ['12', 200], ['10', 400]],
]);

test('words in columns become a table', () => {
  const parts = findTable(PRICES);
  assert.deepEqual(parts, [
    { type: 'row', cells: ['Plan', 'Price', 'Users'] },
    { type: 'row', cells: ['Free', '0', '1'] },
    { type: 'row', cells: ['Team plan', '12', '10'] },
  ]);
  assert.deepEqual(tableSize(parts), { rows: 3, columns: 3 });
});

test('an empty cell stays in its column', () => {
  const parts = findTable(layout([
    [['Name', 0], ['Phone', 200], ['City', 400]],
    [['Sara', 0], ['Doha', 400]],
    [['Omar', 0], ['5551', 200], ['Riyadh', 400]],
  ]));
  assert.deepEqual(parts[1].cells, ['Sara', '', 'Doha']);
});

test('a title above the table stays a line', () => {
  const words = [
    ...layout([[['Monthly', 0], ['prices', 80]]]),
    ...layout([[['Plan', 0], ['Price', 200]], [['Free', 0], ['0', 200]], [['Pro', 0], ['9', 200]]]).map((word) => ({
      ...word,
      top: word.top + 40,
      bottom: word.bottom + 40,
    })),
  ];
  const parts = findTable(words);
  assert.deepEqual(parts[0], { type: 'line', text: 'Monthly prices' });
  assert.equal(tableSize(parts).rows, 3);
});

test('ordinary sentences are not a table', () => {
  const words = layout([
    [['Perception', 0], ['is', 110], ['the', 140], ['first', 180], ['step', 240]],
    [['of', 0], ['every', 30], ['agent', 90]],
  ]);
  assert.equal(findTable(words), null);
});

test('two columns of long sentences are not a table', () => {
  const sentence = (start) =>
    ['one', 'two', 'six', 'ten', 'red', 'big', 'old', 'new', 'far'].map((text, i) => [text, start + i * 40]);
  const words = layout([[...sentence(0), ...sentence(500)], [...sentence(0), ...sentence(500)]]);
  assert.equal(findTable(words), null);
});

test('an Arabic table starts on the right and keeps its word order', () => {
  // On screen: "السعر" on the left, then a cell "خطة مجانية" whose first word is on the right.
  const parts = findTable(layout([
    [['السعر', 0], ['الخطة', 300]],
    [['0', 0], ['مجانية', 250], ['خطة', 330]],
  ]));
  assert.deepEqual(parts, [
    { type: 'row', cells: ['الخطة', 'السعر'] },
    { type: 'row', cells: ['خطة مجانية', '0'] },
  ]);
});

test('Tesseract TSV becomes words with boxes, without table lines', () => {
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '4\t1\t1\t1\t1\t0\t0\t0\t300\t20\t-1\t',
    '5\t1\t1\t1\t1\t1\t10\t5\t40\t20\t95\tPlan',
    '5\t1\t1\t1\t1\t2\t60\t5\t8\t20\t40\t|',
  ].join('\n');
  assert.deepEqual(wordsFromTsv(tsv), [{ text: 'Plan', left: 10, top: 5, right: 50, bottom: 25 }]);
  assert.deepEqual(wordsFromTsv(undefined), []);
});

test('a table goes to text with tabs and back', () => {
  const parts = [
    { type: 'line', text: 'Prices' },
    { type: 'row', cells: ['Plan', 'Price'] },
    { type: 'row', cells: ['Free', '0'] },
  ];
  const text = partsToText(parts);
  assert.equal(text, 'Prices\nPlan\tPrice\nFree\t0');
  assert.deepEqual(textToParts(text), parts);
  assert.equal(textToParts('no table here'), null);
  assert.equal(textToParts('one\trow only'), null);
});

test('short rows get empty cells to match the widest row', () => {
  assert.deepEqual(textToParts('a\tb\tc\nd\te')[1].cells, ['d', 'e', '']);
});

test('only cells with words are sent to translate, and come back in place', () => {
  const parts = [
    { type: 'line', text: 'Prices' },
    { type: 'row', cells: ['Plan', 'Price'] },
    { type: 'row', cells: ['Free', '$0'] },
    { type: 'row', cells: ['', '12.5'] },
  ];
  assert.deepEqual(segmentsOf(parts), ['Prices', 'Plan', 'Price', 'Free']);
  assert.deepEqual(fillSegments(parts, 'الأسعار\nالخطة\nالسعر\nمجانية\n'), [
    { type: 'line', text: 'الأسعار' },
    { type: 'row', cells: ['الخطة', 'السعر'] },
    { type: 'row', cells: ['مجانية', '$0'] },
    { type: 'row', cells: ['', '12.5'] },
  ]);
});

test('a translation with the wrong number of lines is refused', () => {
  const parts = [{ type: 'row', cells: ['Plan', 'Price'] }, { type: 'row', cells: ['Free', 'Low'] }];
  assert.equal(fillSegments(parts, 'الخطة السعر\nمجانية منخفض'), null);
});
