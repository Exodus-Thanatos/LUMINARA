// Phase 5 Step 2: permanent streetlight history, the lighting schedule, and "sleeping instead of offline".
// Logic tests use in-memory repositories (same rules as the schema); the real SQL runs in db.integration.test.js (npm run test:db).
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepos, fakeHasher } from './testkit.js';
import { readConfig } from './config.js';
import { createServices } from './services.js';
import { HttpError } from './http-util.js';
import { createHealthTracker, createEventWriter } from './lightEvents.js';
import { DEFAULT_SCHEDULE, lampsExpectedOn, sleepWindowStart, isSleeping, scheduleSummary, validateSchedule } from './schedule.js';
import { classifyLamp } from './lampHealth.js';

process.env.DEVICE_KEY = 'test-key';
process.env.STALE_AFTER_MS = '60000';
process.env.OFFLINE_AFTER_MS = '90000';
const srv = await import('./server.js');

// Philippine local time (UTC+8) on 9 Nov 2026 -> epoch ms
const at = (h, m = 0, day = 9) => Date.UTC(2026, 10, day, h - 8, m);
const S = DEFAULT_SCHEDULE; // ON 18:00, OFF 05:30

// ------------------------------------------------------------------ schedule rules
test('schedule: lamps expected on from 18:00 to 05:30 (across midnight), off in the daytime', () => {
  assert.equal(lampsExpectedOn(S, at(19)), true);
  assert.equal(lampsExpectedOn(S, at(2)), true);
  assert.equal(lampsExpectedOn(S, at(5, 29)), true);
  assert.equal(lampsExpectedOn(S, at(5, 30)), false);
  assert.equal(lampsExpectedOn(S, at(12)), false);
  assert.equal(lampsExpectedOn(S, at(18)), true);
});

test('schedule summary: current state and the next switch', () => {
  const night = scheduleSummary(S, at(22, 0));
  assert.equal(night.state, 'ON');
  assert.equal(night.nextChange, 'OFF');
  assert.equal(night.nextChangeAt, at(5, 30, 10));
  const day = scheduleSummary(S, at(9, 0));
  assert.equal(day.state, 'OFF');
  assert.equal(day.nextChangeAt, at(18, 0));
});

test('schedule validation: HH:MM only, ON and OFF must differ', () => {
  assert.deepEqual(validateSchedule({ onTime: '18:00', offTime: '05:30' }).errors, {});
  assert.ok(validateSchedule({ onTime: '25:00', offTime: '05:30' }).errors.onTime);
  assert.ok(validateSchedule({ onTime: '18:00', offTime: '5:30' }).errors.offTime);
  assert.ok(validateSchedule({ onTime: '18:00', offTime: '18:00' }).errors.offTime);
  assert.ok(validateSchedule({}).errors.onTime);
});

test('sleep window: from lamps-off until shortly after the first wake-up poll, never during the night', () => {
  assert.equal(sleepWindowStart(S, at(12)), at(5, 30));
  assert.equal(sleepWindowStart(S, at(17, 9)), at(5, 30));
  assert.equal(sleepWindowStart(S, at(17, 11)), null); // the nodes should be answering again by now
  assert.equal(sleepWindowStart(S, at(23)), null);
  assert.equal(sleepWindowStart(S, at(3)), null);
});

test('a node is only "sleeping" if its last report was around the moment the sleep began', () => {
  const now = at(12);
  assert.equal(isSleeping({ sched: S, lastSeenMs: at(5, 58), now }), true); // last report just before the sleep command
  assert.equal(isSleeping({ sched: S, lastSeenMs: at(1, 0), now }), false); // went quiet at 01:00: that is offline, not sleep
  assert.equal(isSleeping({ sched: S, lastSeenMs: at(10, 0), now }), false); // awake and reporting at 10:00, then quiet: not sleep
  assert.equal(isSleeping({ sched: S, lastSeenMs: at(5, 58), now: at(19) }), false); // lamps should be on: silence is offline
});

