import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTicket, updateTicket, loadTickets, saveTickets, toDateInput } from './maintenanceStore.js';
import {
  USERS_KEY, loadUsers, saveUsers, registerUser, validateRegistration, setPresence, availability, listTechnicians, assignmentError, isPresent, nextUserId,
} from './technicianStore.js';

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };
const NOW = new Date('2026-11-07T10:00:00').getTime();
const reg = (users, name, role = 'TECHNICIAN') => [...users, registerUser(users, { name, email: `${name.split(' ')[0].toLowerCase()}@lumen.local`, role }, NOW)];
const tform = (o = {}) => ({ lamp: 'L-008', where: 'Market Street', issue: 'Lamp not illuminating', priority: 'HIGH', technicianId: null, technician: '', status: 'OPEN', reportDate: toDateInput(NOW), ...o });
const assign = (tickets, user, status = 'ASSIGNED', extra = {}) => [...tickets, createTicket(tickets, tform({ technicianId: user.id, technician: user.name, status, ...extra }), NOW)];

let users = [];
users = reg(users, 'Juan Dela Cruz');
users = reg(users, 'Mark Santos');
users = reg(users, 'Pedro Reyes');
const [juan, , pedro] = users;

test('1. present technician with no assignment is GREEN', () => {
  const u = setPresence(users, juan.id, true, NOW).find((x) => x.id === juan.id);
  const a = availability(u, [], NOW);
  assert.equal(a.available, true);
  assert.equal(a.label, 'Available');
});

test('2. present technician with an active assignment is RED', () => {
  const u = setPresence(users, juan.id, true, NOW).find((x) => x.id === juan.id);
  for (const status of ['ASSIGNED', 'IN PROGRESS']) {
    const a = availability(u, assign([], u, status), NOW);
    assert.equal(a.available, false);
    assert.match(a.reasons.join(), /Handling MT-1001/);
  }
});

test('3. absent technician is RED with or without assignment; registering never marks present', () => {
  assert.equal(juan.presentOn, null);
  assert.equal(availability(juan, [], NOW).available, false);
  const absentBusy = availability(juan, assign([], juan), NOW);
  assert.equal(absentBusy.available, false);
  assert.equal(absentBusy.reasons.length, 2);
});

test('presence only counts for today, so it expires on its own', () => {
  const on = setPresence(users, juan.id, true, NOW).find((x) => x.id === juan.id);
  assert.equal(isPresent(on, NOW), true);
  assert.equal(isPresent(on, NOW + 86400000), false);
  assert.equal(availability(setPresence([on], juan.id, false, NOW)[0], [], NOW).available, false);
});

test('4. resolving a ticket makes a present technician GREEN again', () => {
  const u = setPresence(users, juan.id, true, NOW).find((x) => x.id === juan.id);
  let tickets = assign([], u, 'IN PROGRESS');
  assert.equal(availability(u, tickets, NOW).available, false);
  tickets = [updateTicket(tickets[0], { ...tickets[0], status: 'RESOLVED' }, NOW + 1000)];
  assert.equal(availability(u, tickets, NOW).available, true);
  // ...but a resolved ticket does not make an ABSENT technician green
  assert.equal(availability(juan, tickets, NOW).available, false);
});

test('5. reassigning updates both technicians', () => {
  const on = setPresence(setPresence(users, juan.id, true, NOW), pedro.id, true, NOW);
  const [j, , p] = on;
  let tickets = assign([], j);
  assert.equal(availability(j, tickets, NOW).available, false);
  assert.equal(availability(p, tickets, NOW).available, true);
  tickets = [updateTicket(tickets[0], { ...tickets[0], technicianId: p.id, technician: p.name }, NOW + 1000)];
  assert.equal(availability(j, tickets, NOW).available, true);
  assert.equal(availability(p, tickets, NOW).available, false);
  assert.equal(tickets[0].technicianId, p.id);
});

test('unavailable technicians cannot receive a new active assignment', () => {
  const on = setPresence(users, juan.id, true, NOW);
  const [j, m] = on;
  assert.match(assignmentError({ status: 'ASSIGNED', technicianId: m.id }, on, [], NOW), /Absent/); // absent
  assert.equal(assignmentError({ status: 'ASSIGNED', technicianId: j.id }, on, [], NOW), null);
  const busy = assign([], j);
  assert.match(assignmentError({ status: 'ASSIGNED', technicianId: j.id }, on, busy, NOW), /Handling MT-1001/); // second job
  assert.equal(assignmentError({ ticket: busy[0], status: 'IN PROGRESS', technicianId: j.id }, on, busy, NOW), null); // keeps own ticket
  assert.equal(assignmentError({ status: 'OPEN', technicianId: null }, on, busy, NOW), null);
  assert.match(assignmentError({ status: 'ASSIGNED', technicianId: 'U-9999' }, on, [], NOW), /registered technician/);
});

test('6/7. only registered, eligible people are listed; new registrations appear', () => {
  let list = [];
  assert.deepEqual(listTechnicians(list, [], NOW), []);
  list = reg(list, 'Ana Lopez');
  list = reg(list, 'Viewer Person', 'VIEWER');
  assert.deepEqual(listTechnicians(list, [], NOW).map((t) => t.user.name), ['Ana Lopez']);
  list = reg(list, 'Ben Cruz');
  assert.deepEqual(listTechnicians(list, [], NOW).map((t) => t.user.name), ['Ana Lopez', 'Ben Cruz']);
});

test('registration validation: required fields, role, unique email; password is never stored', () => {
  const e = validateRegistration({ name: '', email: 'x', password: '123', role: 'ADMIN' }, users);
  for (const k of ['name', 'email', 'password', 'role']) assert.ok(e[k], k);
  assert.ok(validateRegistration({ name: 'Another', email: 'JUAN@lumen.local', password: '12345678', role: 'TECHNICIAN' }, users).email);
  const u = registerUser([], { name: '  Juan   Reyes ', email: 'J@L.com', password: 'secret123', role: 'TECHNICIAN' }, NOW);
  assert.equal(JSON.stringify(u).includes('secret123'), false);
  assert.equal(u.name, 'Juan Reyes');
  assert.equal(nextUserId([{ id: 'U-0007' }]), 'U-0008');
});

test('8/9. technicians, attendance and tickets persist; old name-only tickets stay intact', () => {
  const s = memStore();
  const on = setPresence(users, juan.id, true, NOW);
  assert.equal(saveUsers(on, s), true);
  assert.deepEqual(loadUsers(s), on);
  assert.equal(isPresent(loadUsers(s).find((u) => u.id === juan.id), NOW), true);
  // a ticket saved by the previous release (name only, no technicianId)
  const legacy = { id: 'MT-1001', lamp: 'L-008', where: 'Market Street', issue: 'Lamp not illuminating', priority: 'HIGH', technician: 'R. Cruz', status: 'IN PROGRESS', reportDate: '2026-11-07', createdAt: NOW, updatedAt: NOW, firstResponseAt: NOW, resolvedAt: null, resolution: '', history: [{ at: NOW, text: 'Ticket created' }] };
  saveTickets([legacy], s);
  const back = loadTickets(s);
  assert.deepEqual(back, [legacy]);
  assert.equal(availability(juan, back, NOW).activeTickets.length, 0); // legacy names never count against registered people
  const edited = updateTicket(back[0], { ...back[0], priority: 'LOW' }, NOW + 5000);
  assert.equal(edited.technician, 'R. Cruz');
  assert.equal(edited.history.length, 2);
  s.setItem(USERS_KEY, '{bad');
  assert.deepEqual(loadUsers(s), []);
});
