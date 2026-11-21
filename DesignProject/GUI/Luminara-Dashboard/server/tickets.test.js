// Maintenance tickets: create, assign, update, resolve, archive (Remove), restore, permissions, import.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepos, fakeHasher } from './testkit.js';
import { readConfig } from './config.js';
import { createServices } from './services.js';
import { HttpError } from './http-util.js';

let repos; let svc; let admin; let tech; let tech2; let staff; let clockNow;
const mk = (o) => repos.users.create({ fullName: 'U', username: `u${Math.random().toString(36).slice(2, 8)}`, email: `${Math.random().toString(36).slice(2, 8)}@x.co`, passwordHash: 'x', role: 'STAFF', accountStatus: 'ACTIVE', ...o });
const form = (o = {}) => ({ lamp: 'L-008', where: 'Market Street', issue: 'Lamp flickers at night', priority: 'HIGH', status: 'OPEN', ...o });
const rejects = async (p, status, code) => {
  await assert.rejects(p, (e) => { assert.ok(e instanceof HttpError, String(e)); assert.equal(e.status, status); if (code) assert.equal(e.code, code); return true; });
};

beforeEach(async () => {
  repos = createMemoryRepos();
  clockNow = Date.parse('2026-11-07T09:00:00Z');
  svc = createServices({ repos, hasher: fakeHasher, config: readConfig(), now: () => clockNow });
  admin = await mk({ role: 'ADMIN', fullName: 'Ada Admin' });
  tech = await mk({ role: 'TECHNICIAN', fullName: 'Tomas Tech' });
  tech2 = await mk({ role: 'TECHNICIAN', fullName: 'Tina Tech' });
  staff = await mk({ role: 'STAFF', fullName: 'Sam Staff' });
});

const resolved = async () => {
  const t = await svc.createTicket(admin, form({ status: 'ASSIGNED', technicianId: tech.id }));
  await svc.updateTicket(admin, t.dbId, { status: 'IN PROGRESS' });
  return svc.updateTicket(admin, t.dbId, { status: 'RESOLVED', resolution: 'Replaced the LED driver' });
};

test('a new ticket is saved with a generated number, history and a real technician id', async () => {
  const t = await svc.createTicket(admin, form({ status: 'ASSIGNED', technicianId: tech.id }));
  assert.equal(t.id, 'MT-1001');
  assert.equal(t.technicianId, tech.id);
  assert.equal(t.technician, 'Tomas Tech'); // the full name is shown
  assert.equal(t.status, 'ASSIGNED');
  assert.ok(t.firstResponseAt);
  assert.deepEqual(t.history.map((h) => h.text), ['Ticket created as ASSIGNED', 'Technician set to Tomas Tech']);
  assert.equal((await svc.createTicket(admin, form())).id, 'MT-1002');
  assert.equal(repos._state().tickets[0].createdBy, admin.id);
});

test('ticket validation: required fields, assignment rules, and only active TECHNICIAN users can be assigned', async () => {
  await rejects(svc.createTicket(admin, form({ lamp: 'lamp8' })), 400, 'validation');
  await rejects(svc.createTicket(admin, form({ where: 'ab' })), 400);
  await rejects(svc.createTicket(admin, form({ issue: 'bad' })), 400);
  await rejects(svc.createTicket(admin, form({ priority: 'URGENT' })), 400);
  await rejects(svc.createTicket(admin, form({ status: 'RESOLVED' })), 400); // cannot be created already resolved
  await rejects(svc.createTicket(admin, form({ status: 'ASSIGNED' })), 400); // needs a technician
  await rejects(svc.createTicket(admin, form({ status: 'OPEN', technicianId: tech.id })), 400);
  await rejects(svc.createTicket(admin, form({ status: 'ASSIGNED', technicianId: staff.id })), 400); // a STAFF user is not a technician
  await rejects(svc.createTicket(admin, form({ status: 'ASSIGNED', technicianId: '999' })), 400);
  await repos.users.update(tech2.id, { accountStatus: 'INACTIVE' });
  await rejects(svc.createTicket(admin, form({ status: 'ASSIGNED', technicianId: tech2.id })), 400); // inactive
  await rejects(svc.createTicket(admin, form({ reportedAt: clockNow + 3 * 86400000 })), 400); // future date
  assert.equal(repos._state().tickets.length, 0);
});

