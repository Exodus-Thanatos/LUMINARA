// Phase 5 Step 4: developer registration keys. Everything goes through the real HTTP server, so the statuses are the ones a browser gets.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepos, fakeHasher } from './testkit.js';
import { readConfig } from './config.js';
import { createServices, hashInviteKey } from './services.js';
import { createApi, createStreamRegistry } from './api.js';
import { can, ROLES, PERMISSIONS } from './permissions.js';

const { createAppServer, resetForTests } = await import('./server.js');

let repos; let services; let httpServer; let base;
const PW = 'Sup3rSecret-pw';
const NEWPW = 'Dev3loper-Pass9';

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
const call = async (method, path, { body, cookie } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  let text = '';
  try { text = await res.text(); json = JSON.parse(text); } catch { /* not json */ }
  const sc = res.headers.getSetCookie?.() || [];
  return { status: res.status, json, text, cookie: sc[0] ? sc[0].split(';')[0] : null };
};
const signedIn = async (u, password = PW) => (await call('POST', '/api/auth/login', { body: { identifier: u.username, password } })).cookie;
const newKey = async (admin, body = { label: 'For Dana' }) => {
  const cookie = await signedIn(admin);
  const r = await call('POST', '/api/developer-invites', { body, cookie });
  return { ...r, cookie, key: r.json?.key };
};
const reg = (over = {}) => ({ fullName: 'Dana Dev', username: 'dana.dev', email: 'dana@lumen.local', password: NEWPW, confirmPassword: NEWPW, registrationKey: '', ...over });

beforeEach(async () => { await boot(); resetForTests(); });
afterEach(async () => { await stop(); });

test('DEVELOPER is a separate role with read-only technical access and no administrative power', () => {
  assert.ok(ROLES.includes('DEVELOPER'));
  assert.equal(new Set(ROLES).size, ROLES.length);
  const granted = Object.keys(PERMISSIONS).filter((p) => can('DEVELOPER', p)).sort();
  assert.deepEqual(granted, ['dashboard.view', 'data.view', 'history.view', 'schedule.view', 'technical.view']);
  for (const p of ['controls.operate', 'schedule.edit', 'users.manage', 'developers.invite', 'settings.admin', 'maintenance.create', 'maintenance.edit', 'maintenance.view', 'basic.dashboard']) assert.equal(can('DEVELOPER', p), false, p);
  assert.deepEqual(PERMISSIONS['developers.invite'], ['ADMIN']);
  for (const r of ['TECHNICIAN', 'STAFF', 'BASIC']) assert.equal(can(r, 'developers.invite'), false, r);
});

test('an administrator creates a key: the key is returned once and only its hash is stored', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const r = await newKey(admin);
  assert.equal(r.status, 201);
  assert.match(r.key, /^LDK-[A-Za-z0-9_-]{32}$/);
  assert.equal(r.json.invite.status, 'ACTIVE');
  assert.equal(r.json.invite.label, 'For Dana');
  assert.equal(JSON.stringify(repos.invites._keyHashes()).includes(r.key), false);
  assert.deepEqual(repos.invites._keyHashes(), [hashInviteKey(r.key)]);
  const list = await call('GET', '/api/developer-invites', { cookie: r.cookie });
  assert.equal(list.status, 200);
  assert.equal(list.text.includes(r.key), false, 'the list must never contain the key');
  assert.equal(list.text.includes(hashInviteKey(r.key)), false, 'nor its hash');
  assert.equal(list.json.invites[0].status, 'ACTIVE');
});

test('keys are random and carry an expiry; the label and the days are validated', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const a = await newKey(admin);
  const b = await newKey(admin);
  assert.notEqual(a.key, b.key);
  const inv = (await repos.invites.list())[0];
  assert.ok(inv.expiresAt > Date.now() + 6 * 86400000 && inv.expiresAt < Date.now() + 8 * 86400000, 'default 7 days');
  const cookie = await signedIn(admin);
  assert.equal((await call('POST', '/api/developer-invites', { body: { label: '' }, cookie })).status, 400);
  assert.equal((await call('POST', '/api/developer-invites', { body: { label: 'ok', expiresInDays: 0 }, cookie })).status, 400);
  assert.equal((await call('POST', '/api/developer-invites', { body: { label: 'ok', expiresInDays: 365 }, cookie })).status, 400);
  assert.equal((await call('POST', '/api/developer-invites', { body: { label: 'ok', expiresInDays: 'abc' }, cookie })).status, 400);
});

