// Read-only Data screen: who may open it, what it returns, and that it never leaks password hashes.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepos, fakeHasher } from './testkit.js';
import { readConfig } from './config.js';
import { createServices } from './services.js';
import { createApi, createStreamRegistry } from './api.js';
import { can, ROLES } from './permissions.js';

const { createAppServer, resetForTests } = await import('./server.js');

let repos; let services; let httpServer; let base;
const PW = 'Sup3rSecret-pw';

const boot = async () => {
  repos = createMemoryRepos();
  const config = { ...readConfig(), cookieSecure: false, loginMaxFailures: 5 };
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
const call = async (method, path, { cookie } = {}) => {
  const res = await fetch(base + path, { method, headers: cookie ? { Cookie: cookie } : {} });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
};
const login = async (u) => {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: u.username, password: PW }) });
  return (res.headers.getSetCookie?.()[0] || '').split(';')[0];
};

beforeEach(async () => { resetForTests(); await boot(); });
afterEach(stop);

test('data.view belongs to ADMIN and DEVELOPER only', () => {
  for (const r of ROLES) assert.equal(can(r, 'data.view'), r === 'ADMIN' || r === 'DEVELOPER', r);
});

test('Data endpoints need a sign-in', async () => {
  assert.equal((await call('GET', '/api/data/summary')).status, 401);
  assert.equal((await call('GET', '/api/data/tickets')).status, 401);
});

test('STAFF, TECHNICIAN and BASIC are refused', async () => {
  for (const role of ['STAFF', 'TECHNICIAN', 'BASIC']) {
    const cookie = await login(await addUser({ role }));
    assert.equal((await call('GET', '/api/data/summary', { cookie })).status, 403, role);
    assert.equal((await call('GET', '/api/data/tickets', { cookie })).status, 403, role);
  }
});

test('ADMIN sees counts including users; DEVELOPER sees counts without the user count', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const dev = await addUser({ role: 'DEVELOPER' });
  await repos.events.add({ streetlightId: 'L-008', occurredAt: 1000, type: 'STATUS_CHANGE', previous: null, next: 'GOOD', description: 'Connected', source: 'DEVICE' });
  const a = await call('GET', '/api/data/summary', { cookie: await login(admin) });
  assert.equal(a.status, 200);
  assert.equal(a.json.counts.events, 1);
  assert.equal(a.json.counts.users, 2);
  assert.equal(a.json.lastEventAt, 1000);
  const d = await call('GET', '/api/data/summary', { cookie: await login(dev) });
  assert.equal(d.status, 200);
  assert.equal(d.json.counts.users, null);
});

test('Data tickets: active and archived lists, and no password hash anywhere in the response', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const dev = await addUser({ role: 'DEVELOPER' });
  const cookie = await login(dev);
  const active = await call('GET', '/api/data/tickets', { cookie });
  assert.equal(active.status, 200);
  assert.deepEqual(active.json.tickets, []);
  const archived = await call('GET', '/api/data/tickets?archived=1', { cookie });
  assert.equal(archived.status, 200);
  const sum = await call('GET', '/api/data/summary', { cookie: await login(admin) });
  assert.ok(!/passwordHash|password_hash|\$2[aby]\$/.test(sum.text + active.text + archived.text));
});

test('Data endpoints are read-only: other methods are not routed', async () => {
  const cookie = await login(await addUser({ role: 'ADMIN' }));
  const r = await call('POST', '/api/data/summary', { cookie });
  assert.notEqual(r.status, 200);
});
