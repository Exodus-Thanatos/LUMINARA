// Phase 5 Step 3: the BASIC role. It may SEE lamp status, the map data, history, the schedule and its own assigned works,
// and nothing else. These tests go through the real HTTP server so the 403s are the ones a browser would get.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepos, fakeHasher } from './testkit.js';
import { readConfig } from './config.js';
import { createServices } from './services.js';
import { createApi, createStreamRegistry } from './api.js';
import { can, ROLES, PERMISSIONS } from './permissions.js';

const { createAppServer, resetForTests } = await import('./server.js');

let repos; let services; let httpServer; let base;
const PW = 'Sup3rSecret-pw';

const boot = async () => {
  repos = createMemoryRepos();
  const config = { ...readConfig(), cookieSecure: false };
  const streams = createStreamRegistry();
  services = createServices({ repos, hasher: fakeHasher, config, onRevoke: (i) => streams.close(i) });
  httpServer = createAppServer(createApi({ services, streams, config }));
  await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${httpServer.address().port}`;
};
const stop = () => new Promise((r) => { httpServer.closeAllConnections?.(); httpServer.close(r); });
const addUser = async (o = {}) => repos.users.create({
  fullName: 'Test User', username: `user${Math.random().toString(36).slice(2, 8)}`, email: `${Math.random().toString(36).slice(2, 8)}@lumen.local`,
  passwordHash: await fakeHasher.hash(PW), role: 'STAFF', accountStatus: 'ACTIVE', mustChangePassword: false, ...o,
});
const call = async (method, path, { body, cookie } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  const sc = res.headers.getSetCookie?.() || [];
  return { status: res.status, json, cookie: sc[0] ? sc[0].split(';')[0] : null };
};
const signedIn = async (u) => (await call('POST', '/api/auth/login', { body: { identifier: u.username, password: PW } })).cookie;

beforeEach(async () => { await boot(); resetForTests(); });
afterEach(async () => { await stop(); });

test('BASIC is a real role, separate from ADMIN, TECHNICIAN and STAFF', () => {
  assert.ok(ROLES.includes('BASIC'));
  assert.equal(new Set(ROLES).size, ROLES.length);
});

test('BASIC holds only the read-only permissions it needs', () => {
  const granted = Object.keys(PERMISSIONS).filter((p) => can('BASIC', p)).sort();
  assert.deepEqual(granted, ['basic.dashboard', 'dashboard.view', 'history.view', 'maintenance.viewAssigned', 'schedule.view']);
  for (const p of ['controls.operate', 'schedule.edit', 'users.manage', 'settings.admin', 'maintenance.create', 'maintenance.edit', 'maintenance.updateOwn', 'maintenance.view', 'technical.view', 'technicians.list']) assert.equal(can('BASIC', p), false, p);
});

test('existing roles keep exactly what they had (and none of them gets the BASIC-only screens)', () => {
  for (const r of ['ADMIN', 'TECHNICIAN', 'STAFF']) {
    for (const p of ['dashboard.view', 'technical.view', 'maintenance.view', 'history.view', 'schedule.view', 'technicians.list']) assert.equal(can(r, p), true, `${r} ${p}`);
    assert.equal(can(r, 'basic.dashboard'), false, r);
    assert.equal(can(r, 'maintenance.viewAssigned'), false, r);
  }
  assert.equal(can('ADMIN', 'controls.operate'), true);
  assert.equal(can('TECHNICIAN', 'controls.operate'), true);
  assert.equal(can('STAFF', 'controls.operate'), false);
});

test('a BASIC user can read lamp status, control state, history, the schedule and their own works', async () => {
  const cookie = await signedIn(await addUser({ role: 'BASIC' }));
  for (const p of ['/api/auth/me', '/api/lamps', '/api/control', '/api/history', '/api/schedule', '/api/tickets']) {
    const r = await call('GET', p, { cookie });
    assert.equal(r.status, 200, p);
  }
  assert.equal((await call('GET', '/api/auth/me', { cookie })).json.user.role, 'BASIC');
  assert.equal((await call('GET', '/api/schedule', { cookie })).json.summary.state !== undefined, true);
});

test('a BASIC user cannot change lights, schedules, tickets, users or open technical data', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const tech = await addUser({ role: 'TECHNICIAN', fullName: 'Tomas Tech' });
  const t = await services.createTicket(admin, { lamp: 'L-008', where: 'Market Street', issue: 'Lamp flickers at night', priority: 'HIGH', status: 'ASSIGNED', technicianId: tech.id });
  const basic = await addUser({ role: 'BASIC' });
  const cookie = await signedIn(basic);
  const refused = [
    ['POST', '/api/control', { on: true }],
    ['PUT', '/api/schedule', { onTime: '19:00', offTime: '04:00' }],
    ['GET', '/api/users'],
    ['POST', '/api/users', { fullName: 'X Y', username: 'xyz', email: 'x@y.co', role: 'ADMIN', generateTemporaryPassword: true }],
    ['PATCH', `/api/users/${basic.id}`, { role: 'ADMIN' }],
    ['POST', `/api/users/${tech.id}/reset-password`, {}],
    ['GET', '/api/technicians'],
    ['POST', '/api/tickets', { lamp: 'L-008', where: 'Market Street', issue: 'Broken lamp here', priority: 'LOW', status: 'OPEN' }],
    ['PATCH', `/api/tickets/${t.dbId}`, { status: 'IN PROGRESS' }],
    ['POST', `/api/tickets/${t.dbId}/archive`, {}],
    ['POST', `/api/tickets/${t.dbId}/restore`, {}],
    ['POST', '/api/tickets/import', { tickets: [] }],
    ['GET', '/api/tickets?archived=1'],
    ['GET', '/api/pzem'],
    ['GET', '/api/pzem/history?range=1h'],
  ];
  for (const [m, p, body] of refused) {
    const r = await call(m, p, { cookie, body });
    assert.equal(r.status, 403, `${m} ${p} -> ${r.status}`);
  }
  assert.equal(repos._state().users.find((u) => u.id === basic.id).role, 'BASIC'); // nobody can promote themselves
  assert.equal(repos._state().tickets.find((x) => x.dbId === t.dbId).status, 'ASSIGNED');
});

test('Assigned Works: a BASIC user only ever receives tickets assigned to them', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const tech = await addUser({ role: 'TECHNICIAN', fullName: 'Tomas Tech' });
  const basic = await addUser({ role: 'BASIC', fullName: 'Bea Basic' });
  const other = await addUser({ role: 'BASIC', fullName: 'Ben Basic' });
  await services.createTicket(admin, { lamp: 'L-008', where: 'Market Street', issue: 'Lamp flickers at night', priority: 'HIGH', status: 'ASSIGNED', technicianId: tech.id });
  assert.equal((await services.listTickets(basic)).tickets.length, 0); // someone else's ticket is never visible
  // A ticket stored against this user (only possible by direct data entry: the admin form only offers technicians).
  const id = await repos.tickets.create({ lamp: 'L-009', where: 'Plaza', issue: 'Cover is cracked', priority: 'MEDIUM', technicianId: basic.id, status: 'ASSIGNED', reportedAt: Date.now(), firstResponseAt: Date.now(), createdBy: admin.id });
  const mine = await services.listTickets(basic);
  assert.deepEqual(mine.tickets.map((x) => x.dbId), [id]);
  assert.equal(mine.tickets[0].priority, 'MEDIUM');
  assert.equal((await services.listTickets(other)).tickets.length, 0);
  await assert.rejects(services.listTickets(basic, { archived: true }), (e) => e.status === 403);
});

test('a ticket cannot be assigned to a BASIC user (only active technicians can be)', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const basic = await addUser({ role: 'BASIC' });
  await assert.rejects(services.createTicket(admin, { lamp: 'L-008', where: 'Market Street', issue: 'Lamp flickers at night', priority: 'HIGH', status: 'ASSIGNED', technicianId: basic.id }), (e) => e.status === 400);
});

test('only an administrator can create a BASIC account, and BASIC cannot sign itself up', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const adminCookie = await signedIn(admin);
  const ok = await call('POST', '/api/users', { cookie: adminCookie, body: { fullName: 'Bea Basic', username: 'bea', email: 'bea@lumen.local', role: 'BASIC', generateTemporaryPassword: true } });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.user.role, 'BASIC');
  const staffCookie = await signedIn(await addUser({ role: 'STAFF' }));
  assert.equal((await call('POST', '/api/users', { cookie: staffCookie, body: { fullName: 'Bob Basic', username: 'bob', email: 'bob@lumen.local', role: 'BASIC', generateTemporaryPassword: true } })).status, 403);
  assert.equal((await call('POST', '/api/users', { body: { fullName: 'Bob Basic', username: 'bob', email: 'bob@lumen.local', role: 'BASIC' } })).status, 401);
});

test('STAFF and TECHNICIAN still reach the technical endpoints they had before', async () => {
  for (const role of ['STAFF', 'TECHNICIAN']) {
    const cookie = await signedIn(await addUser({ role }));
    assert.equal((await call('GET', '/api/pzem', { cookie })).status, 200, role);
    assert.equal((await call('GET', '/api/tickets', { cookie })).status, 200, role);
    assert.equal((await call('GET', '/api/history', { cookie })).status, 200, role);
  }
});
