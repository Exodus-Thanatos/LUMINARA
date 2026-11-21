// Login, sessions, route protection, user management and the initial-admin seed.
// Uses the in-memory repositories (testkit.js) and the real HTTP server wrapper, so cookies, status codes and headers are real.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepos, fakeHasher } from './testkit.js';
import { readConfig } from './config.js';
import { createServices } from './services.js';
import { createApi, createStreamRegistry } from './api.js';
import { seedAdmin } from './seed-admin.js';

const { createAppServer, resetForTests } = await import('./server.js');

let repos; let services; let streams; let httpServer; let base; let config;
const PW = 'Sup3rSecret-pw';

const boot = async (over = {}) => {
  repos = createMemoryRepos();
  config = { ...readConfig(), cookieSecure: false, ...over };
  streams = createStreamRegistry();
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

const call = async (method, path, { body, cookie, headers = {}, raw } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  const sc = res.headers.getSetCookie?.() || [];
  return { status: res.status, json, setCookie: sc[0] || '', cookie: sc[0] ? sc[0].split(';')[0] : null };
};
const login = async (identifier, password = PW) => call('POST', '/api/auth/login', { body: { identifier, password } });
const signedIn = async (user) => (await login(user.username)).cookie;

beforeEach(async () => { await boot(); resetForTests(); });
afterEach(async () => { await stop(); });

test('every protected dashboard endpoint refuses a visitor who is not signed in', async () => {
  for (const [m, p] of [['GET', '/api/lamps'], ['GET', '/api/stream'], ['GET', '/api/control'], ['GET', '/api/pzem'], ['GET', '/api/pzem/history?range=1h'], ['GET', '/api/tickets'], ['GET', '/api/users'], ['GET', '/api/technicians'], ['GET', '/api/auth/me']]) {
    const r = await call(m, p);
    assert.equal(r.status, 401, `${m} ${p}`);
  }
  const post = await call('POST', '/api/control', { body: { on: true } });
  assert.equal(post.status, 401);
  assert.equal((await call('POST', '/api/users', { body: {} })).status, 401);
  assert.equal((await call('POST', '/api/tickets', { body: {} })).status, 401);
});

test('ESP32 endpoints still use only the device key, never a login', async () => {
  const bad = await call('POST', '/api/telemetry', { body: { type: 'RPT', nodeId: 1, seq: 1, lux: 10, status: 'NORMAL_LIT' }, headers: { 'X-Api-Key': 'wrong' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.code, 'bad_api_key');
  const ok = await call('POST', '/api/telemetry', { body: { type: 'RPT', nodeId: 1, seq: 1, lux: 10, status: 'NORMAL_LIT' }, headers: { 'X-Api-Key': process.env.DEVICE_KEY || 'rophil1234' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.accepted, true);
  const poll = await call('GET', '/api/command', { headers: { 'X-Api-Key': process.env.DEVICE_KEY || 'rophil1234' } });
  assert.equal(poll.status, 200);
});

test('login works with the right credentials (username or email) and sets a secure session cookie', async () => {
  const u = await addUser({ username: 'maria', email: 'maria@lumen.local' });
  const r = await login('maria');
  assert.equal(r.status, 200);
  assert.equal(r.json.user.username, 'maria');
  assert.ok(!('passwordHash' in r.json.user));
  assert.match(r.setCookie, /^luminara_session=/);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /SameSite=Lax/);
  assert.doesNotMatch(r.setCookie, /Secure/); // cookieSecure=false in this test config
  const byEmail = await login('MARIA@lumen.local');
  assert.equal(byEmail.status, 200);
  const me = await call('GET', '/api/auth/me', { cookie: r.cookie });
  assert.equal(me.json.user.id, u.id);
  const lamps = await call('GET', '/api/lamps', { cookie: r.cookie });
  assert.equal(lamps.status, 200); // the guard let the request through to the original receiver code
  assert.ok(Array.isArray(lamps.json.lamps));
});

test('the cookie gets the Secure flag when COOKIE_SECURE is on', async () => {
  await stop();
  await boot({ cookieSecure: true });
  await addUser({ username: 'maria' });
  const r = await login('maria');
  assert.match(r.setCookie, /; Secure/);
});

test('wrong password, unknown user and inactive account are all rejected properly', async () => {
  await addUser({ username: 'maria' });
  await addUser({ username: 'sleeper', accountStatus: 'INACTIVE' });
  const wrong = await login('maria', 'not-the-password1');
  const unknown = await login('nobody');
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.json.error, unknown.json.error); // does not reveal which usernames exist
  assert.equal(wrong.cookie, null);
  const inactive = await login('sleeper');
  assert.equal(inactive.status, 403);
  assert.equal(inactive.json.code, 'account_inactive');
  assert.equal(inactive.cookie, null);
  assert.equal((await login('sleeper', 'bad-password-1')).status, 401); // wrong password never reveals the account is inactive
});

test('logout ends the session on the server, not only in the browser', async () => {
  const u = await addUser();
  const cookie = await signedIn(u);
  assert.equal((await call('GET', '/api/lamps', { cookie })).status, 200);
  const out = await call('POST', '/api/auth/logout', { cookie, body: {} });
  assert.equal(out.status, 200);
  assert.match(out.setCookie, /Max-Age=0/);
  assert.equal((await call('GET', '/api/auth/me', { cookie })).status, 401); // the old cookie no longer works
  assert.equal((await call('GET', '/api/lamps', { cookie })).status, 401);
});

test('an expired session is refused', async () => {
  const u = await addUser();
  const cookie = await signedIn(u);
  repos._state().sessions.forEach((s) => { s.expiresAt = Date.now() - 1000; });
  assert.equal((await call('GET', '/api/auth/me', { cookie })).status, 401);
});

test('a deactivated user loses access immediately, even with a valid cookie', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const u = await addUser();
  const userCookie = await signedIn(u);
  const adminCookie = await signedIn(admin);
  assert.equal((await call('GET', '/api/lamps', { cookie: userCookie })).status, 200);
  const r = await call('PATCH', `/api/users/${u.id}`, { cookie: adminCookie, body: { accountStatus: 'INACTIVE' } });
  assert.equal(r.status, 200);
  assert.equal((await call('GET', '/api/lamps', { cookie: userCookie })).status, 401);
  assert.equal((await login(u.username)).status, 403);
});

test('repeated failed logins are throttled', async () => {
  await addUser({ username: 'maria' });
  for (let i = 0; i < config.loginMaxFailures; i += 1) assert.equal((await login('maria', 'wrong-pass-1')).status, 401);
  const blocked = await login('maria', PW); // even the right password is refused during the lockout
  assert.equal(blocked.status, 429);
});

test('only an administrator can list, create, edit or reset users', async () => {
  const staff = await addUser({ role: 'STAFF' });
  const tech = await addUser({ role: 'TECHNICIAN' });
  const victim = await addUser();
  for (const u of [staff, tech]) {
    const cookie = await signedIn(u);
    assert.equal((await call('GET', '/api/users', { cookie })).status, 403);
    assert.equal((await call('POST', '/api/users', { cookie, body: { fullName: 'X Y', username: 'xyz', email: 'x@y.co', role: 'ADMIN', generateTemporaryPassword: true } })).status, 403);
    assert.equal((await call('PATCH', `/api/users/${victim.id}`, { cookie, body: { role: 'ADMIN' } })).status, 403);
    assert.equal((await call('PATCH', `/api/users/${u.id}`, { cookie, body: { role: 'ADMIN' } })).status, 403); // nobody promotes themselves
    assert.equal((await call('POST', `/api/users/${victim.id}/reset-password`, { cookie, body: {} })).status, 403);
  }
  assert.equal(repos._state().users.filter((u) => u.role === 'ADMIN').length, 0);
});

test('an administrator creates users with a chosen role; duplicates and weak passwords are rejected', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const cookie = await signedIn(admin);
  const body = { fullName: 'Juan Dela Cruz', username: 'juan', email: 'Juan@Lumen.local', role: 'TECHNICIAN', accountStatus: 'ACTIVE', password: 'Gr33n-lights-ok', confirmPassword: 'Gr33n-lights-ok' };
  const ok = await call('POST', '/api/users', { cookie, body });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.user.role, 'TECHNICIAN');
  assert.equal(ok.json.user.email, 'juan@lumen.local');
  assert.equal(ok.json.user.mustChangePassword, true);
  assert.ok(!('passwordHash' in ok.json.user));
  const row = repos._state().users.find((u) => u.username === 'juan');
  assert.ok(!row.passwordHash.includes('Gr33n-lights-ok')); // never stored in plain text
  assert.equal(row.createdBy, admin.id);

  const dupName = await call('POST', '/api/users', { cookie, body: { ...body, username: 'JUAN', email: 'other@lumen.local' } });
  assert.equal(dupName.status, 400);
  assert.ok(dupName.json.fields.username);
  const dupMail = await call('POST', '/api/users', { cookie, body: { ...body, username: 'juan2', email: 'JUAN@lumen.local' } });
  assert.equal(dupMail.status, 400);
  assert.ok(dupMail.json.fields.email);

  const weak = await call('POST', '/api/users', { cookie, body: { ...body, username: 'weak1', email: 'w@lumen.local', password: 'short1', confirmPassword: 'short1' } });
  assert.ok(weak.json.fields.password);
  const mismatch = await call('POST', '/api/users', { cookie, body: { ...body, username: 'mm1', email: 'mm@lumen.local', confirmPassword: 'different-1234' } });
  assert.ok(mismatch.json.fields.confirmPassword);
  const badRole = await call('POST', '/api/users', { cookie, body: { ...body, username: 'br1', email: 'br@lumen.local', role: 'SUPERUSER' } });
  assert.ok(badRole.json.fields.role);
  const missing = await call('POST', '/api/users', { cookie, body: { role: 'STAFF', generateTemporaryPassword: true } });
  assert.ok(missing.json.fields.fullName && missing.json.fields.username && missing.json.fields.email);
});