// ------------------------------------------------------------------ plain-language wording
test('SLEEPING is its own calm state: not a fault, not offline, not 0 lux', () => {
  const h = classifyLamp({ status: 'NORMAL_LIT', link: 'SLEEPING', recent: [] });
  assert.equal(h.key, 'SLEEPING');
  assert.equal(h.tone, 'blue');
  assert.equal(h.dashboardStatus, 'ONLINE');
  assert.equal(h.lampKnown, false);
  assert.match(h.long, /not a fault/i);
  assert.equal(classifyLamp({ status: 'NORMAL_LIT', link: 'OFFLINE', recent: [] }).key, 'OFFLINE'); // real silence is unchanged
});

// ------------------------------------------------------------------ the receiver: sleeping vs offline, immediate wake-up
const pkt = (o = {}) => ({ type: 'BEAT', nodeId: 1, seq: 1, lux: 153.2, status: 'NORMAL_LIT', rssi: -71, ...o });
const feed = (o, now) => srv.ingest(srv.validate(pkt(o)).packet, now);
beforeEach(() => srv.resetForTests());

test('silence in the daytime after the nightly shift is SLEEPING; at night it is OFFLINE', () => {
  feed({ seq: 1, status: 'NORMAL_LIT' }, at(5, 58));
  assert.equal(srv.snapshot(at(5, 58, 9) + 30_000).lamps[0].link, 'ONLINE');
  const noon = srv.snapshot(at(12)).lamps[0];
  assert.equal(noon.link, 'SLEEPING');
  assert.equal(noon.health.key, 'SLEEPING');
  assert.equal(srv.snapshot(at(12)).sleepingNow, true);
  // a lamp last heard at 01:00 and silent at noon was NOT put to sleep by the schedule
  srv.resetForTests();
  feed({ seq: 1 }, at(1, 0));
  assert.equal(srv.snapshot(at(12)).lamps[0].link, 'OFFLINE');
  // silent in the evening (lamps should be on): offline
  srv.resetForTests();
  feed({ seq: 1 }, at(18, 0));
  assert.equal(srv.snapshot(at(18, 5)).lamps[0].link, 'OFFLINE');
});

test('a sleeping node is shown as awake the moment it reports again (no waiting for a timer)', () => {
  feed({ seq: 1 }, at(5, 58));
  assert.equal(srv.snapshot(at(16, 59)).lamps[0].health.key, 'SLEEPING');
  feed({ seq: 2, status: 'STANDBY', lux: 0 }, at(17, 0));
  const l = srv.snapshot(at(17, 0) + 1000).lamps[0];
  assert.equal(l.link, 'ONLINE');
  assert.notEqual(l.health.key, 'SLEEPING');
});

test('changing the schedule changes what counts as sleeping', () => {
  feed({ seq: 1 }, at(5, 58));
  srv.setSchedule({ onTime: '19:00', offTime: '05:30' });
  assert.equal(srv.snapshot(at(17, 30)).lamps[0].link, 'SLEEPING'); // wake poll now 18:00, window to 18:10
  srv.setSchedule({ onTime: '18:00', offTime: '05:30' });
  assert.equal(srv.snapshot(at(17, 30)).lamps[0].link, 'OFFLINE');
});

// ------------------------------------------------------------------ history tracker
const lampOf = (o = {}) => ({ id: 'L-001', lux: 150, status: 'NORMAL_LIT', source: 'hardware', health: { key: 'GOOD' }, ...o });
const mkTracker = (seed) => { const rows = []; return { rows, t: createHealthTracker({ record: (e) => rows.push(e), seed }) }; };

test('history: only real changes are recorded; identical readings are ignored', () => {
  const { rows, t } = mkTracker();
  t.observe(lampOf(), 1000);
  for (let i = 1; i <= 20; i += 1) t.observe(lampOf({ lux: 150 + i }), 1000 + i * 30_000); // 20 identical-condition reports
  assert.equal(rows.length, 1);
  assert.equal(rows[0].previous, null);
  assert.equal(rows[0].next, 'GOOD');
  assert.equal(rows[0].source, 'DEVICE');
  assert.equal(rows[0].occurredAt, 1000); // original timestamp
  t.observe(lampOf({ lux: 2, status: 'TOTAL_BLACKOUT', health: { key: 'FAULT' } }), 700_000);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].previous, 'GOOD');
  assert.equal(rows[1].next, 'FAULT');
  assert.equal(rows[1].lux, 2);
  assert.equal(rows[1].rawStatus, 'TOTAL_BLACKOUT');
});

