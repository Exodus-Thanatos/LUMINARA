import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionState, lampFreshness, fmtAge } from './dashboardStatus.js';

test('connection levels follow the age of the last snapshot', () => {
  const base = { mode: 'live', connecting: false };
  assert.equal(connectionState({ ...base, receivedAt: 1000, now: 6000 }).level, 'fresh');
  assert.equal(connectionState({ ...base, receivedAt: 1000, now: 31000 }).level, 'delayed');
  assert.equal(connectionState({ ...base, receivedAt: 1000, now: 100000 }).level, 'outdated');
});

test('connecting and disconnected are distinct, and demo data is never called connected', () => {
  assert.equal(connectionState({ mode: 'demo', connecting: true, receivedAt: null, now: 0 }).level, 'connecting');
  const d = connectionState({ mode: 'demo', connecting: false, receivedAt: null, now: 0 });
  assert.equal(d.level, 'disconnected');
  assert.match(d.detail, /Sample data/);
  assert.equal(connectionState({ mode: 'live', connecting: false, receivedAt: null, now: 0 }).level, 'connecting');
});

test('fmtAge and lampFreshness', () => {
  assert.equal(fmtAge(4000), '4 s ago');
  assert.equal(fmtAge(125000), '2 min ago');
  const r = lampFreshness([{ status: 'ONLINE', comm: 'Online' }, { status: 'ONLINE', comm: 'Stale' }, { status: 'OFFLINE', comm: 'Offline' }, { status: 'UNINSTALLED' }]);
  assert.deepEqual(r, { total: 3, offline: 1, late: 1, onTime: 1 });
});
