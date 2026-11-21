// Voltage-card data-layer tests. Run with:  npm test
// All readings here are TEST DATA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePzem, fmtValue, fmtAge, setPzemFromStream, subscribePzem, getPzemSnapshot } from './usePzem.js';

const view = (o = {}) => ({
  status: 'LIVE',
  hasData: true,
  reading: { v: 228.4, i: 14.2, p: 3071, e: 1234.567, f: null, pf: null },
  source: 'hardware',
  lastUpdate: '2026-11-05T10:00:00.000Z',
  ageMs: 0,
  staleAfterMs: 10000,
  offlineAfterMs: 60000,
  rejected: { count: 0, lastReason: null, lastAt: null },
  controllerOnline: true,
  ...o,
});
const T0 = 1_000_000;

test('LIVE, then STALE, then OFFLINE as time passes since the push arrived (no new data needed)', () => {
  const snap = { view: view(), at: T0 };
  assert.equal(derivePzem(snap, T0 + 1000).status, 'LIVE');
  assert.equal(derivePzem(snap, T0 + 10000).status, 'LIVE');
  assert.equal(derivePzem(snap, T0 + 10001).status, 'STALE');
  assert.equal(derivePzem(snap, T0 + 60001).status, 'OFFLINE');
});

test('the receiver-reported age is added to the local elapsed time', () => {
  const snap = { view: view({ ageMs: 9000 }), at: T0 };
  assert.equal(derivePzem(snap, T0).status, 'LIVE');
  assert.equal(derivePzem(snap, T0 + 1500).status, 'STALE'); // 9 s old when sent + 1.5 s in transit/idle
  assert.equal(derivePzem(snap, T0 + 1500).ageMs, 10500);
});

test('no valid reading since the receiver started: OFFLINE with no reading (unavailable, not zero)', () => {
  const d = derivePzem({ view: view({ hasData: false, reading: null, ageMs: null, lastUpdate: null, source: null }), at: T0 }, T0);
  assert.equal(d.status, 'OFFLINE');
  assert.equal(d.why, 'no-data');
  assert.equal(d.reading, null);
  assert.equal(d.controllerOnline, true); // lets the card say "controller connected, no meter data"
});

test('stale readings keep the last known values (the card labels them); offline readings are flagged silent', () => {
  const snap = { view: view(), at: T0 };
  const stale = derivePzem(snap, T0 + 20000);
  assert.equal(stale.status, 'STALE');
  assert.equal(stale.reading.v, 228.4);
  const off = derivePzem(snap, T0 + 120000);
  assert.equal(off.status, 'OFFLINE');
  assert.equal(off.why, 'silent');
});

test('receiver unreachable, or no power event yet: OFFLINE, never an old or sample value', () => {
  const snap = { view: view(), at: T0 };
  const lost = derivePzem(snap, T0, false);
  assert.equal(lost.status, 'OFFLINE');
  assert.equal(lost.why, 'no-receiver');
  assert.equal(lost.reading, null);
  const waiting = derivePzem(null, T0, true);
  assert.equal(waiting.status, 'OFFLINE');
  assert.equal(waiting.why, 'waiting');
  assert.equal(waiting.reading, null);
});

test('frequency and power factor stay null when the firmware does not send them', () => {
  const d = derivePzem({ view: view(), at: T0 }, T0);
  assert.equal(d.reading.f, null);
  assert.equal(d.reading.pf, null);
  assert.equal(fmtValue(d.reading.f, 1), null);
});

test('fmtValue never turns a missing value into 0', () => {
  for (const bad of [null, undefined, NaN, Infinity, '12', {}]) assert.equal(fmtValue(bad, 1), null);
  assert.equal(fmtValue(0, 2), '0.00'); // a real zero is shown as 0
  assert.equal(fmtValue(228.44, 1), '228.4');
  assert.equal(fmtValue(1234.5678, 3), '1234.568');
});

test('fmtAge reads naturally', () => {
  assert.equal(fmtAge(0), '0 s ago');
  assert.equal(fmtAge(3400), '3 s ago');
  assert.equal(fmtAge(125000), '2 min ago');
  assert.equal(fmtAge(3 * 3600000 + 5 * 60000), '3 h 5 min ago');
  assert.equal(fmtAge(null), '');
});

test('test data is carried through so the card can label it', () => {
  assert.equal(derivePzem({ view: view({ source: 'test' }), at: T0 }, T0).source, 'test');
});

test('store: set notifies subscribers, null clears it (stream down)', () => {
  let n = 0;
  const off = subscribePzem(() => n++);
  setPzemFromStream(view(), T0);
  assert.equal(n, 1);
  assert.equal(getPzemSnapshot().view.reading.v, 228.4);
  setPzemFromStream(null);
  assert.equal(n, 2);
  assert.equal(getPzemSnapshot(), null);
  off();
  setPzemFromStream(view(), T0);
  assert.equal(n, 2); // unsubscribed
  setPzemFromStream(null);
});