test('history: missing data is never stored as 0 lux, and never recorded as an event', () => {
  const { rows, t } = mkTracker();
  assert.equal(t.observe(lampOf({ health: { key: 'NO_DATA' }, lux: null }), 1), null);
  t.observe(lampOf({ lux: null, status: 'SENSOR_ERROR', health: { key: 'SENSOR_ERROR' } }), 2);
  t.observe(lampOf({ lux: null, status: 'NORMAL_LIT', health: { key: 'OFFLINE' } }), 3, 'SERVER');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].lux, null);
  assert.equal(rows[1].lux, null);
  assert.equal(rows[1].source, 'SERVER');
  assert.match(rows[1].description, /not 0 lux/);
});

test('history: sleep and wake-up are recorded with plain wording; daylight standby is a normal state, not a fault', () => {
  const { rows, t } = mkTracker({ 'L-001': 'GOOD' });
  t.observe(lampOf({ health: { key: 'SLEEPING' } }), 10, 'SERVER');
  t.observe(lampOf({ health: { key: 'STANDBY' }, status: 'STANDBY', lux: 0 }), 20);
  t.observe(lampOf({ health: { key: 'DAYLIGHT' }, status: 'DAYLIGHT_STANDBY', lux: 65535 }), 30);
  assert.deepEqual(rows.map((r) => r.next), ['SLEEPING', 'STANDBY', 'DAYLIGHT']);
  assert.match(rows[0].description, /expected, not a fault/);
  assert.match(rows[1].description, /woke up/);
  assert.equal(rows[2].lux, 65535);
});

test('history: a restart does not repeat the last recorded condition', () => {
  const { rows, t } = mkTracker({ 'L-001': 'GOOD', 'L-002': 'FAULT' });
  t.observe(lampOf(), 5);
  t.observe(lampOf({ id: 'L-002', health: { key: 'FAULT' } }), 5);
  assert.equal(rows.length, 0);
  t.observe(lampOf({ id: 'L-002', health: { key: 'GOOD' } }), 6);
  assert.equal(rows.length, 1);
});

test('history: a lamp hovering around the warning margin does not flood the log', () => {
  const { rows, t } = mkTracker();
  t.observe(lampOf(), 0);
  for (let i = 1; i <= 10; i += 1) t.observe(lampOf({ health: { key: i % 2 ? 'NEAR_LIMIT' : 'GOOD' } }), i * 30_000);
  assert.equal(rows.length, 1);
  t.observe(lampOf({ health: { key: 'NEAR_LIMIT' } }), 11 * 60_000); // after 10 minutes the change is real
  assert.equal(rows.length, 2);
  t.observe(lampOf({ health: { key: 'FAULT' } }), 11 * 60_000 + 1); // serious changes are never delayed
  assert.equal(rows.length, 3);
});

test('history through the receiver: telemetry in, changes out; the 5-second sweep records sleeping/offline', () => {
  const rows = [];
  srv.setHistoryTracker(createHealthTracker({ record: (e) => rows.push(e) }));
  feed({ seq: 1, lux: 150 }, at(23));
  feed({ seq: 2, lux: 155 }, at(23, 1));
  feed({ seq: 3, lux: 154 }, at(23, 2));
  assert.equal(rows.length, 1);
  feed({ seq: 4, lux: 1, status: 'TOTAL_BLACKOUT' }, at(23, 3));
  assert.deepEqual(rows.map((r) => r.next), ['GOOD', 'FAULT']);
  srv.observeHistory(at(23, 3) + 120_000, null, 'SERVER'); // silent for two minutes at night
  assert.equal(rows[2].next, 'OFFLINE');
  srv.observeHistory(at(23, 3) + 125_000, null, 'SERVER');
  assert.equal(rows.length, 3); // nothing new, nothing written
  srv.resetForTests();
});