test('a generated temporary password is shown once, works once, and must be changed', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const cookie = await signedIn(admin);
  const created = await call('POST', '/api/users', { cookie, body: { fullName: 'Ana Reyes', username: 'ana', email: 'ana@lumen.local', role: 'STAFF', generateTemporaryPassword: true } });
  assert.equal(created.status, 201);
  const temp = created.json.temporaryPassword;
  assert.ok(temp && temp.length >= 12);
  const list = await call('GET', '/api/users', { cookie });
  assert.ok(!JSON.stringify(list.json).includes(temp)); // never returned again
  const first = await login('ana', temp);
  assert.equal(first.status, 200);
  assert.equal(first.json.user.mustChangePassword, true);
  // until the password is changed, nothing but change-password / me / logout works
  assert.equal((await call('GET', '/api/lamps', { cookie: first.cookie })).json.code, 'password_change_required');
  assert.equal((await call('GET', '/api/auth/me', { cookie: first.cookie })).status, 200);
  const weak = await call('POST', '/api/auth/change-password', { cookie: first.cookie, body: { currentPassword: temp, newPassword: 'abc' } });
  assert.equal(weak.status, 400);
  const wrongCurrent = await call('POST', '/api/auth/change-password', { cookie: first.cookie, body: { currentPassword: 'nope-nope-1', newPassword: 'Brand-new-pw-77' } });
  assert.equal(wrongCurrent.status, 400);
  const changed = await call('POST', '/api/auth/change-password', { cookie: first.cookie, body: { currentPassword: temp, newPassword: 'Brand-new-pw-77' } });
  assert.equal(changed.status, 200);
  assert.equal((await call('GET', '/api/lamps', { cookie: first.cookie })).status, 200);
  assert.equal((await login('ana', temp)).status, 401);
  assert.equal((await login('ana', 'Brand-new-pw-77')).json.user.mustChangePassword, false);
});

