import test from 'node:test';
import assert from 'node:assert/strict';
import { groupOf, summarize, assignedAt, sortAssigned } from './basicDashboard.js';
import { screenAllowed, ROLE_LABEL } from './access.js';

const live = (status, link = 'ONLINE', lux = 200) => ({ id: 'L-001', status: 'ONLINE', reported: status, lux, health: undefined, link });
const withHealth = (key) => ({ id: 'L-001', status: 'ONLINE', health: { key, tone: 'green' } });

test('lamp groups: normal, needs attention, no signal, no data', () => {
  assert.equal(groupOf(withHealth('GOOD')), 'normal');
  assert.equal(groupOf(withHealth('DAYLIGHT')), 'normal'); // daylight standby is never a fault
  assert.equal(groupOf(withHealth('SLEEPING')), 'normal'); // asleep as planned
  for (const k of ['FAULT', 'WARNING', 'NEAR_LIMIT', 'BLINKING', 'SENSOR_ERROR']) assert.equal(groupOf(withHealth(k)), 'attention', k);
  assert.equal(groupOf(withHealth('OFFLINE')), 'nosignal');
  assert.equal(groupOf({ id: 'L-002', status: 'NO DATA' }), 'nodata'); // missing data is never counted as a fault or as 0 lux
  assert.equal(groupOf({ id: 'L-003', status: 'UNINSTALLED' }), 'nodata');
});

test('summary counts every lamp exactly once', () => {
  const s = summarize([withHealth('GOOD'), withHealth('FAULT'), withHealth('OFFLINE'), withHealth('SLEEPING'), { id: 'x', status: 'NO DATA' }]);
  assert.deepEqual(s, { total: 5, normal: 2, attention: 1, nosignal: 1, nodata: 1 });
  assert.equal(groupOf(live('TOTAL_BLACKOUT')), 'attention');
  assert.equal(groupOf(live('NORMAL_LIT')), 'normal');
});

test('assigned date: the time the ticket was handed to this person, with sensible fallbacks', () => {
  const t = { createdAt: 100, firstResponseAt: 200, history: [{ action: 'TECHNICIAN_CHANGED', next: 'Bea', at: 300 }, { action: 'TECHNICIAN_CHANGED', next: 'Bea', at: 500 }, { action: 'TECHNICIAN_CHANGED', next: 'Other', at: 900 }] };
  assert.equal(assignedAt(t, 'Bea'), 500);
  assert.equal(assignedAt({ ...t, history: [] }, 'Bea'), 200);
  assert.equal(assignedAt({ createdAt: 100, history: [] }, 'Bea'), 100);
});

test('assigned works: urgent open work first, resolved work last', () => {
  const mk = (id, priority, status, createdAt) => ({ dbId: id, priority, status, createdAt, history: [] });
  const out = sortAssigned([mk('a', 'LOW', 'OPEN', 1), mk('b', 'CRITICAL', 'RESOLVED', 2), mk('c', 'HIGH', 'ASSIGNED', 3), mk('d', 'HIGH', 'ASSIGNED', 2)], 'Bea');
  assert.deepEqual(out.map((t) => t.dbId), ['d', 'c', 'a', 'b']);
});

test('screens: BASIC gets its own three screens and none of the technical ones', () => {
  for (const s of ['dashboard', 'map', 'works', 'history', 'schedule', 'settings', 'help', 'manual']) assert.equal(screenAllowed(s, 'BASIC'), true, s);
  for (const s of ['monitoring', 'details', 'maintenance', 'controls', 'users']) assert.equal(screenAllowed(s, 'BASIC'), false, s);
  for (const r of ['ADMIN', 'TECHNICIAN', 'STAFF']) for (const s of ['works', 'history', 'schedule']) assert.equal(screenAllowed(s, r), false, `${r} ${s}`);
  assert.equal(ROLE_LABEL.BASIC, 'Basic User');
});
