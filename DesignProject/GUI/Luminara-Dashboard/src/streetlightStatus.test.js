import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStreetlight, summarize, needsAttention, STATUS_MODEL, STATUS_IDS, FAULT_CATALOG, conditionSince, minutesSince, formatActive } from './streetlightStatus.js';
import { suggestPriority, priorityLabel, PRIORITY_INFO } from './maintenancePriority.js';

test('every status has the reference fields the manual needs', () => {
  for (const id of STATUS_IDS) for (const k of ['label', 'definition', 'conditions', 'data', 'action', 'tone', 'icon']) assert.ok(STATUS_MODEL[id][k], `${id}.${k}`);
});
test('no device / uninstalled is never offline', () => {
  assert.equal(classifyStreetlight(null).statusId, 'NO_DEVICE');
  assert.equal(classifyStreetlight({ status: 'UNINSTALLED' }).statusId, 'NO_DEVICE');
});
test('offline is communication loss, not a lamp failure', () => {
  const c = classifyStreetlight({ status: 'OFFLINE', reported: 'TOTAL_BLACKOUT' });
  assert.equal(c.statusId, 'OFFLINE');
  assert.equal(c.condition, 'UNKNOWN');
  assert.equal(c.faultType, 'COMMUNICATION_FAILURE');
  assert.match(c.label, /Offline/);
});
test('a connected lamp can still have a lamp failure', () => {
  const c = classifyStreetlight({ status: 'FAULT', reported: 'TOTAL_BLACKOUT', comm: 'Online' });
  assert.equal(c.comm, 'ONLINE');
  assert.equal(c.condition, 'FAULT');
  assert.equal(c.faultType, 'LAMP_FAILURE');
  assert.equal(c.label, 'Online – Lamp Failure');
});
test('fault types come only from what the node reports', () => {
  assert.equal(classifyStreetlight({ status: 'FAULT', reported: 'BLINKING/UNSTABLE' }).faultType, 'UNSTABLE_LIGHT');
  assert.equal(classifyStreetlight({ status: 'WARNING', reported: 'LOW_LIGHT' }).faultType, 'LOW_LIGHT');
  assert.equal(classifyStreetlight({ status: 'WARNING', reported: 'SENSOR_ERROR', health: { key: 'SENSOR_ERROR' } }).faultType, 'SENSOR_MALFUNCTION');
  assert.equal(classifyStreetlight({ status: 'WARNING', health: { key: 'NEAR_LIMIT' } }).faultType, 'NEAR_LOW_LIGHT');
  assert.equal(classifyStreetlight({ status: 'FAULT', reported: 'SOMETHING_NEW' }).faultType, 'UNRECOGNISED_STATUS');
});
test('healthy, sleeping and delayed reports stay Online', () => {
  assert.equal(classifyStreetlight({ status: 'ONLINE', reported: 'NORMAL_LIT' }).label, 'Online – Healthy');
  assert.equal(classifyStreetlight({ status: 'ONLINE', health: { key: 'SLEEPING' } }).label, 'Online – Sleeping');
  assert.equal(classifyStreetlight({ status: 'ONLINE', comm: 'Stale' }).label, 'Online – Healthy (report delayed)');
});
test('no data is not zero', () => {
  assert.equal(classifyStreetlight({ status: 'NO DATA' }).statusId, 'NO_DATA');
});
test('counts reconcile: total = installed + no device; installed = healthy + warning + fault + offline + no data', () => {
  const recs = [{ status: 'ONLINE' }, { status: 'ONLINE' }, { status: 'FAULT', reported: 'TOTAL_BLACKOUT' }, { status: 'OFFLINE' }, { status: 'OFFLINE' }, { status: 'WARNING', reported: 'LOW_LIGHT' }, { status: 'NO DATA' }, null, null].map(classifyStreetlight);
  const s = summarize(recs);
  assert.equal(s.total, 9);
  assert.equal(s.total, s.installed + s.noDevice);
  assert.equal(s.installed, s.healthy + s.warning + s.fault + s.offline + s.noData);
  assert.equal(s.online, 4); // 2 healthy + 1 warning + 1 fault communicate
});
test('needs attention is worst first and skips healthy lamps', () => {
  const recs = [{ id: 'L-002', statusId: 'WARNING' }, { id: 'L-001', statusId: 'ONLINE' }, { id: 'L-004', statusId: 'OFFLINE' }, { id: 'L-003', statusId: 'FAULT' }];
  assert.deepEqual(needsAttention(recs).map((r) => r.id), ['L-003', 'L-004', 'L-002']);
});
test('unsupported fault types are not claimed as automatic', () => {
  for (const k of ['VOLTAGE_ABNORMALITY', 'INTERMITTENT_CONNECTION', 'POWER_FAILURE']) assert.notEqual(FAULT_CATALOG[k].detection, 'AUTOMATIC');
  assert.equal(FAULT_CATALOG.LAMP_FAILURE.detection, 'AUTOMATIC');
});
test('priority labels use P1 to P4 over the existing stored values', () => {
  assert.equal(priorityLabel('CRITICAL'), 'P1 – Emergency');
  assert.equal(priorityLabel('HIGH'), 'P2 – Urgent');
  assert.equal(priorityLabel('MEDIUM'), 'P3 – Normal');
  assert.equal(priorityLabel('LOW'), 'P4 – Planned');
  assert.deepEqual(Object.keys(PRIORITY_INFO).sort(), ['CRITICAL', 'HIGH', 'LOW', 'MEDIUM']);
});
test('suggested priority depends on context, not on the fault type alone', () => {
  assert.equal(suggestPriority('LAMP_FAILURE').value, 'HIGH');
  assert.equal(suggestPriority('LAMP_FAILURE', { minutesActive: 3000 }).value, 'CRITICAL');
  assert.equal(suggestPriority('LAMP_FAILURE', { clusterCount: 3 }).value, 'CRITICAL');
  assert.equal(suggestPriority('LOW_LIGHT').value, 'LOW');
  assert.equal(suggestPriority('COMMUNICATION_FAILURE', { clusterCount: 5 }).value, 'MEDIUM');
  assert.equal(suggestPriority('MYSTERY').value, 'MEDIUM');
  assert.ok(suggestPriority('LAMP_FAILURE', { minutesActive: 3000 }).reasons.length >= 2);
});