// ------------------------------------------------------------------ writer: nothing is lost or re-dated
test('writer: events are saved in order with their original time, and wait out a database outage', async () => {
  const saved = [];
  let down = true;
  const timers = [];
  const w = createEventWriter({
    insert: async (e) => { if (down) throw new Error('db down'); saved.push(e); },
    onError: () => {},
    setTimer: (fn) => { timers.push(fn); return 0; },
  });
  w.enqueue({ n: 1, occurredAt: 100 });
  w.enqueue({ n: 2, occurredAt: 200 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(saved.length, 0);
  assert.equal(w.pending, 2);
  down = false;
  timers.shift()(); // the retry timer fires
  assert.equal(await w.flush(), true);
  assert.deepEqual(saved.map((e) => [e.n, e.occurredAt]), [[1, 100], [2, 200]]);
});

// ------------------------------------------------------------------ services: history, maintenance events, schedule
let repos; let svc; let admin; let tech; let staff; let clock; let schedChanged;
const mk = (o) => repos.users.create({ fullName: 'U', username: `u${Math.random().toString(36).slice(2, 8)}`, email: `${Math.random().toString(36).slice(2, 8)}@x.co`, passwordHash: 'x', role: 'STAFF', accountStatus: 'ACTIVE', ...o });
const form = (o = {}) => ({ lamp: 'L-008', where: 'Market Street', issue: 'Lamp flickers at night', priority: 'HIGH', status: 'OPEN', ...o });
const rejects = async (p, status, code) => assert.rejects(p, (e) => { assert.ok(e instanceof HttpError, String(e)); assert.equal(e.status, status); if (code) assert.equal(e.code, code); return true; });

beforeEach(async () => {
  repos = createMemoryRepos();
  clock = Date.parse('2026-11-09T09:00:00Z');
  schedChanged = [];
  svc = createServices({ repos, hasher: fakeHasher, config: readConfig(), now: () => clock, onScheduleChange: (s) => schedChanged.push(s) });
  admin = await mk({ role: 'ADMIN', fullName: 'Ada Admin' });
  tech = await mk({ role: 'TECHNICIAN', fullName: 'Tomas Tech' });
  staff = await mk({ role: 'STAFF', fullName: 'Sam Staff' });
});

test('maintenance changes become streetlight history, linked to the ticket, with who and when', async () => {
  const t = await svc.createTicket(admin, form({ status: 'ASSIGNED', technicianId: tech.id }));
  clock += 60_000;
  await svc.updateTicket(admin, t.dbId, { status: 'IN PROGRESS' });
  clock += 60_000;
  await svc.updateTicket(tech, t.dbId, { status: 'RESOLVED', resolution: 'Replaced the LED driver' });
  const { events } = await svc.listHistory(admin, { lamp: 'L-008' });
  assert.deepEqual(events.map((e) => e.next), ['RESOLVED', 'IN PROGRESS', 'Assigned to Tomas Tech', 'ASSIGNED']);
  assert.ok(events.every((e) => e.type === 'MAINTENANCE' && e.ticketNumber === 'MT-1001' && e.lamp === 'L-008'));
  assert.match(events[0].description, /Resolution: Replaced the LED driver/);
  assert.equal(events[0].actorName, 'Tomas Tech');
  assert.equal(events[0].previous, 'IN PROGRESS');
  assert.ok(events[0].at > events[1].at && events[1].at > events[3].at); // timestamps are the real moments
});

test('a rejected ticket change leaves no history behind (same transaction)', async () => {
  const t = await svc.createTicket(admin, form());
  const before = (await svc.listHistory(admin)).events.length;
  await rejects(svc.updateTicket(admin, t.dbId, { status: 'RESOLVED' }), 400); // no technician
  assert.equal((await svc.listHistory(admin)).events.length, before);
});

test('a ticket that changes lamp or priority is recorded against the right streetlight', async () => {
  const t = await svc.createTicket(admin, form({ priority: 'LOW' }));
  await svc.updateTicket(admin, t.dbId, { priority: 'CRITICAL', lamp: 'L-002' });
  assert.equal((await svc.listHistory(admin, { lamp: 'L-002' })).events[0].next, 'CRITICAL');
  assert.equal((await svc.listHistory(admin, { lamp: 'L-008' })).events.some((e) => e.next === 'CRITICAL'), false);
});

test('schedule changes are saved, recorded once, and tell the receiver', async () => {
  assert.deepEqual((await svc.getSchedule(staff)).schedule.onTime, '18:00');
  const r = await svc.updateSchedule(admin, { onTime: '17:30', offTime: '05:30' });
  assert.equal(r.changed, true);
  assert.equal(r.schedule.onTime, '17:30');
  assert.deepEqual(schedChanged, [{ onTime: '17:30', offTime: '05:30' }]);
  const again = await svc.updateSchedule(admin, { onTime: '17:30', offTime: '05:30' });
  assert.equal(again.changed, false);
  const ev = (await svc.listHistory(staff, { type: 'SCHEDULE_CHANGE' })).events;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].lamp, null);
  assert.equal(ev[0].previous, 'ON 18:00 · OFF 05:30');
  assert.equal(ev[0].next, 'ON 17:30 · OFF 05:30');
  assert.equal(ev[0].actorName, 'Ada Admin');
  assert.equal((await svc.listHistory(staff, { lamp: 'L-003' })).events.length, 1); // schedule edits apply to every streetlight
});