test('only an ADMIN may create, list or revoke keys; everyone else gets 403, a visitor 401', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const { json } = await newKey(admin);
  const id = json.invite.id;
  for (const role of ['TECHNICIAN', 'STAFF', 'BASIC', 'DEVELOPER']) {
    const cookie = await signedIn(await addUser({ role }));
    assert.equal((await call('POST', '/api/developer-invites', { body: { label: 'Sneaky' }, cookie })).status, 403, `create as ${role}`);
    assert.equal((await call('GET', '/api/developer-invites', { cookie })).status, 403, `list as ${role}`);
    assert.equal((await call('POST', `/api/developer-invites/${id}/revoke`, { body: {}, cookie })).status, 403, `revoke as ${role}`);
  }
  assert.equal((await call('POST', '/api/developer-invites', { body: { label: 'Visitor' } })).status, 401);
  assert.equal((await call('GET', '/api/developer-invites')).status, 401);
  assert.equal(repos.invites._keyHashes().length, 1, 'nothing extra was created');
});

test('a valid key creates a DEVELOPER account that can sign in, and the key works only once', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const { key } = await newKey(admin);
  const r = await call('POST', '/api/auth/register-developer', { body: reg({ registrationKey: key }) });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.role, 'DEVELOPER');
  assert.equal(r.json.user.accountStatus, 'ACTIVE');
  assert.equal(r.json.user.passwordHash, undefined);
  assert.equal(r.text.includes(key), false);
  const login = await call('POST', '/api/auth/login', { body: { identifier: 'dana.dev', password: NEWPW } });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.role, 'DEVELOPER');
  assert.equal(login.json.user.mustChangePassword, false);
  // the same key again: refused, the second account does not exist
  const again = await call('POST', '/api/auth/register-developer', { body: reg({ registrationKey: key, username: 'second.dev', email: 'second@lumen.local' }) });
  assert.equal(again.status, 403);
  assert.equal(again.json.code, 'invalid_registration_key');
  assert.equal(await repos.users.findByUsername('second.dev'), null);
  const list = (await repos.invites.list())[0];
  assert.equal(list.status, 'USED');
  assert.equal(list.usedByUsername, 'dana.dev');
});

test('the request cannot choose the role: role/ADMIN fields are ignored and the account is a DEVELOPER', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const { key } = await newKey(admin);
  const r = await call('POST', '/api/auth/register-developer', { body: { ...reg({ registrationKey: key }), role: 'ADMIN', accountStatus: 'INACTIVE', mustChangePassword: true, isAdmin: true } });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.role, 'DEVELOPER');
  assert.equal(r.json.user.accountStatus, 'ACTIVE');
  assert.equal((await repos.users.findByUsername('dana.dev')).role, 'DEVELOPER');
  assert.equal(await repos.users.countAdmins(), 1);
});

test('without a key, or with a wrong, malformed, revoked, expired or used key, no account is created and the answer is identical', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const good = await newKey(admin);
  const revoked = await newKey(admin, { label: 'Revoke me' });
  assert.equal((await call('POST', `/api/developer-invites/${revoked.json.invite.id}/revoke`, { body: {}, cookie: revoked.cookie })).status, 200);
  const exp = `LDK-${'e'.repeat(32)}`;
  await repos.invites.create({ keyHash: hashInviteKey(exp), label: 'Short lived', createdBy: admin.id, expiresAt: Date.now() + 60000 });
  repos._setClock(() => Date.now() + 3600000); // an hour later
  // four attempts: one more failure would trip the 5-attempt throttle (covered by its own test below)
  const attempts = [`LDK-${'x'.repeat(32)}`, 'LDK-short', revoked.key, exp];
  const answers = [];
  for (const k of attempts) {
    const r = await call('POST', '/api/auth/register-developer', { body: reg({ registrationKey: k }) });
    assert.equal(r.status, 403, k);
    answers.push(JSON.stringify(r.json));
  }
  assert.equal(new Set(answers).size, 1, 'wrong, revoked, expired and malformed keys must be indistinguishable');
  assert.equal(await repos.users.findByUsername('dana.dev'), null);
  repos._setClock(() => Date.now());
  const ok = await call('POST', '/api/auth/register-developer', { body: reg({ registrationKey: good.key }) });
  assert.equal(ok.status, 201, 'the untouched key still works');
});

test('a missing key is a field error and registers nothing', async () => {
  const r = await call('POST', '/api/auth/register-developer', { body: reg({ registrationKey: '' }) });
  assert.equal(r.status, 400);
  assert.ok(r.json.fields.registrationKey);
  assert.equal(await repos.users.findByUsername('dana.dev'), null);
  assert.equal((await call('POST', '/api/auth/register-developer', { body: { ...reg(), registrationKey: 12345 } })).status, 400);
});

test('a failed registration does not use up the key (weak password, mismatch, taken username or email)', async () => {
  const admin = await addUser({ role: 'ADMIN', username: 'boss', email: 'boss@lumen.local' });
  const { key } = await newKey(admin);
  const bad = [
    reg({ registrationKey: key, password: 'short1', confirmPassword: 'short1' }),
    reg({ registrationKey: key, confirmPassword: 'Different-Pass9' }),
    reg({ registrationKey: key, fullName: 'x' }),
    reg({ registrationKey: key, username: 'BOSS' }),
    reg({ registrationKey: key, email: 'boss@lumen.local' }),
  ];
  for (const b of bad) assert.equal((await call('POST', '/api/auth/register-developer', { body: b })).status, 400);
  assert.equal((await repos.invites.list())[0].status, 'ACTIVE', 'the key is still usable');
  assert.equal((await call('POST', '/api/auth/register-developer', { body: reg({ registrationKey: key }) })).status, 201);
});

