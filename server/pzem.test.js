// PZEM extension-monitoring module tests. Run with:  npm test
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { validatePzem, recordPzem, pzemView, pzemHistory, resetPzem, PZEM_STALE_AFTER_MS } from './pzem.js';

beforeEach(() => resetPzem());

const good = (over = {}) => ({ ok: true, seq: 1, voltage: 229.8, current: 1.234, power: 280.5, energy: 12.345, frequency: 60.0, pf: 0.99, ...over });
const accept = (b, now) => {
  const v = validatePzem(b);
  assert.equal(v.ok, true, JSON.stringify(v));
  return recordPzem(v.packet, now);
};

test('a datasheet-style reading is accepted and kept with its units', () => {
  accept(good(), 1_000_000);
  const v = pzemView(1_000_000 + 2000);
  assert.equal(v.status, 'live');
  assert.equal(v.source, 'hardware');
  assert.deepEqual(v.reading, { voltage: 229.8, current: 1.234, power: 280.5, energy: 12.345, frequency: 60, pf: 0.99, alarm: false });
  assert.equal(v.ageMs, 2000);
});

test('nothing received yet -> status none, no reading', () => {
  assert.deepEqual(pzemView(), { status: 'none', staleAfterMs: PZEM_STALE_AFTER_MS });
});

test('status: live, then stale when posts stop (ESP32/Wi-Fi/link down), keeping the last good reading', () => {
  accept(good(), 5_000_000);
  assert.equal(pzemView(5_000_000 + PZEM_STALE_AFTER_MS).status, 'live');
  const v = pzemView(5_000_000 + PZEM_STALE_AFTER_MS + 1);
  assert.equal(v.status, 'stale');
  assert.equal(v.reading.voltage, 229.8);
  assert.ok(v.readingAgeMs > PZEM_STALE_AFTER_MS);
});

test('status: pzem_offline when the ESP32 reports the meter is not answering (and it is not mistaken for a good reading)', () => {
  accept(good({ seq: 1 }), 7_000_000);
  accept({ ok: false, seq: 2, errors: 3, reason: 'no_response' }, 7_005_000);
  const v = pzemView(7_006_000);
  assert.equal(v.status, 'pzem_offline');
  assert.equal(v.reason, 'no_response');
  assert.equal(v.errors, 3);
  assert.equal(v.reading.voltage, 229.8); // last real reading is still available, labelled with its age
  assert.equal(v.readingAgeMs, 1000 + 5000);
});

test('validation rejects bad or out-of-range values, with a clear code', () => {
  const code = (b) => validatePzem(b).code;
  assert.equal(code(null), 'invalid_body');
  assert.equal(code([]), 'invalid_body');
  assert.equal(code(good({ ok: 'yes' })), 'invalid_ok');
  assert.equal(code(good({ seq: -1 })), 'invalid_seq');
  assert.equal(code(good({ voltage: 1000 })), 'invalid_voltage');
  assert.equal(code(good({ voltage: '230' })), 'invalid_voltage');
  assert.equal(code(good({ current: -0.1 })), 'invalid_current');
  assert.equal(code(good({ power: NaN })), 'invalid_power');
  assert.equal(code(good({ energy: 99999 })), 'invalid_energy');
  assert.equal(code(good({ frequency: 200 })), 'invalid_frequency');
  assert.equal(code(good({ pf: 2 })), 'invalid_pf');
  assert.equal(code(good({ alarm: 1 })), 'invalid_alarm');
  assert.equal(code({ ok: false, reason: 'bad <script>' }), 'invalid_reason');
  assert.equal(validatePzem(good()).ok, true);
  assert.equal(validatePzem({ ok: false }).ok, true); // a status-only packet needs no readings
});

test('a repeated seq is a retry: not counted twice, but it keeps the link alive', () => {
  assert.equal(accept(good({ seq: 4 }), 10_000_000).accepted, true);
  const r = accept(good({ seq: 4 }), 10_004_000);
  assert.deepEqual(r, { accepted: false, duplicate: true });
  assert.equal(pzemView(10_004_000).ageMs, 0);
  assert.equal(pzemHistory('1h', 10_004_000).points.reduce((a, p) => a + p.samples, 0), 1);
});

test('test data is labelled as test, hardware data as hardware', () => {
  accept(good({ source: 'test' }), 11_000_000);
  assert.equal(pzemView(11_000_000).source, 'test');
  assert.equal(pzemHistory('1h', 11_000_000).includesTestData, true);
  resetPzem();
  accept(good(), 11_000_000);
  assert.equal(pzemView(11_000_000).source, 'hardware');
  assert.equal(pzemHistory('1h', 11_000_000).includesTestData, false);
});

test('history averages power per minute, keeps the peak, and derives energy used from the meter counter', () => {
  const t0 = 60 * 60 * 1000 * 100; // exactly on an hour boundary
  accept(good({ seq: 1, power: 100, energy: 10.0 }), t0 + 5_000);
  accept(good({ seq: 2, power: 300, energy: 10.001 }), t0 + 10_000); // same minute: avg 200, peak 300
  accept(good({ seq: 3, power: 50, energy: 10.5 }), t0 + 3 * 60_000 + 1000); // three minutes later
  const h = pzemHistory('1h', t0 + 4 * 60_000);
  assert.equal(h.points.length, 60);
  assert.equal(h.stepMs, 60_000);
  const withData = h.points.filter((p) => p.samples > 0);
  assert.equal(withData.length, 2);
  assert.equal(withData[0].powerW, 200);
  assert.equal(withData[0].maxPowerW, 300);
  assert.equal(withData[1].powerW, 50);
  assert.deepEqual(h.summary, { avgPowerW: 150, peakPowerW: 300, usedKwh: 0.499 }); // (200*2 + 50*1)/3 = 150; 10.5 - 10.001
  assert.equal(h.points[0].powerW, null); // minutes with no data are gaps, not zeros
});

test('history ranges: 6h uses 5-minute steps, 24h 15-minute steps; unknown range -> null; empty history has no summary', () => {
  assert.equal(pzemHistory('6h').points.length, 72);
  assert.equal(pzemHistory('6h').stepMs, 300_000);
  assert.equal(pzemHistory('24h').points.length, 96);
  assert.equal(pzemHistory('24h').stepMs, 900_000);
  assert.equal(pzemHistory('7d'), null);
  assert.equal(pzemHistory('1h').summary, null);
});

test('only good readings enter the history (a "meter not answering" status adds no zero-power points)', () => {
  accept({ ok: false, seq: 1, reason: 'no_response' }, 12_000_000);
  assert.equal(pzemHistory('1h', 12_000_000).points.every((p) => p.samples === 0), true);
});