test('only an administrator creates or edits tickets', async () => {
  await rejects(svc.createTicket(staff, form()), 403);
  await rejects(svc.createTicket(tech, form()), 403);
  const t = await svc.createTicket(admin, form());
  await rejects(svc.updateTicket(staff, t.dbId, { priority: 'LOW' }), 403);
  await rejects(svc.createTicket(null, form()), 401);
});

test('technicians see only their own tickets; staff see all (read only); archive list is admin only', async () => {
  await svc.createTicket(admin, form({ status: 'ASSIGNED', technicianId: tech.id }));
  await svc.createTicket(admin, form({ lamp: 'L-009', status: 'ASSIGNED', technicianId: tech2.id }));
  await svc.createTicket(admin, form({ lamp: 'L-010' }));
  assert.equal((await svc.listTickets(admin)).tickets.length, 3);
  assert.equal((await svc.listTickets(staff)).tickets.length, 3);
  const mine = await svc.listTickets(tech);
  assert.equal(mine.tickets.length, 1);
  assert.equal(mine.tickets[0].technicianId, tech.id);
  assert.equal(mine.summaryRows.length, 1);
  await rejects(svc.listTickets(staff, { archived: true }), 403);
  await rejects(svc.listTickets(tech, { archived: true }), 403);
});

test('a technician can move only their own ticket forward, and cannot change anything else', async () => {
  const mine = await svc.createTicket(admin, form({ status: 'ASSIGNED', technicianId: tech.id }));
  const other = await svc.createTicket(admin, form({ lamp: 'L-009', status: 'ASSIGNED', technicianId: tech2.id }));
  await rejects(svc.updateTicket(tech, other.dbId, { status: 'IN PROGRESS' }), 403);
  await rejects(svc.updateTicket(tech, mine.dbId, { priority: 'LOW' }), 403);
  await rejects(svc.updateTicket(tech, mine.dbId, { technicianId: tech2.id }), 403);
  await rejects(svc.updateTicket(tech, mine.dbId, { issue: 'Something else entirely' }), 403);
  await rejects(svc.updateTicket(staff, mine.dbId, { status: 'IN PROGRESS' }), 403);
  const step1 = await svc.updateTicket(tech, mine.dbId, { status: 'IN PROGRESS' });
  assert.equal(step1.status, 'IN PROGRESS');
  const step2 = await svc.updateTicket(tech, mine.dbId, { status: 'RESOLVED', resolution: 'Fixed the wiring' });
  assert.equal(step2.status, 'RESOLVED');
  assert.ok(step2.resolvedAt);
  assert.equal(step2.resolution, 'Fixed the wiring');
  await rejects(svc.updateTicket(tech, mine.dbId, { status: 'IN PROGRESS' }), 403); // technicians cannot re-open
  await rejects(svc.archiveTicket(tech, mine.dbId), 403); // and cannot archive
});

test('admin edits: reassign, priority, status, resolve and re-open are recorded in the history with who did it', async () => {
  const t = await svc.createTicket(admin, form());
  const a = await svc.updateTicket(admin, t.dbId, { technicianId: tech.id, status: 'ASSIGNED' });
  assert.equal(a.technician, 'Tomas Tech');
  const b = await svc.updateTicket(admin, t.dbId, { technicianId: tech2.id, priority: 'CRITICAL' });
  assert.equal(b.technician, 'Tina Tech');
  assert.equal(b.priority, 'CRITICAL');
  const c = await svc.updateTicket(admin, t.dbId, { status: 'RESOLVED', resolution: 'Done' });
  assert.ok(c.resolvedAt);
  const d = await svc.updateTicket(admin, t.dbId, { status: 'IN PROGRESS' });
  assert.equal(d.resolvedAt, null);
  const texts = d.history.map((h) => h.text);
  assert.ok(texts.includes('Status OPEN → ASSIGNED'));
  assert.ok(texts.includes('Technician Tomas Tech → Tina Tech'));
  assert.ok(texts.includes('Priority HIGH → CRITICAL'));
  assert.ok(texts.includes('Resolution: Done'));
  assert.ok(texts.includes('Status RESOLVED → IN PROGRESS'));
  assert.ok(d.history.every((h) => h.by === 'Ada Admin'));
  const same = await svc.updateTicket(admin, t.dbId, { priority: 'CRITICAL' }); // no change: nothing written
  assert.equal(same.version, d.version);
});

