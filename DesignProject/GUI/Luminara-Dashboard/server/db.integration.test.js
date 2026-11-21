// Runs the REAL SQL against a REAL PostgreSQL. Skipped unless TEST_DATABASE_URL is set:
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/luminara_test npm run test:db
// It works inside a throw-away schema that is dropped at the end, so it never touches your real tables.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;
const skip = !url && 'set TEST_DATABASE_URL to run the PostgreSQL integration tests';

let pg; let schema; let admin; let mkDb; let db; let repos; let svc; let dbs = [];
if (!skip) {
  pg = (await import('pg')).default;
  const { wrapPool } = await import('./db.js');
  const { createRepos } = await import('./repos.js');
  const { migrate } = await import('./migrate.js');
  const { createServices } = await import('./services.js');
  const { fakeHasher } = await import('./testkit.js');
  const { readConfig } = await import('./config.js');
  schema = `luminara_test_${crypto.randomBytes(4).toString('hex')}`;
  mkDb = () => {
    const pool = new pg.Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
    const d = wrapPool(pool);
    dbs.push(d);
    return d;
  };
  before(async () => {
    const boot = new pg.Pool({ connectionString: url, max: 1 });
    await boot.query(`CREATE SCHEMA ${schema}`);
    await boot.end();
    db = mkDb();
    await migrate(db);
    repos = createRepos(db);
    svc = createServices({ repos, hasher: fakeHasher, config: readConfig() });
    admin = await repos.users.create({ fullName: 'Ada Admin', username: 'ada', email: 'ada@x.co', passwordHash: 'h', role: 'ADMIN', accountStatus: 'ACTIVE' });
  });
  after(async () => {
    const boot = new pg.Pool({ connectionString: url, max: 1 });
    await boot.query(`DROP SCHEMA ${schema} CASCADE`);
    await boot.end();
    await Promise.all(dbs.map((d) => d.close()));
  });
}
const t = (name, fn) => test(name, { skip }, fn);

t('migrations are idempotent and create the tables', async () => {
  const { migrate } = await import('./migrate.js');
  assert.deepEqual(await migrate(db), []);
  const r = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1", [schema]);
  for (const n of ['users', 'sessions', 'maintenance_tickets', 'maintenance_history', 'schema_migrations']) assert.ok(r.rows.some((x) => x.table_name === n), n);
});

t('users: duplicates rejected case-insensitively by the database; passwords only as hashes', async () => {
  const { ConflictError } = await import('./repos.js');
  await repos.users.create({ fullName: 'Tom Tech', username: 'Tom', email: 'tom@x.co', passwordHash: 'hash', role: 'TECHNICIAN', accountStatus: 'ACTIVE' });
  await assert.rejects(repos.users.create({ fullName: 'Other', username: 'TOM', email: 'o@x.co', passwordHash: 'h', role: 'STAFF', accountStatus: 'ACTIVE' }), ConflictError);
  await assert.rejects(repos.users.create({ fullName: 'Other', username: 'other', email: 'TOM@x.co', passwordHash: 'h', role: 'STAFF', accountStatus: 'ACTIVE' }), ConflictError);
  await assert.rejects(db.query("INSERT INTO users (full_name, username, email, password_hash, role) VALUES ('Bad Role','badrole','b@x.co','h','ROOT')"), /check/i);
  assert.equal((await repos.users.findByLogin('TOM@X.CO')).username, 'Tom');
});

t('records survive a server restart (new connection pool)', async () => {
  const ticket = await svc.createTicket(admin, { lamp: 'L-008', where: 'Market Street', issue: 'Lamp flickers', priority: 'HIGH', status: 'OPEN' });
  const fresh = mkDb(); // a brand-new pool = a restarted server
  const { createRepos } = await import('./repos.js');
  const again = await createRepos(fresh).tickets.findById(ticket.dbId);
  assert.equal(again.issue, 'Lamp flickers');
  assert.ok((await createRepos(fresh).users.findByUsername('ada')));
});