test('admin password reset: old password stops working, sessions end, a new temporary password must be changed', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const u = await addUser({ username: 'pedro' });
  const adminCookie = await signedIn(admin);
  const userCookie = await signedIn(u);
  const r = await call('POST', `/api/users/${u.id}/reset-password`, { cookie: adminCookie, body: {} });
  assert.equal(r.status, 200);
  assert.ok(r.json.temporaryPassword);
  assert.equal((await call('GET', '/api/lamps', { cookie: userCookie })).status, 401);
  assert.equal((await login('pedro', PW)).status, 401);
  assert.equal((await login('pedro', r.json.temporaryPassword)).json.user.mustChangePassword, true);
});

test('the last active administrator cannot be deactivated or demoted, but one of two can', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const cookie = await signedIn(admin);
  const deactivate = await call('PATCH', `/api/users/${admin.id}`, { cookie, body: { accountStatus: 'INACTIVE' } });
  assert.equal(deactivate.status, 409);
  assert.equal(deactivate.json.code, 'last_admin');
  const demote = await call('PATCH', `/api/users/${admin.id}`, { cookie, body: { role: 'STAFF' } });
  assert.equal(demote.status, 409);
  const other = await addUser({ role: 'ADMIN' });
  await repos.users.update(other.id, { accountStatus: 'INACTIVE' }); // an inactive admin does not count
  assert.equal((await call('PATCH', `/api/users/${admin.id}`, { cookie, body: { role: 'STAFF' } })).status, 409);
  await repos.users.update(other.id, { accountStatus: 'ACTIVE' });
  assert.equal((await call('PATCH', `/api/users/${admin.id}`, { cookie, body: { role: 'STAFF' } })).status, 200);
  assert.equal(repos._state().users.find((u) => u.id === admin.id).role, 'STAFF');
});