test('registration with a taken username is only revealed to someone holding a valid key', async () => {
  await addUser({ role: 'STAFF', username: 'taken', email: 'taken@lumen.local' });
  const noKey = await call('POST', '/api/auth/register-developer', { body: reg({ username: 'taken', registrationKey: `LDK-${'z'.repeat(32)}` }) });
  assert.equal(noKey.status, 403);
  assert.equal(JSON.stringify(noKey.json).includes('taken'), false);
});

test('an administrator can revoke an unused key; a used key cannot be revoked; revoking twice is harmless', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const a = await newKey(admin, { label: 'Unused' });
  const rev = await call('POST', `/api/developer-invites/${a.json.invite.id}/revoke`, { body: {}, cookie: a.cookie });
  assert.equal(rev.status, 200);
  assert.equal(rev.json.invite.status, 'REVOKED');
  assert.equal((await call('POST', `/api/developer-invites/${a.json.invite.id}/revoke`, { body: {}, cookie: a.cookie })).status, 200);
  const reject = await call('POST', '/api/auth/register-developer', { body: reg({ registrationKey: a.key }) });
  assert.equal(reject.status, 403);
  const b = await newKey(admin, { label: 'Will be used' });
  assert.equal((await call('POST', '/api/auth/register-developer', { body: reg({ registrationKey: b.key }) })).status, 201);
  assert.equal((await call('POST', `/api/developer-invites/${b.json.invite.id}/revoke`, { body: {}, cookie: b.cookie })).status, 409);
  assert.equal((await call('POST', '/api/developer-invites/99999/revoke', { body: {}, cookie: b.cookie })).status, 404);
});

test('repeated wrong keys are throttled, and the throttle also stops a later correct key from the same address', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const { key } = await newKey(admin);
  for (let i = 0; i < 5; i += 1) assert.equal((await call('POST', '/api/auth/register-developer', { body: reg({ registrationKey: `LDK-${String(i).repeat(32)}` }) })).status, 403);
  const blocked = await call('POST', '/api/auth/register-developer', { body: reg({ registrationKey: key }) });
  assert.equal(blocked.status, 429);
  assert.equal(await repos.users.findByUsername('dana.dev'), null);
  assert.equal((await repos.invites.list())[0].status, 'ACTIVE');
});

test('a developer account is read-only: no lights, schedule, tickets, users or keys', async () => {
  const dev = await addUser({ role: 'DEVELOPER' });
  const cookie = await signedIn(dev);
  assert.equal((await call('GET', '/api/lamps', { cookie })).status, 200);
  assert.equal((await call('GET', '/api/history', { cookie })).status, 200);
  assert.equal((await call('GET', '/api/schedule', { cookie })).status, 200);
  assert.equal((await call('GET', '/api/pzem', { cookie })).status, 200);
  assert.equal((await call('POST', '/api/control', { body: { command: 'on' }, cookie })).status, 403);
  assert.equal((await call('PUT', '/api/schedule', { body: { onTime: '18:00', offTime: '05:00' }, cookie })).status, 403);
  assert.equal((await call('GET', '/api/users', { cookie })).status, 403);
  assert.equal((await call('GET', '/api/tickets', { cookie })).status, 403);
  assert.equal((await call('POST', '/api/tickets', { body: {}, cookie })).status, 403);
  assert.equal((await call('GET', '/api/developer-invites', { cookie })).status, 403);
});

test('existing accounts are unaffected: admin, technician, staff and basic still sign in with their roles', async () => {
  for (const role of ['ADMIN', 'TECHNICIAN', 'STAFF', 'BASIC']) {
    const u = await addUser({ role });
    const r = await call('POST', '/api/auth/login', { body: { identifier: u.username, password: PW } });
    assert.equal(r.status, 200, role);
    assert.equal(r.json.user.role, role);
  }
  const admin = await addUser({ role: 'ADMIN' });
  assert.equal((await call('GET', '/api/users', { cookie: await signedIn(admin) })).status, 200);
});

test('a deactivated developer cannot sign in', async () => {
  const admin = await addUser({ role: 'ADMIN' });
  const { key } = await newKey(admin);
  await call('POST', '/api/auth/register-developer', { body: reg({ registrationKey: key }) });
  const dev = await repos.users.findByUsername('dana.dev');
  await repos.users.update(dev.id, { accountStatus: 'INACTIVE' });
  assert.equal((await call('POST', '/api/auth/login', { body: { identifier: 'dana.dev', password: NEWPW } })).status, 403);
});