test('only an administrator edits the schedule; bad times are rejected and change nothing', async () => {
  await rejects(svc.updateSchedule(staff, { onTime: '17:30', offTime: '05:30' }), 403, 'forbidden');
  await rejects(svc.updateSchedule(tech, { onTime: '17:30', offTime: '05:30' }), 403, 'forbidden');
  await rejects(svc.updateSchedule(admin, { onTime: '7pm', offTime: '05:30' }), 400, 'validation');
  await rejects(svc.updateSchedule(admin, { onTime: '18:00', offTime: '18:00' }), 400, 'validation');
  await rejects(svc.updateSchedule(null, { onTime: '17:30', offTime: '05:30' }), 401);
  assert.equal((await svc.getSchedule(admin)).schedule.onTime, '18:00');
  assert.equal(schedChanged.length, 0);
});

test('history access: signed-in dashboard roles can read it, anonymous cannot; filters and paging are validated', async () => {
  await rejects(svc.listHistory(null, {}), 401);
  await repos.events.add({ streetlightId: 'L-001', occurredAt: 1000, type: 'STATUS_CHANGE', previous: null, next: 'GOOD', description: 'First report', source: 'DEVICE' });
  for (let i = 0; i < 5; i += 1) await repos.events.add({ streetlightId: 'L-001', occurredAt: 2000 + i, type: 'STATUS_CHANGE', previous: 'GOOD', next: 'FAULT', lux: 1, description: `change ${i}`, source: 'DEVICE' });
  assert.equal((await svc.listHistory(staff, {})).events.length, 6);
  assert.equal((await svc.listHistory(tech, {})).events.length, 6);
  await rejects(svc.listHistory(admin, { lamp: 'bad' }), 400, 'validation');
  await rejects(svc.listHistory(admin, { type: 'NOPE' }), 400, 'validation');
  await rejects(svc.listHistory(admin, { limit: 500 }), 400, 'validation');
  const p1 = await svc.listHistory(admin, { limit: 4 });
  assert.equal(p1.events.length, 4);
  assert.ok(p1.next);
  const p2 = await svc.listHistory(admin, { limit: 4, beforeAt: p1.next.beforeAt, beforeId: p1.next.beforeId });
  assert.equal(p2.events.length, 2);
  assert.equal(p2.next, null);
  assert.equal(new Set([...p1.events, ...p2.events].map((e) => e.id)).size, 6); // no row twice, none missing
  assert.equal(p2.events.at(-1).description, 'First report'); // newest first, oldest last
});

test('history rows cannot name a bad streetlight or a ticket that does not exist (same rules as the schema)', async () => {
  const base = { occurredAt: 1, type: 'MAINTENANCE', next: 'OPEN', description: 'x', source: 'USER' };
  await assert.rejects(repos.events.add({ ...base, streetlightId: 'lamp-1' }));
  await assert.rejects(repos.events.add({ ...base, streetlightId: 'L-001', ticketId: '999' }));
  await assert.rejects(repos.events.add({ ...base, streetlightId: null }));
  await assert.rejects(repos.events.add({ ...base, streetlightId: 'L-001', type: 'STATUS_CHANGE', ticketId: '1' }));
});