t('tickets: number sequence, technician foreign key, archive flow, history kept', async () => {
  const tech = await repos.users.findByUsername('Tom');
  const a = await svc.createTicket(admin, { lamp: 'L-009', where: 'Rizal Avenue', issue: 'No light at night', priority: 'LOW', status: 'ASSIGNED', technicianId: tech.id });
  assert.match(a.id, /^MT-\d+$/);
  assert.equal(a.technician, 'Tom Tech');
  await assert.rejects(svc.archiveTicket(admin, a.dbId), /resolved/i);
  await assert.rejects(db.query('UPDATE maintenance_tickets SET archived_at = now(), archived_by = $1 WHERE id = $2', [admin.id, a.dbId]), /tickets_archive_only_resolved/);
  await svc.updateTicket(admin, a.dbId, { status: 'RESOLVED', resolution: 'Replaced bulb' });
  const arch = await svc.archiveTicket(admin, a.dbId);
  assert.equal(arch.archivedByName, 'Ada Admin');
  assert.ok(!(await svc.listTickets(admin)).tickets.some((x) => x.dbId === a.dbId));
  const list = (await svc.listTickets(admin, { archived: true })).tickets;
  assert.equal(list[0].history.at(-1).action, 'ARCHIVED');
  // the history keeps the ticket from being deleted
  await assert.rejects(db.query('DELETE FROM maintenance_tickets WHERE id = $1', [a.dbId]), /foreign key|violates/i);
  // a technician with tickets cannot be deleted either
  await assert.rejects(db.query('DELETE FROM users WHERE id = $1', [tech.id]), /foreign key|violates/i);
  const back = await svc.restoreTicket(admin, a.dbId);
  assert.equal(back.archivedAt, null);
});

t('import keeps numbers, skips duplicates and moves the sequence forward', async () => {
  const day = Date.now() - 86400000;
  const row = { id: 'MT-5000', lamp: 'L-002', where: 'Old Road', issue: 'Imported fault', priority: 'LOW', technician: 'Pedro', status: 'ASSIGNED', createdAt: day, updatedAt: day, history: [{ at: day, text: 'Ticket created as OPEN' }] };
  assert.deepEqual((await svc.importTickets(admin, { tickets: [row] })).imported, ['MT-5000']);
  assert.deepEqual((await svc.importTickets(admin, { tickets: [row] })).imported, []);
  const next = await svc.createTicket(admin, { lamp: 'L-003', where: 'New Road', issue: 'Fresh fault', priority: 'LOW', status: 'OPEN' });
  assert.equal(next.id, 'MT-5001');
});

t('sessions: create, find, delete, expire', async () => {
  const hash = crypto.randomBytes(8).toString('hex');
  await repos.sessions.create({ userId: admin.id, tokenHash: hash, expiresAt: Date.now() + 60000, ip: '127.0.0.1', userAgent: 'test' });
  assert.equal((await repos.sessions.findValid(hash)).user.username, 'ada');
  await repos.sessions.delete(hash);
  assert.equal(await repos.sessions.findValid(hash), null);
  await repos.sessions.create({ userId: admin.id, tokenHash: `${hash}x`, expiresAt: Date.now() - 1000 });
  assert.equal(await repos.sessions.findValid(`${hash}x`), null);
  assert.equal(await repos.sessions.purgeExpired(), 1);
});

t('last-admin locking query and transactions work', async () => {
  const ids = await db.tx((c) => c.query("SELECT id FROM users WHERE role = 'ADMIN' AND account_status = 'ACTIVE' FOR UPDATE"));
  assert.ok(ids.rowCount >= 1);
  await assert.rejects(svc.updateUser(admin, admin.id, { accountStatus: 'INACTIVE' }), /last active administrator/);
});