test('two people editing at once: the second save is refused instead of overwriting', async () => {
  const t = await svc.createTicket(admin, form());
  await svc.updateTicket(admin, t.dbId, { priority: 'LOW', expectedVersion: t.version });
  await rejects(svc.updateTicket(admin, t.dbId, { priority: 'MEDIUM', expectedVersion: t.version }), 409, 'stale');
});

test('REMOVE/ARCHIVE: only resolved tickets, admin only, kept in the database with history and who archived it', async () => {
  const open = await svc.createTicket(admin, form());
  const progress = await svc.createTicket(admin, form({ lamp: 'L-011', status: 'ASSIGNED', technicianId: tech.id }));
  await rejects(svc.archiveTicket(admin, open.dbId), 409, 'not_resolved');
  await rejects(svc.archiveTicket(admin, progress.dbId), 409, 'not_resolved');
  const done = await resolved();
  await rejects(svc.archiveTicket(staff, done.dbId), 403);
  await rejects(svc.archiveTicket(tech, done.dbId), 403);
  assert.equal(repos._state().tickets.find((t) => t.dbId === done.dbId).archivedAt, null);

  clockNow += 60000;
  const archived = await svc.archiveTicket(admin, done.dbId);
  assert.equal(archived.archivedAt, clockNow);
  assert.equal(archived.archivedBy, admin.id);
  assert.equal(archived.archivedByName, 'Ada Admin');
  await rejects(svc.archiveTicket(admin, done.dbId), 409, 'already_archived');

  // gone from the active list, present in the archive, row still in the database
  const active = await svc.listTickets(admin);
  assert.ok(!active.tickets.some((t) => t.dbId === done.dbId));
  assert.equal(active.tickets.length, 2);
  const arch = (await svc.listTickets(admin, { archived: true })).tickets;
  assert.equal(arch.length, 1);
  const rec = arch[0];
  assert.equal(rec.id, done.id);
  assert.equal(rec.lamp, 'L-008');
  assert.equal(rec.where, 'Market Street');
  assert.equal(rec.issue, 'Lamp flickers at night');
  assert.equal(rec.technician, 'Tomas Tech');
  assert.equal(rec.priority, 'HIGH');
  assert.ok(rec.createdAt && rec.resolvedAt && rec.archivedAt);
  assert.ok(rec.history.length >= 5); // creation, assignment, status changes, resolution, archive: all kept
  assert.equal(rec.history.at(-1).action, 'ARCHIVED');
  assert.equal(rec.history.at(-1).by, 'Ada Admin');
  assert.equal(repos._state().tickets.length, 3); // nothing deleted
  // statistics are not affected by archiving
  assert.equal((await svc.listTickets(admin)).summaryRows.length, 3);
  // an archived ticket cannot be changed until it is restored
  await rejects(svc.updateTicket(admin, done.dbId, { priority: 'LOW' }), 409, 'archived');
});

test('RESTORE: admin only, brings the ticket back with its history and a record of who restored it', async () => {
  const done = await resolved();
  await svc.archiveTicket(admin, done.dbId);
  await rejects(svc.restoreTicket(staff, done.dbId), 403);
  await rejects(svc.restoreTicket(tech, done.dbId), 403);
  const back = await svc.restoreTicket(admin, done.dbId);
  assert.equal(back.archivedAt, null);
  assert.equal(back.status, 'RESOLVED');
  assert.equal(back.history.at(-1).action, 'RESTORED');
  assert.ok(back.history.some((h) => h.action === 'ARCHIVED'));
  assert.equal((await svc.listTickets(admin)).tickets.length, 1);
  assert.equal((await svc.listTickets(admin, { archived: true })).tickets.length, 0);
  await rejects(svc.restoreTicket(admin, done.dbId), 409, 'not_archived');
  await rejects(svc.restoreTicket(admin, '9999'), 404);
});

test('archiving is atomic: if the history record cannot be written, the ticket is NOT archived', async () => {
  const done = await resolved();
  const original = repos.tickets.addHistory;
  repos.tickets.addHistory = async () => { throw new Error('disk full'); };
  await assert.rejects(svc.archiveTicket(admin, done.dbId), /disk full/);
  repos.tickets.addHistory = original;
  assert.equal(repos._state().tickets.find((t) => t.dbId === done.dbId).archivedAt, null);
});

