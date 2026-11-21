import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv, isoOrBlank, csvFileName } from './dataCsv.js';

test('csvCell: quotes commas, quotes and newlines; blanks for null; numbers untouched', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(0), '0');
  assert.equal(csvCell(12.5), '12.5');
  assert.equal(csvCell(Number.NaN), '');
});

test('csvCell: text that a spreadsheet would run as a formula is made harmless', () => {
  for (const bad of ['=SUM(A1)', '+1', '-2+3', '@cmd']) assert.ok(csvCell(bad).startsWith("'"), bad);
});

test('toCsv: header row then one line per row', () => {
  const csv = toCsv([{ label: 'Lamp', value: (r) => r.lamp }, { label: 'Lux', value: (r) => r.lux }], [{ lamp: 'L-008', lux: 0 }, { lamp: 'L-009', lux: null }]);
  assert.equal(csv, 'Lamp,Lux\r\nL-008,0\r\nL-009,');
});

test('isoOrBlank and csvFileName', () => {
  assert.equal(isoOrBlank(null), '');
  assert.equal(isoOrBlank(Date.UTC(2026, 10, 9)), '2026-11-09T00:00:00.000Z');
  assert.equal(csvFileName('events', Date.UTC(2026, 10, 9, 12)), 'luminara-events-2026-11-09.csv');
});
