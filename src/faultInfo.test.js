import test from 'node:test';
import assert from 'node:assert/strict';
import { describeFault, describeFaults, countBySeverity } from './faultInfo.js';
import { activeConditions, reconcile, syncNotifications, getNotifications, markAllRead, unreadCount, __resetForTests } from './notifications.js';

const lamp = (o) => ({ id: 'L-001', loc: 'Main Road • Pole 01', status: 'ONLINE', reported: 'NORMAL_LIT', comm: 'Online', time: '10:00:00 AM', ...o });

test('healthy, uninstalled and no-data lamps have no fault', () => {
  assert.equal(describeFault(lamp({})), null);
  assert.equal(describeFault(lamp({ status: 'UNINSTALLED' })), null);
  assert.equal(describeFault(lamp({ status: 'NO DATA' })), null);
});

test('severity: offline and fault are critical, warning is warning, delayed report is info', () => {
  assert.equal(describeFault(lamp({ status: 'OFFLINE' })).severity, 'critical');
  assert.equal(describeFault(lamp({ status: 'FAULT', reported: 'TOTAL_BLACKOUT' })).severity, 'critical');
  assert.equal(describeFault(lamp({ status: 'WARNING', reported: 'LOW_LIGHT' })).severity, 'warning');
  assert.equal(describeFault(lamp({ comm: 'Stale' })).severity, 'info');
});

test('an unrecognised status is never presented as a confirmed hardware fault', () => {
  const f = describeFault(lamp({ status: 'WARNING', reported: 'WEIRD_TEXT' }));
  assert.equal(f.severity, 'warning');
  assert.match(f.problem, /not treated as a confirmed hardware fault/);
});

test('every fault has problem, causes, actions and a last-report time', () => {
  for (const r of ['TOTAL_BLACKOUT', 'BLINKING/UNSTABLE', 'SENSOR_ERROR']) {
    const f = describeFault(lamp({ status: 'FAULT', reported: r }));
    assert.ok(f.problem && f.causes.length && f.actions.length && f.lastReport);
  }
});

test('faults sort critical first and are counted', () => {
  const list = describeFaults([lamp({ id: 'L-002', status: 'WARNING', reported: 'LOW_LIGHT' }), lamp({ id: 'L-003', status: 'OFFLINE' }), lamp({})]);
  assert.deepEqual(list.map((f) => f.id), ['L-003', 'L-002']);
  assert.deepEqual(countBySeverity(list), { critical: 1, warning: 1, info: 0 });
});

test('reconcile adds new conditions once, and marks them cleared when they disappear', () => {
  const a = activeConditions([lamp({ status: 'OFFLINE' })]);
  let list = reconcile([], a, 1000);
  assert.equal(list.length, 1);
  assert.equal(list[0].read, false);
  list = reconcile(list, a, 2000); // same condition again: no duplicate
  assert.equal(list.length, 1);
  list = reconcile(list, [], 3000);
  assert.equal(list[0].state, 'cleared');
  assert.equal(list[0].clearedAt, 3000);
});

test('demo mode creates no notifications; losing the live link creates one connection event', () => {
  __resetForTests();
  syncNotifications([lamp({ status: 'FAULT', reported: 'SENSOR_ERROR' })], 'demo', 1);
  assert.equal(getNotifications().length, 0);
  syncNotifications([lamp({ status: 'FAULT', reported: 'SENSOR_ERROR' })], 'live', 2);
  assert.equal(getNotifications().length, 1);
  assert.equal(unreadCount(getNotifications()), 1);
  markAllRead();
  assert.equal(unreadCount(getNotifications()), 0);
  syncNotifications([], 'demo', 3);
  assert.equal(getNotifications()[0].kind, 'connection');
  syncNotifications([lamp({ status: 'FAULT', reported: 'SENSOR_ERROR' })], 'live', 4);
  assert.equal(getNotifications()[0].title, 'Receiver connection restored');
});