test('editing a user changes details and role; a role change signs that user out', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const u = await addUser({ role: 'STAFF', username: 'lena' });
  const cookie = await signedIn(admin);
  const uCookie = await signedIn(u);
  const r = await call('PATCH', `/api/users/${u.id}`, { cookie, body: { fullName: 'Lena Cruz', role: 'TECHNICIAN' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.role, 'TECHNICIAN');
  assert.equal(r.json.user.fullName, 'Lena Cruz');
  assert.equal((await call('GET', '/api/lamps', { cookie: uCookie })).status, 401);
  const clash = await call('PATCH', `/api/users/${u.id}`, { cookie, body: { username: admin.username } });
  assert.equal(clash.status, 400);
  assert.equal((await call('PATCH', '/api/users/99999', { cookie, body: { fullName: 'Nobody Here' } })).status, 404);
});

test('manual lights control: staff are refused, technicians and admins pass through to the receiver', async () => {
  const staff = await addUser({ role: 'STAFF' });
  const tech = await addUser({ role: 'TECHNICIAN' });
  const admin = await addUser({ role: 'ADMIN' });
  assert.equal((await call('POST', '/api/control', { cookie: await signedIn(staff), body: { on: true } })).status, 403);
  assert.equal((await call('POST', '/api/control', { cookie: await signedIn(tech), body: { on: true } })).status, 200);
  assert.equal((await call('POST', '/api/control', { cookie: await signedIn(admin), body: { on: false } })).status, 200);
  assert.equal((await call('GET', '/api/control', { cookie: await signedIn(staff) })).status, 200); // staff may still look
});

test('cross-site requests and non-JSON bodies are refused', async () => {
  await addUser({ username: 'maria' });
  const evil = await call('POST', '/api/auth/login', { body: { identifier: 'maria', password: PW }, headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  assert.equal(evil.json.code, 'bad_origin');
  const same = await call('POST', '/api/auth/login', { body: { identifier: 'maria', password: PW }, headers: { Origin: base } });
  assert.equal(same.status, 200);
  const form = await call('POST', '/api/auth/login', { raw: 'identifier=maria&password=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
});

test('logging out cuts the live dashboard stream', async () => {
  const u = await addUser();
  const cookie = await signedIn(u);
  const res = await fetch(`${base}/api/stream`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const reader = res.body.getReader();
  await reader.read(); // the first snapshot
  assert.equal(streams.size, 1);
  await call('POST', '/api/auth/logout', { cookie, body: {} });
  const end = await Promise.race([
    (async () => { for (;;) { const { done } = await reader.read(); if (done) return 'closed'; } })(),
    new Promise((r) => setTimeout(() => r('still open'), 2000)),
  ]);
  assert.equal(end, 'closed');
});

test('initial administrator: created from environment variables once, refuses weak passwords, never repeats', async () => {
  const logs = [];
  const log = (m) => logs.push(m);
  const env = { INITIAL_ADMIN_FULL_NAME: 'Site Owner', INITIAL_ADMIN_USERNAME: 'owner', INITIAL_ADMIN_EMAIL: 'owner@lumen.local', INITIAL_ADMIN_PASSWORD: 'weak' };
  const bad = await seedAdmin({ repos, hasher: fakeHasher, env, log });
  assert.equal(bad.created, false);
  assert.equal(repos._state().users.length, 0);
  env.INITIAL_ADMIN_PASSWORD = 'Opening-Pass-42';
  const ok = await seedAdmin({ repos, hasher: fakeHasher, env, log });
  assert.equal(ok.created, true);
  const row = repos._state().users[0];
  assert.equal(row.role, 'ADMIN');
  assert.equal(row.mustChangePassword, true);
  assert.ok(!row.passwordHash.includes('Opening-Pass-42'));
  assert.ok(!logs.join('\n').includes('Opening-Pass-42')); // the password is never printed
  const again = await seedAdmin({ repos, hasher: fakeHasher, env: { ...env, INITIAL_ADMIN_USERNAME: 'second' }, log });
  assert.equal(again.created, false);
  assert.equal(repos._state().users.length, 1);
  assert.equal((await login('owner', 'Opening-Pass-42')).status, 200); // the seeded admin can sign in
});

test('there is no public registration route', async () => {
  for (const p of ['/api/auth/register', '/api/auth/signup', '/api/signup', '/api/register']) {
    const r = await call('POST', p, { body: { fullName: 'Eve', username: 'eve', email: 'eve@x.co', password: PW, role: 'ADMIN' } });
    assert.ok([401, 404].includes(r.status), `${p} -> ${r.status}`);
  }
  assert.equal(repos._state().users.length, 0);
});