test('the detection time is the newest change into the current condition, never guessed', () => {
  const ev = [{ at: 1000, next: 'GOOD' }, { at: 2000, next: 'FAULT' }, { at: 3000, next: 'GOOD' }, { at: 4000, next: 'FAULT' }];
  assert.equal(conditionSince(ev, 'FAULT'), 4000);
  assert.equal(conditionSince(ev, 'OFFLINE'), null);
  assert.equal(conditionSince([], 'FAULT'), null);
  assert.equal(conditionSince(null, 'FAULT'), null);
  assert.equal(conditionSince(ev, undefined), null);
});
test('durations are formatted for people', () => {
  assert.equal(minutesSince(0, 90 * 60000), 90);
  assert.equal(minutesSince(null), null);
  assert.equal(formatActive(0), 'less than a minute');
  assert.equal(formatActive(18), '18 min');
  assert.equal(formatActive(135), '2 h 15 min');
  assert.equal(formatActive(60 * 24 * 3), '3 days');
  assert.equal(formatActive(null), null);
});

test('a fault with no diagnostic detail is shown as "type not reported", not guessed', () => {
  const c = classifyStreetlight({ status: 'FAULT' });
  assert.equal(c.statusId, 'FAULT');
  assert.equal(c.faultType, null);
  assert.equal(c.label, 'Online – Fault (type not reported)');
});
test('the demo list statuses ON and OFF are understood', () => {
  assert.equal(classifyStreetlight({ status: 'ON' }).statusId, 'ONLINE');
  assert.equal(classifyStreetlight({ status: 'OFF' }).statusId, 'OFFLINE');
});

test('the demo list wording "Lamp dark" is a lamp failure too', () => {
  assert.equal(classifyStreetlight({ status: 'FAULT', reported: 'Lamp dark' }).faultType, 'LAMP_FAILURE');
});
