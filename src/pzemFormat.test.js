// PZEM panel wording/formatting tests. Run with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { describePzem, fmtAgo, fmtPower, READING_CARDS, historyRows } from './pzemFormat.js';

const reading = { voltage: 229.84, current: 1.2346, power: 280.55, energy: 12.3456, frequency: 59.98, pf: 0.987, alarm: false };
const live = { status: 'live', source: 'hardware', ageMs: 3000, reading, readingAgeMs: 3000 };

test('every state has its own wording and never shows success when there is no live reading', () => {
  assert.equal(describePzem({ view: null, reachable: false }).state, 'unreachable');
  assert.equal(describePzem({ view: { status: 'none' }, reachable: true }).state, 'none');
  const l = describePzem({ view: live, reachable: true });
  assert.deepEqual([l.state, l.tone, l.label, l.dim], ['live', 'ok', 'LIVE', false]);
  assert.equal(l.detail, 'Updated 3 s ago');
  const off = describePzem({ view: { status: 'pzem_offline', source: 'hardware', ageMs: 2000, reading, readingAgeMs: 65000 }, reachable: true });
  assert.deepEqual([off.state, off.tone, off.dim], ['pzem_offline', 'bad', true]);
  assert.match(off.detail, /does not answer/);
  assert.match(off.detail, /5 V supply/);
  assert.match(off.detail, /Last reading 1 min ago/);
  const st = describePzem({ view: { status: 'stale', source: 'hardware', ageMs: 125000, reading, readingAgeMs: 125000 }, reachable: true });
  assert.deepEqual([st.state, st.tone, st.dim], ['stale', 'warn', true]);
  assert.match(st.detail, /Nothing received for 2 min/);
  for (const d of [describePzem({ view: null, reachable: false }), describePzem({ view: { status: 'none' }, reachable: true })]) assert.equal(d.reading, null);
});

test('test data is flagged so it is never mistaken for a real measurement', () => {
  assert.equal(describePzem({ view: { ...live, source: 'test' }, reachable: true }).isTest, true);
  assert.equal(describePzem({ view: live, reachable: true }).isTest, false);
});

test('number formatting follows the meter resolution (0.1 V, 0.001 A, 0.1 W, 0.001 kWh, 0.1 Hz, 0.01 PF)', () => {
  const f = Object.fromEntries(READING_CARDS.map((c) => [c.key, c.fmt(reading[c.key])]));
  assert.deepEqual(f, { voltage: '229.8', current: '1.235', power: '280.6', energy: '12.346', frequency: '60.0', pf: '0.99' });
  assert.equal(fmtPower(1234.56), '1235');
  assert.equal(fmtPower(0), '0.0');
  assert.deepEqual(READING_CARDS.map((c) => c.label), ['Voltage', 'Current', 'Active Power', 'Energy', 'Frequency', 'Power Factor']);
});

test('fmtAgo', () => {
  assert.equal(fmtAgo(0), '0 s ago');
  assert.equal(fmtAgo(59_400), '59 s ago');
  assert.equal(fmtAgo(60_000), '1 min ago');
  assert.equal(fmtAgo(3_600_000 + 5 * 60_000), '1 h 5 min ago');
  assert.equal(fmtAgo(null), '');
});

test('history rows keep gaps as null (no false zero-power points)', () => {
  const rows = historyRows({ points: [{ t: 1, powerW: 10, maxPowerW: 12, samples: 3 }, { t: 2, powerW: null, maxPowerW: null, samples: 0 }] });
  assert.deepEqual(rows, [{ t: 1, powerW: 10, maxPowerW: 12 }, { t: 2, powerW: null, maxPowerW: null }]);
  assert.deepEqual(historyRows(null), []);
});
