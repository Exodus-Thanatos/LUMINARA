// Dashboard status-mapping tests. Run with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toDashboardStatus,
  isKnownStatus,
  mergeLive,
  setControlFromStream,
  subscribeControl,
  getControlSnapshot,
  controlPushIsFresh,
} from './useLiveLamps.js';

test('firmware statuses map to the existing dashboard statuses', () => {
  const expected = {
    NORMAL_LIT: 'ONLINE',
    DAYLIGHT_STANDBY: 'ONLINE',
    STANDBY: 'ONLINE',
    NORMAL: 'ONLINE', // legacy
    LOW_LIGHT: 'WARNING',
    TOTAL_BLACKOUT: 'FAULT',
    'BLINKING/UNSTABLE': 'FAULT',
    SENSOR_ERROR: 'FAULT',
  };
  for (const [fw, dash] of Object.entries(expected)) {
    assert.equal(toDashboardStatus(fw), dash, fw);
    assert.equal(isKnownStatus(fw), true, fw);
  }
});

test('unknown statuses are a WARNING with the raw text kept, never a silent FAULT', () => {
  for (const s of ['SOMETHING_NEW', '', undefined, 'constructor', 'toString']) {
    assert.equal(toDashboardStatus(s), 'WARNING', String(s));
    assert.equal(isKnownStatus(s), false, String(s));
  }
});

const rec = (o = {}) => ({
  id: 'L-001', nodeId: 1, seq: 3, type: 'BEAT', lux: 153.2, status: 'NORMAL_LIT', rssi: -70,
  lastSeen: '2026-10-27T01:00:00.000Z', link: 'ONLINE', source: 'hardware', ...o,
});
const merge = (...lamps) =>
  mergeLive([], { connected: true, serverTime: '2026-10-27T01:00:05.000Z', lamps });

test('NORMAL_LIT and standby states are not shown as faults, and keep their lux', () => {
  for (const status of ['NORMAL_LIT', 'DAYLIGHT_STANDBY', 'STANDBY']) {
    const [d] = merge(rec({ status, lux: 12000 })).devices;
    assert.equal(d.status, 'ONLINE', status);
    assert.equal(d.lux, 12000);
    assert.equal(d.reported, status);
    assert.equal(d.comm, 'Online');
  }
});

test('real fault statuses show as FAULT / WARNING while the node is still communicating', () => {
  assert.equal(merge(rec({ status: 'TOTAL_BLACKOUT', lux: 0 })).devices[0].status, 'FAULT');
  assert.equal(merge(rec({ status: 'BLINKING/UNSTABLE', lux: 220 })).devices[0].status, 'FAULT');
  assert.equal(merge(rec({ status: 'LOW_LIGHT', lux: 40 })).devices[0].status, 'WARNING');
  const s = merge(rec({ status: 'SENSOR_ERROR', lux: null })).devices[0];
  assert.equal(s.status, 'FAULT');
  assert.equal(s.comm, 'Online'); // sensor fault, but the node is talking
  assert.equal(s.lux, null); // no invented reading
});

test('zero lux is kept as 0 (a real reading), missing lux stays null', () => {
  assert.strictEqual(merge(rec({ status: 'TOTAL_BLACKOUT', lux: 0 })).devices[0].lux, 0);
  assert.strictEqual(merge(rec({ lux: null })).devices[0].lux, null);
});

test('communication loss is separate from lamp condition', () => {
  const stale = merge(rec({ link: 'STALE' })).devices[0];
  assert.equal(stale.status, 'ONLINE'); // lamp condition unchanged
  assert.equal(stale.comm, 'Stale');
  assert.equal(stale.lux, 153.2);

  const off = merge(rec({ link: 'OFFLINE', status: 'NORMAL_LIT' })).devices[0];
  assert.equal(off.status, 'OFFLINE');
  assert.equal(off.comm, 'Offline');
  assert.equal(off.condition, 'ONLINE'); // last reported condition is kept, not turned into a fault
  assert.equal(off.reported, 'NORMAL_LIT');
  assert.equal(off.lux, null); // an old reading is not shown as current
  assert.notEqual(off.status, 'FAULT');
});

test('unknown status is flagged as unrecognised', () => {
  const d = merge(rec({ status: 'NEW_STATE' })).devices[0];
  assert.equal(d.status, 'WARNING');
  assert.equal(d.known, false);
  assert.equal(d.reported, 'NEW_STATE');
});

test('without the receiver the dashboard falls back to demo data', () => {
  const sample = [{ id: 'L-001', loc: 'x' }];
  const r = mergeLive(sample, { connected: false, lamps: [] });
  assert.equal(r.mode, 'demo');
  assert.equal(r.devices, sample);
});

test('pushed relay-control state: stored, announced to subscribers, fresh only while pushes keep arriving', () => {
  setControlFromStream(null);
  assert.equal(getControlSnapshot(), null);
  assert.equal(controlPushIsFresh(), false);
  let calls = 0;
  const off = subscribeControl(() => (calls += 1));
  const view = { want: true, applied: null, controllerOnline: true, pending: true };
  setControlFromStream(view, 1000);
  assert.deepEqual(getControlSnapshot(), { view, at: 1000 });
  assert.equal(calls, 1);
  assert.equal(controlPushIsFresh(12000, 1000 + 11999), true);
  assert.equal(controlPushIsFresh(12000, 1000 + 12000), false); // pushes stopped: Controls must go back to polling
  setControlFromStream(null); // stream dropped
  assert.equal(getControlSnapshot(), null);
  assert.equal(calls, 2);
  off();
  setControlFromStream(view);
  assert.equal(calls, 2); // unsubscribed
  setControlFromStream(null);
});