test('the database rules back the application up (archive only if resolved)', async () => {
  const open = await svc.createTicket(admin, form());
  await assert.rejects(repos.tickets.update(open.dbId, { archivedAt: clockNow, archivedBy: admin.id }), /tickets_archive_only_resolved/);
});

test('import from the old browser prototype: keeps numbers, dates, technician names and history; never duplicates', async () => {
  const day = Date.parse('2026-10-20T08:00:00Z');
  const legacy = [
    { id: 'MT-1001', lamp: 'L-001', where: 'Rizal Ave', issue: 'No light at all', priority: 'HIGH', technician: 'Old Name', technicianId: 'U-0001', status: 'RESOLVED', reportDate: '2026-10-20', createdAt: day, updatedAt: day + 7200000, firstResponseAt: day + 600000, resolvedAt: day + 7200000, resolution: 'Bulb', history: [{ at: day, text: 'Ticket created as OPEN' }, { at: day + 7200000, text: 'Status ASSIGNED → RESOLVED' }] },
    { id: 'MT-1005', lamp: 'L-002', where: 'Mabini St', issue: 'Flickering badly', priority: 'LOW', technician: '', status: 'OPEN', createdAt: day, updatedAt: day, history: [] },
    { id: 'MT-1006', lamp: 'L-003', where: 'Bonifacio', issue: 'Pole leaning', priority: 'MEDIUM', technician: 'Pedro', status: 'IN PROGRESS', createdAt: day, updatedAt: day, history: [] },
    { id: 'bad', lamp: 'x' },
    { id: 'MT-1007', lamp: 'L-004', where: 'Okay St', issue: 'bad', priority: 'LOW', status: 'OPEN' }, // issue too short
  ];
  await rejects(svc.importTickets(staff, { tickets: legacy }), 403);
  await rejects(svc.importTickets(tech, { tickets: legacy }), 403);
  const r = await svc.importTickets(admin, { tickets: legacy });
  assert.deepEqual(r.imported, ['MT-1001', 'MT-1005', 'MT-1006']);
  assert.equal(r.skipped.length, 2);
  const list = (await svc.listTickets(admin)).tickets;
  const t1 = list.find((t) => t.id === 'MT-1001');
  assert.equal(t1.technician, 'Old Name');
  assert.equal(t1.technicianLegacy, true);
  assert.equal(t1.technicianId, null);
  assert.equal(t1.createdAt, day);
  assert.equal(t1.resolvedAt, day + 7200000);
  assert.ok(t1.history.some((h) => h.text === 'Status ASSIGNED → RESOLVED'));
  assert.equal(list.find((t) => t.id === 'MT-1006').technician, 'Pedro');
  const again = await svc.importTickets(admin, { tickets: legacy }); // running it twice changes nothing
  assert.deepEqual(again.imported, []);
  assert.equal((await svc.listTickets(admin)).tickets.length, 3);
  assert.equal((await svc.createTicket(admin, form())).id, 'MT-1007'); // numbering continues after the highest imported number
  await rejects(svc.importTickets(admin, { tickets: 'nope' }), 400);
});

test('legacy (name-only) tickets can still be edited and can be given a real technician', async () => {
  await svc.importTickets(admin, { tickets: [{ id: 'MT-1010', lamp: 'L-005', where: 'Old Road', issue: 'Dim lamp near gate', priority: 'LOW', technician: 'Pedro', status: 'ASSIGNED', createdAt: clockNow - 1000, updatedAt: clockNow - 1000 }] });
  const t = (await svc.listTickets(admin)).tickets[0];
  const p = await svc.updateTicket(admin, t.dbId, { priority: 'HIGH' }); // unrelated edit does not trip the technician rules
  assert.equal(p.priority, 'HIGH');
  assert.equal(p.technician, 'Pedro');
  const q = await svc.updateTicket(admin, t.dbId, { technicianId: tech.id });
  assert.equal(q.technicianId, tech.id);
  assert.equal(q.technicianLegacy, false);
  assert.equal(q.technician, 'Tomas Tech');
});