// ---------------------------------------------------------------- Phase 5 Step 2: permanent streetlight history
t('history: events survive a server restart, keep their original time, and 0 lux stays 0 while missing stays missing', async () => {
  const { createRepos } = await import('./repos.js');
  const when = Date.parse('2026-11-08T17:45:12.345Z');
  await repos.events.add({ streetlightId: 'L-021', occurredAt: when, type: 'STATUS_CHANGE', previous: null, next: 'GOOD', rawStatus: 'NORMAL_LIT', lux: 154.5, description: 'First report received', source: 'DEVICE' });
  await repos.events.add({ streetlightId: 'L-021', occurredAt: when + 60000, type: 'STATUS_CHANGE', previous: 'GOOD', next: 'FAULT', rawStatus: 'TOTAL_BLACKOUT', lux: 0, description: 'No light', source: 'DEVICE' });
  await repos.events.add({ streetlightId: 'L-021', occurredAt: when + 120000, type: 'STATUS_CHANGE', previous: 'FAULT', next: 'SENSOR_ERROR', rawStatus: 'SENSOR_ERROR', lux: null, description: 'Sensor silent', source: 'DEVICE' });
  const fresh = createRepos(mkDb()); // a brand-new pool = a restarted server
  const rows = await fresh.events.list({ lamp: 'L-021' });
  assert.deepEqual(rows.map((r) => r.next), ['SENSOR_ERROR', 'FAULT', 'GOOD']);
  assert.equal(rows[2].at, when); // millisecond-exact original timestamp
  assert.equal(rows[1].lux, 0);
  assert.equal(rows[0].lux, null);
  assert.equal(rows[2].lux, 154.5);
  assert.equal((await fresh.events.lastStatuses())['L-021'], 'SENSOR_ERROR'); // what a restarted receiver seeds from
});

t('history: the table is append-only (no edit, no delete), whatever the application does', async () => {
  const id = await repos.events.add({ streetlightId: 'L-022', occurredAt: Date.now(), type: 'STATUS_CHANGE', next: 'GOOD', description: 'x', source: 'DEVICE' });
  await assert.rejects(db.query("UPDATE streetlight_events SET new_status = 'FAULT' WHERE id = $1", [id]), /append-only/);
  await assert.rejects(db.query("UPDATE streetlight_events SET occurred_at = now() WHERE id = $1", [id]), /append-only/);
  await assert.rejects(db.query('DELETE FROM streetlight_events WHERE id = $1', [id]), /append-only/);
  await assert.rejects(db.query('TRUNCATE streetlight_events'), /append-only/);
  assert.equal((await repos.events.list({ lamp: 'L-022' })).length, 1);
});

t('history: the schema rejects a bad lamp id, a schedule event with a lamp, a ticket on a status event, and negative lux', async () => {
  const base = { occurredAt: Date.now(), type: 'STATUS_CHANGE', next: 'GOOD', description: 'x', source: 'DEVICE' };
  await assert.rejects(repos.events.add({ ...base, streetlightId: 'lamp-1' }), /check/i);
  await assert.rejects(repos.events.add({ ...base, streetlightId: null }), /events_lamp_matches_type/);
  await assert.rejects(repos.events.add({ ...base, type: 'SCHEDULE_CHANGE', streetlightId: 'L-001' }), /events_lamp_matches_type/);
  await assert.rejects(repos.events.add({ ...base, streetlightId: 'L-001', lux: -3 }), /check/i);
  await assert.rejects(repos.events.add({ ...base, streetlightId: 'L-001', source: 'ROBOT' }), /check/i);
  await assert.rejects(repos.events.add({ ...base, streetlightId: 'L-001', ticketId: '1' }), /events_ticket_only_maintenance/);
});

t('history: maintenance changes are written with the ticket, linked by foreign key, and the ticket can no longer be deleted', async () => {
  const tech = await repos.users.findByUsername('Tom');
  const a = await svc.createTicket(admin, { lamp: 'L-031', where: 'Quezon Street', issue: 'Dark since Friday', priority: 'HIGH', status: 'ASSIGNED', technicianId: tech.id });
  await svc.updateTicket(admin, a.dbId, { status: 'IN PROGRESS' });
  await svc.updateTicket(admin, a.dbId, { status: 'RESOLVED', resolution: 'New driver' });
  const { events } = await svc.listHistory(admin, { lamp: 'L-031', type: 'MAINTENANCE' });
  assert.deepEqual(events.map((e) => e.next), ['RESOLVED', 'IN PROGRESS', 'Assigned to Tom Tech', 'ASSIGNED']);
  assert.ok(events.every((e) => e.ticketNumber === a.id && e.actorName === 'Ada Admin'));
  await assert.rejects(db.query('DELETE FROM maintenance_tickets WHERE id = $1', [a.dbId]), /foreign key|violates/i);
  // a failed update (no technician for an OPEN->RESOLVED jump) writes nothing
  const b = await svc.createTicket(admin, { lamp: 'L-032', where: 'Quezon Street', issue: 'Flickering lamp', priority: 'LOW', status: 'OPEN' });
  const n = (await svc.listHistory(admin, { lamp: 'L-032' })).events.length;
  await assert.rejects(svc.updateTicket(admin, b.dbId, { status: 'RESOLVED' }));
  assert.equal((await svc.listHistory(admin, { lamp: 'L-032' })).events.length, n);
});

