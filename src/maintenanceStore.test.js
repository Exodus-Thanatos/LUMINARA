import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, loadTickets, saveTickets, nextTicketNumber, validateTicket, createTicket, updateTicket, summarize, toDateInput, formatDuration,
} from './maintenanceStore.js';

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };
const NOW = new Date('2026-11-07T10:00:00').getTime();
const form = (o = {}) => ({ lamp: 'l-008', where: 'Market Street', issue: 'Lamp not illuminating', priority: 'HIGH', technician: '', status: 'OPEN', reportDate: toDateInput(NOW), ...o });

test('ticket numbers start at MT-1001 and never repeat', () => {
  assert.equal(nextTicketNumber([]), 'MT-1001');
  assert.equal(nextTicketNumber([{ id: 'MT-1001' }, { id: 'MT-1007' }]), 'MT-1008');
});

test('validation catches missing and malformed fields', () => {
  assert.deepEqual(validateTicket(form(), { now: NOW }), {});
  const e = validateTicket(form({ lamp: 'X1', where: '', issue: 'ab', priority: 'x', reportDate: '2026-12-01', status: 'ASSIGNED' }), { now: NOW });
  for (const k of ['lamp', 'where', 'issue', 'priority', 'reportDate', 'technician']) assert.ok(e[k], k);
});

test('ASSIGNED / IN PROGRESS need a technician', () => {
  assert.ok(validateTicket(form({ status: 'IN PROGRESS' }), { now: NOW }).technician);
  assert.deepEqual(validateTicket(form({ status: 'IN PROGRESS', technician: 'R. Cruz' }), { now: NOW }), {});
});

test('create normalises lamp id and logs history', () => {
  const t = createTicket([], form(), NOW);
  assert.equal(t.id, 'MT-1001');
  assert.equal(t.lamp, 'L-008');
  assert.equal(t.firstResponseAt, null);
  assert.equal(t.history.length, 1);
});

test('update tracks status, technician, response and resolution times', () => {
  let t = createTicket([], form(), NOW);
  t = updateTicket(t, { ...t, technician: 'R. Cruz', status: 'ASSIGNED' }, NOW + 600000);
  assert.equal(t.firstResponseAt, NOW + 600000);
  t = updateTicket(t, { ...t, status: 'RESOLVED' }, NOW + 1200000, 'Replaced driver');
  assert.equal(t.resolvedAt, NOW + 1200000);
  assert.equal(t.resolution, 'Replaced driver');
  const same = updateTicket(t, { ...t }, NOW + 1300000);
  assert.equal(same, t); // no change -> same object, no history noise
  const reopened = updateTicket(t, { ...t, status: 'IN PROGRESS' }, NOW + 1400000);
  assert.equal(reopened.resolvedAt, null);
});

test('summary cards are derived from the tickets', () => {
  assert.deepEqual(summarize([], NOW), { open: 0, inProgress: 0, resolvedToday: 0, avgResponseMs: null, responseSamples: 0 });
  const mk = (o) => ({ ...createTicket([], form({ technician: 'A' }), NOW), ...o });
  const tickets = [
    mk({ status: 'OPEN', firstResponseAt: null }),
    mk({ status: 'IN PROGRESS', firstResponseAt: NOW + 10 * 60000 }),
    mk({ status: 'RESOLVED', firstResponseAt: NOW + 20 * 60000, resolvedAt: NOW + 3600000 }),
    mk({ status: 'RESOLVED', firstResponseAt: NOW + 30 * 60000, resolvedAt: NOW - 3 * 86400000 }),
  ];
  const s = summarize(tickets, NOW + 7200000);
  assert.equal(s.open, 1);
  assert.equal(s.inProgress, 1);
  assert.equal(s.resolvedToday, 1);
  assert.equal(s.avgResponseMs, 20 * 60000); // 3 samples: 10, 20, 30 min
  assert.equal(summarize(tickets.slice(0, 2), NOW).avgResponseMs, null); // fewer than 3 samples
});

test('storage round-trips and survives bad data', () => {
  const s = memStore();
  assert.deepEqual(loadTickets(s), []);
  const t = createTicket([], form(), NOW);
  assert.equal(saveTickets([t], s), true);
  assert.deepEqual(loadTickets(s), [t]);
  s.setItem(STORAGE_KEY, '{not json');
  assert.deepEqual(loadTickets(s), []);
  assert.equal(saveTickets([t], { setItem() { throw new Error('quota'); } }), false);
});

test('formatDuration', () => {
  assert.equal(formatDuration(18 * 60000), '18 min');
  assert.equal(formatDuration(90 * 60000), '1.5 hr');
});
