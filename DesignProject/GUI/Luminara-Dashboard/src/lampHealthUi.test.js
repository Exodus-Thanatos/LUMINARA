import test from 'node:test';
import assert from 'node:assert/strict';
import { healthOf, tileLabel, TONE_PILL } from './lampHealthUi.js';
import { mergeLive } from './useLiveLamps.js';

const lamp = (o) => ({ id: 'L-001', nodeId: 1, seq: 1, type: 'BEAT', lux: 300, status: 'NORMAL_LIT', statusSince: '2026-11-08T12:00:00Z', lastSeen: '2026-11-08T12:00:00Z', ageMs: 1000, link: 'ONLINE', source: 'hardware', ...o });
const live = (lamps) => ({ connected: true, serverTime: '2026-11-08T12:00:05Z', lamps });

test('good, dim, no light and sensor error each get their own wording and colour', () => {
  const rows = mergeLive([], live([lamp({}), lamp({ id: 'L-002', status: 'LOW_LIGHT', lux: 40 }), lamp({ id: 'L-003', status: 'TOTAL_BLACKOUT', lux: 1 }), lamp({ id: 'L-004', status: 'SENSOR_ERROR', lux: null })])).devices;
  const labels = rows.map((d) => healthOf(d).label);
  assert.deepEqual(labels, ['CONNECTED / GOOD', 'WARNING', 'FAULT', 'SENSOR ERROR']);
  assert.deepEqual(rows.map((d) => healthOf(d).tone), ['green', 'amber', 'red', 'gray']);
  assert.deepEqual(rows.map((d) => d.status), ['ONLINE', 'WARNING', 'FAULT', 'WARNING']); // a dead sensor is not a lamp FAULT
  assert.ok(Object.keys(TONE_PILL).every((t) => TONE_PILL[t]));
});

test('daylight saturation (65535 lux) is normal standby, not a fault', () => {
  const d = mergeLive([], live([lamp({ status: 'DAYLIGHT_STANDBY', lux: 65535 })])).devices[0];
  assert.equal(d.status, 'ONLINE');
  assert.equal(healthOf(d).label, 'DAYLIGHT STANDBY');
  assert.equal(d.lux, 65535);
});

test('an offline node shows OFFLINE and no lux value (missing data is not 0 lux)', () => {
  const d = mergeLive([], live([lamp({ link: 'OFFLINE', lux: 300 })])).devices[0];
  assert.equal(d.status, 'OFFLINE');
  assert.equal(d.lux, null);
  assert.equal(healthOf(d).key, 'OFFLINE');
});

test('the server verdict is used when present; with no verdict an unstable report is BLINKING and near-limit light is a WARNING', () => {
  const near = mergeLive([], live([lamp({ status: 'NORMAL_LIT', lux: 90, health: { key: 'NEAR_LIMIT', label: 'WARNING', tone: 'amber', dashboardStatus: 'WARNING', animate: false } })])).devices[0];
  assert.equal(near.status, 'WARNING');
  assert.equal(tileLabel(near), 'WARNING');
  const confirmed = mergeLive([], live([lamp({ status: 'BLINKING/UNSTABLE', health: { key: 'BLINKING', label: 'BLINKING', tone: 'red', dashboardStatus: 'FAULT', animate: true } })])).devices[0];
  assert.equal(confirmed.status, 'FAULT');
  assert.equal(healthOf(confirmed).animate, true);
  assert.equal(tileLabel(confirmed), 'BLINKING');
  // with no server verdict (older server) one unstable report is BLINKING too
  const old = mergeLive([], live([lamp({ status: 'BLINKING/UNSTABLE' })])).devices[0];
  assert.equal(healthOf(old).key, 'BLINKING');
  assert.equal(old.status, 'FAULT');
  // ...and an old server's healthy report with light just above the limit still warns
  const oldNear = mergeLive([], live([lamp({ status: 'NORMAL_LIT', lux: 95 })])).devices[0];
  assert.equal(healthOf(oldNear).key, 'NEAR_LIMIT');
});

test('demo data (receiver not reachable) still gets wording; uninstalled / no data keep their old badge', () => {
  assert.equal(healthOf({ status: 'ONLINE' }).label, 'CONNECTED / GOOD');
  assert.equal(healthOf({ status: 'FAULT' }).label, 'FAULT');
  assert.equal(healthOf({ status: 'UNINSTALLED' }), null);
  assert.equal(healthOf({ status: 'NO DATA' }), null);
  assert.equal(tileLabel({ status: 'UNINSTALLED' }), 'UNINSTALLED');
});