t('schedule: starts at the firmware shift, an edit is stored and recorded once, and survives a restart', async () => {
  const { createRepos } = await import('./repos.js');
  assert.equal((await svc.getSchedule(admin)).schedule.onTime, '18:00');
  const r = await svc.updateSchedule(admin, { onTime: '17:45', offTime: '05:15' });
  assert.equal(r.changed, true);
  assert.equal((await svc.updateSchedule(admin, { onTime: '17:45', offTime: '05:15' })).changed, false);
  const fresh = createRepos(mkDb());
  const s = await fresh.schedule.get();
  assert.deepEqual([s.onTime, s.offTime], ['17:45', '05:15']);
  const ev = (await fresh.events.list({ type: 'SCHEDULE_CHANGE' }));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].next, 'ON 17:45 · OFF 05:15');
  await assert.rejects(db.query("UPDATE lighting_schedule SET on_time = '25:61'"), /check/i);
  await assert.rejects(db.query("UPDATE lighting_schedule SET off_time = on_time"), /check/i);
  await assert.rejects(db.query("INSERT INTO lighting_schedule (id, on_time, off_time) VALUES (2, '18:00', '05:30')"), /check/i); // only one schedule row
});

t('history paging: newest first, no row twice or missing across pages, even with equal timestamps', async () => {
  const t0 = Date.parse('2026-11-01T00:00:00Z');
  for (let i = 0; i < 7; i += 1) await repos.events.add({ streetlightId: 'L-040', occurredAt: t0 + Math.floor(i / 2) * 1000, type: 'STATUS_CHANGE', next: `S${i}`, description: `e${i}`, source: 'DEVICE' });
  const seen = [];
  let next = null;
  do {
    const page = await svc.listHistory(admin, { lamp: 'L-040', type: 'STATUS_CHANGE', limit: 3, ...(next || {}) });
    seen.push(...page.events.map((e) => e.next));
    next = page.next;
  } while (next);
  assert.deepEqual(seen, ['S6', 'S5', 'S4', 'S3', 'S2', 'S1', 'S0']);
});

t('BASIC role (migration 003): the database accepts it, still rejects unknown roles, and keeps existing accounts', async () => {
  const b = await repos.users.create({ fullName: 'Bea Basic', username: 'bea', email: 'bea@x.co', passwordHash: 'h', role: 'BASIC', accountStatus: 'ACTIVE' });
  assert.equal(b.role, 'BASIC');
  assert.equal((await repos.users.findById(admin.id)).role, 'ADMIN'); // nobody was converted
  await assert.rejects(db.query("UPDATE users SET role = 'SUPERUSER' WHERE username = 'bea'"), /check/i);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE version = '003_basic_role.sql'")).rows[0].n, 1);
  // BASIC sees only tickets assigned to them (none can be assigned through the app, so the list is empty and read-only)
  assert.equal((await svc.listTickets(b)).tickets.length, 0);
});

// ---- Phase 5 Step 4: developer registration keys (real SQL) ----
t('004: DEVELOPER is an allowed role and the invite table enforces single use', async () => {
  const dev = await repos.users.create({ fullName: 'Dev One', username: 'devone', email: 'devone@x.co', passwordHash: 'h', role: 'DEVELOPER', accountStatus: 'ACTIVE' });
  assert.equal(dev.role, 'DEVELOPER');
  await assert.rejects(db.query("INSERT INTO users (full_name, username, email, password_hash, role) VALUES ('Bad Role','badrole2','b2@x.co','h','ROOT')"), /check/i);
  const inv = await repos.invites.create({ keyHash: 'h'.repeat(64), label: 'Dana', createdBy: admin.id, expiresAt: Date.now() + 3600000 });
  await assert.rejects(repos.invites.create({ keyHash: 'h'.repeat(64), label: 'Dup', createdBy: admin.id, expiresAt: Date.now() + 3600000 }), /unique|duplicate/i);
  await assert.rejects(repos.invites.create({ keyHash: 'i'.repeat(64), label: 'Past', createdBy: admin.id, expiresAt: Date.now() - 1000 }), /check|expiry/i);
  assert.equal(inv.status, 'ACTIVE');
  // a row can never be both used and revoked
  await assert.rejects(db.query('UPDATE developer_invites SET used_at = now(), revoked_at = now() WHERE id = $1', [inv.id]), /developer_invites_used_or_revoked/);
});

t('004: a key can be consumed exactly once, even by two requests at the same moment', async () => {
  const { hashInviteKey } = await import('./services.js');
  const key = `LDK-${'r'.repeat(32)}`;
  await repos.invites.create({ keyHash: hashInviteKey(key), label: 'Race', createdBy: admin.id, expiresAt: Date.now() + 3600000 });
  const results = await Promise.all([repos.invites.consume(hashInviteKey(key)), repos.invites.consume(hashInviteKey(key)), repos.invites.consume(hashInviteKey(key))]);
  assert.equal(results.filter(Boolean).length, 1);
});

t('004: expired and revoked keys cannot be consumed; a revoked key is not "used"', async () => {
  const { hashInviteKey } = await import('./services.js');
  const revoked = `LDK-${'v'.repeat(32)}`;
  const inv = await repos.invites.create({ keyHash: hashInviteKey(revoked), label: 'To revoke', createdBy: admin.id, expiresAt: Date.now() + 3600000 });
  assert.equal(await repos.invites.revoke(inv.id, admin.id), true);
  assert.equal(await repos.invites.revoke(inv.id, admin.id), false);
  assert.equal(await repos.invites.consume(hashInviteKey(revoked)), null);
  const expired = `LDK-${'x'.repeat(32)}`;
  const e = await repos.invites.create({ keyHash: hashInviteKey(expired), label: 'Short', createdBy: admin.id, expiresAt: Date.now() + 1500 });
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(await repos.invites.consume(hashInviteKey(expired)), null);
  assert.equal((await repos.invites.findById(e.id)).status, 'EXPIRED');
});

t('004: registerDeveloper rolls the key back when the account cannot be created', async () => {
  const key = `LDK-${'k'.repeat(32)}`;
  const { hashInviteKey } = await import('./services.js');
  await repos.invites.create({ keyHash: hashInviteKey(key), label: 'Rollback', createdBy: admin.id, expiresAt: Date.now() + 3600000 });
  const body = { fullName: 'Rita Dev', username: 'ada', email: 'rita@x.co', password: 'Dev3loper-Pass9', confirmPassword: 'Dev3loper-Pass9', registrationKey: key };
  await assert.rejects(svc.registerDeveloper(body), (e) => e.status === 400); // username "ada" is taken
  assert.notEqual(await repos.invites.consume(hashInviteKey(key)) , null, 'the key survived the failed registration');
  const key2 = `LDK-${'m'.repeat(32)}`;
  await repos.invites.create({ keyHash: hashInviteKey(key2), label: 'Works', createdBy: admin.id, expiresAt: Date.now() + 3600000 });
  const ok = await svc.registerDeveloper({ ...body, username: 'rita.dev', registrationKey: key2 });
  assert.equal(ok.user.role, 'DEVELOPER');
  const used = (await repos.invites.list()).find((i) => i.label === 'Works');
  assert.equal(used.status, 'USED');
  assert.equal(used.usedByUsername, 'rita.dev');
});
