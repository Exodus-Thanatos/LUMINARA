// Test helpers: an in-memory stand-in for the PostgreSQL repositories (same interface, same rules the schema enforces),
// and a fast fake password hasher so the logic tests do not need bcrypt installed.
// The real SQL is exercised by server/db.integration.test.js against a real PostgreSQL (npm run test:db).
import crypto from 'node:crypto';
import { ConflictError } from './repos.js';

export const fakeHasher = {
  hash: async (p) => `fake$${crypto.createHash('sha256').update(p).digest('hex')}`,
  verify: async (p, h) => h === `fake$${crypto.createHash('sha256').update(p).digest('hex')}`,
  verifyDummy: async () => false,
};

export const createMemoryRepos = () => {
  let state = { users: [], sessions: [], tickets: [], history: [], events: [], schedule: { onTime: '18:00', offTime: '05:30', updatedAt: null, updatedBy: null }, userSeq: 0, ticketSeq: 0, histSeq: 0, eventSeq: 0, numberSeq: 1000, invites: [], inviteSeq: 0 };
  let clock = () => Date.now();
  const lc = (s) => String(s).toLowerCase();

  const build = () => {
    const userById = (id) => state.users.find((u) => u.id === String(id));
    const userView = (u) => ({ ...u });
    const users = {
      async findById(id) { const u = userById(id); return u ? userView(u) : null; },
      async findByLogin(l) { const u = state.users.find((x) => lc(x.username) === lc(l) || lc(x.email) === lc(l)); return u ? userView(u) : null; },
      async findByUsername(n) { const u = state.users.find((x) => lc(x.username) === lc(n)); return u ? userView(u) : null; },
      async findByEmail(e) { const u = state.users.find((x) => lc(x.email) === lc(e)); return u ? userView(u) : null; },
      async list() { return [...state.users].sort((a, b) => lc(a.fullName).localeCompare(lc(b.fullName))).map(userView); },
      async listActiveTechnicians() { return (await users.list()).filter((u) => u.role === 'TECHNICIAN' && u.accountStatus === 'ACTIVE'); },
      async create(u) {
        if (state.users.some((x) => lc(x.username) === lc(u.username))) throw new ConflictError('username');
        if (state.users.some((x) => lc(x.email) === lc(u.email))) throw new ConflictError('email');
        state.userSeq += 1;
        const row = { id: String(state.userSeq), fullName: u.fullName, username: u.username, email: u.email, passwordHash: u.passwordHash, role: u.role, accountStatus: u.accountStatus, mustChangePassword: !!u.mustChangePassword, lastLoginAt: null, createdAt: clock(), updatedAt: clock(), createdBy: u.createdBy ?? null };
        state.users.push(row);
        return userView(row);
      },
      async update(id, patch) {
        const u = userById(id);
        if (!u) return null;
        if (patch.username !== undefined && state.users.some((x) => x.id !== u.id && lc(x.username) === lc(patch.username))) throw new ConflictError('username');
        if (patch.email !== undefined && state.users.some((x) => x.id !== u.id && lc(x.email) === lc(patch.email))) throw new ConflictError('email');
        for (const k of ['fullName', 'username', 'email', 'role', 'accountStatus', 'mustChangePassword']) if (patch[k] !== undefined) u[k] = patch[k];
        u.updatedAt = clock();
        return userView(u);
      },
      async setPassword(id, hash, mustChange) { const u = userById(id); u.passwordHash = hash; u.mustChangePassword = !!mustChange; },
      async touchLogin(id) { userById(id).lastLoginAt = clock(); },
      async lockActiveAdmins() { return state.users.filter((u) => u.role === 'ADMIN' && u.accountStatus === 'ACTIVE').map((u) => u.id); },
      async lockById(id) { return users.findById(id); },
      async countAdmins() { return state.users.filter((u) => u.role === 'ADMIN').length; },
    };
    const sessions = {
      async create(s) { state.sessions.push({ ...s }); },
      async findValid(h) {
        const s = state.sessions.find((x) => x.tokenHash === h && x.expiresAt > clock());
        return s ? { user: userView(userById(s.userId)), expiresAt: s.expiresAt, lastSeenAt: clock() } : null;
      },
      async touch() {},
      async delete(h) { state.sessions = state.sessions.filter((x) => x.tokenHash !== h); },
      async deleteForUser(uid, except = null) { state.sessions = state.sessions.filter((x) => x.userId !== String(uid) || x.tokenHash === except); },
      async purgeExpired() { const n = state.sessions.length; state.sessions = state.sessions.filter((x) => x.expiresAt > clock()); return n - state.sessions.length; },
    };
    const view = (t) => {
      const tech = t.technicianId ? userById(t.technicianId) : null;
      const arch = t.archivedBy ? userById(t.archivedBy) : null;
      return { dbId: t.dbId, id: t.id, lamp: t.lamp, where: t.where, issue: t.issue, priority: t.priority, status: t.status, technicianId: t.technicianId, technician: tech?.fullName || t.legacyTechnician || '', technicianLegacy: !t.technicianId && !!t.legacyTechnician, createdAt: t.reportedAt, updatedAt: t.updatedAt, firstResponseAt: t.firstResponseAt, resolvedAt: t.resolvedAt, resolution: t.resolution || '', archivedAt: t.archivedAt, archivedBy: t.archivedBy, archivedByName: arch?.fullName || null, version: t.version, history: [] };
    };
    const check = (t) => { // the CHECK constraints from 001_init.sql
      if (t.status === 'RESOLVED' && !t.resolvedAt) throw new Error('violates tickets_resolved_has_date');
      if (t.archivedAt && t.status !== 'RESOLVED') throw new Error('violates tickets_archive_only_resolved');
      if (!!t.archivedAt !== !!t.archivedBy) throw new Error('violates tickets_archive_has_actor');
      if (['ASSIGNED', 'IN PROGRESS'].includes(t.status) && !t.technicianId && !t.legacyTechnician) throw new Error('violates tickets_active_has_technician');
      if (t.technicianId && t.legacyTechnician) throw new Error('violates tickets_one_technician_source');
      if (t.technicianId && !userById(t.technicianId)) throw new Error('violates foreign key (technician)');
    };
    const tickets = {
      async list({ archived = false, technicianId = null } = {}) {
        return state.tickets.filter((t) => (archived ? !!t.archivedAt : !t.archivedAt) && (technicianId === null || t.technicianId === technicianId))
          .sort((a, b) => (archived ? b.archivedAt - a.archivedAt : b.updatedAt - a.updatedAt) || Number(b.dbId) - Number(a.dbId)).map(view);
      },
      async summaryRows({ technicianId = null } = {}) {
        return state.tickets.filter((t) => technicianId === null || t.technicianId === technicianId).map((t) => ({ status: t.status, createdAt: t.reportedAt, firstResponseAt: t.firstResponseAt, resolvedAt: t.resolvedAt }));
      },
      async findById(id) { const t = state.tickets.find((x) => x.dbId === String(id)); return t ? view(t) : null; },
      async findByNumber(n) { const t = state.tickets.find((x) => x.id === n); return t ? view(t) : null; },
      async create(t) {
        state.ticketSeq += 1; state.numberSeq += 1;
        const row = { dbId: String(state.ticketSeq), id: `MT-${state.numberSeq}`, lamp: t.lamp, where: t.where, issue: t.issue, priority: t.priority, technicianId: t.technicianId, legacyTechnician: null, status: t.status, reportedAt: t.reportedAt, firstResponseAt: t.firstResponseAt, resolvedAt: null, resolution: '', archivedAt: null, archivedBy: null, createdBy: t.createdBy, version: 1, createdAt: clock(), updatedAt: clock() };
        check(row);
        state.tickets.push(row);
        return row.dbId;
      },
      async insertImported(t) {
        if (state.tickets.some((x) => x.id === t.number)) return null;
        state.ticketSeq += 1;
        const row = { dbId: String(state.ticketSeq), id: t.number, lamp: t.lamp, where: t.where, issue: t.issue, priority: t.priority, technicianId: null, legacyTechnician: t.legacyTechnician, status: t.status, reportedAt: t.reportedAt, firstResponseAt: t.firstResponseAt, resolvedAt: t.resolvedAt, resolution: t.resolution, archivedAt: null, archivedBy: null, createdBy: t.createdBy, version: 1, createdAt: t.createdAt, updatedAt: t.updatedAt };
        check(row);
        state.tickets.push(row);
        return row.dbId;
      },
      async update(id, patch) {
        const t = state.tickets.find((x) => x.dbId === String(id));
        const next = { ...t };
        for (const k of ['lamp', 'where', 'issue', 'priority', 'status', 'technicianId', 'reportedAt', 'firstResponseAt', 'resolvedAt', 'resolution', 'archivedAt', 'archivedBy']) if (patch[k] !== undefined) next[k] = patch[k];
        if (patch.legacyTechnician !== undefined) next.legacyTechnician = patch.legacyTechnician;
        check(next);
        Object.assign(t, next, { version: t.version + 1, updatedAt: clock() });
      },
      async bumpNumberSequence() {
        const max = Math.max(1000, ...state.tickets.map((t) => Number(/^MT-(\d+)$/.exec(t.id)?.[1] || 0)));
        state.numberSeq = Math.max(state.numberSeq, max);
      },
      async addHistory({ ticketId, action, previous = null, next = null, performedBy = null, at = null }) {
        if (!state.tickets.some((t) => t.dbId === String(ticketId))) throw new Error('violates foreign key (history.ticket)');
        state.histSeq += 1;
        state.history.push({ n: state.histSeq, ticketId: String(ticketId), action, previous, next, performedBy, by: performedBy ? userById(performedBy)?.fullName ?? null : null, at: at ?? clock() });
      },
      async historyFor(ids) { return state.history.filter((h) => ids.includes(h.ticketId)).sort((a, b) => a.at - b.at || a.n - b.n).map((h) => ({ ticketId: h.ticketId, action: h.action, previous: h.previous, next: h.next, performedBy: h.performedBy, by: h.by, at: h.at })); },
    };
    const LAMP = /^L-\d{3}$/;
    const events = {
      async add(e) {
        // the CHECK constraints from 002_streetlight_events.sql
        if (e.streetlightId !== null && e.streetlightId !== undefined && !LAMP.test(e.streetlightId)) throw new Error('violates streetlight_id check');
        if ((e.type === 'SCHEDULE_CHANGE') !== (e.streetlightId === null || e.streetlightId === undefined)) throw new Error('violates events_lamp_matches_type');
        if (!['STATUS_CHANGE', 'MAINTENANCE', 'SCHEDULE_CHANGE'].includes(e.type)) throw new Error('violates event_type check');
        if (!['DEVICE', 'TEST', 'SERVER', 'USER'].includes(e.source)) throw new Error('violates source check');
        if (e.ticketId && e.type !== 'MAINTENANCE') throw new Error('violates events_ticket_only_maintenance');
        if (e.ticketId && !state.tickets.some((t) => t.dbId === String(e.ticketId))) throw new Error('violates foreign key (events.ticket)');
        if (e.lux !== null && e.lux !== undefined && e.lux < 0) throw new Error('violates lux check');
        if (!e.next || !String(e.description || '').trim()) throw new Error('violates not-null');
        state.eventSeq += 1;
        state.events.push({ id: String(state.eventSeq), lamp: e.streetlightId ?? null, at: e.occurredAt, type: e.type, previous: e.previous ?? null, next: e.next, rawStatus: e.rawStatus ?? null, lux: e.lux ?? null, description: e.description, source: e.source, ticketId: e.ticketId ? String(e.ticketId) : null, actorId: e.actorId ? String(e.actorId) : null });
        return String(state.eventSeq);
      },
      async list({ lamp = null, type = null, ticketId = null, limit = 50, before = null } = {}) {
        return state.events
          .filter((e) => (!lamp || e.lamp === lamp || e.lamp === null) && (!type || e.type === type) && (!ticketId || e.ticketId === String(ticketId)))
          .filter((e) => !before || e.at < before.at || (e.at === before.at && Number(e.id) < Number(before.id)))
          .sort((a, b) => b.at - a.at || Number(b.id) - Number(a.id))
          .slice(0, limit)
          .map((e) => ({ ...e, ticketNumber: e.ticketId ? state.tickets.find((t) => t.dbId === e.ticketId)?.id ?? null : null, actorName: e.actorId ? userById(e.actorId)?.fullName ?? null : null }));
      },
      async lastStatuses() {
        const out = {};
        for (const e of [...state.events].sort((a, b) => a.at - b.at || Number(a.id) - Number(b.id))) if (e.type === 'STATUS_CHANGE' && e.lamp) out[e.lamp] = e.next;
        return out;
      },
      async count() { return state.events.length; },
    };
    const schedule = {
      async get() { return { ...state.schedule }; },
      async set({ onTime, offTime, updatedBy }) { state.schedule = { onTime, offTime, updatedAt: clock(), updatedBy: updatedBy ? String(updatedBy) : null }; return { ...state.schedule }; },
    };
    const inviteView = (i) => {
      const nowMs = clock();
      return { id: i.id, label: i.label, createdAt: i.createdAt, createdByName: userById(i.createdBy)?.fullName ?? null, expiresAt: i.expiresAt, usedAt: i.usedAt, usedByName: i.usedBy ? userById(i.usedBy)?.fullName ?? null : null, usedByUsername: i.usedBy ? userById(i.usedBy)?.username ?? null : null, revokedAt: i.revokedAt, revokedByName: i.revokedBy ? userById(i.revokedBy)?.fullName ?? null : null, status: i.usedAt ? 'USED' : i.revokedAt ? 'REVOKED' : i.expiresAt <= nowMs ? 'EXPIRED' : 'ACTIVE' };
    };
    const invites = {
      async create({ keyHash, label, createdBy, expiresAt }) {
        // the CHECK / UNIQUE constraints from 004_developer_role_and_invites.sql
        if (state.invites.some((i) => i.keyHash === keyHash)) throw new Error('violates unique key_hash');
        if (String(label).trim().length < 2 || String(label).trim().length > 60) throw new Error('violates label check');
        if (!userById(createdBy)) throw new Error('violates foreign key (invites.created_by)');
        if (!(expiresAt > clock())) throw new Error('violates developer_invites_expiry_after_creation');
        state.inviteSeq += 1;
        const row = { id: String(state.inviteSeq), keyHash, label, createdBy: String(createdBy), createdAt: clock(), expiresAt, usedAt: null, usedBy: null, revokedAt: null, revokedBy: null };
        state.invites.push(row);
        return inviteView(row);
      },
      async findById(id) { const i = state.invites.find((x) => x.id === String(id)); return i ? inviteView(i) : null; },
      async list() { return [...state.invites].sort((a, b) => b.createdAt - a.createdAt || Number(b.id) - Number(a.id)).map(inviteView); },
      async consume(keyHash) {
        const i = state.invites.find((x) => x.keyHash === keyHash);
        if (!i || i.usedAt || i.revokedAt || i.expiresAt <= clock()) return null;
        i.usedAt = clock();
        return i.id;
      },
      async setUsedBy(id, userId) { state.invites.find((x) => x.id === String(id)).usedBy = String(userId); },
      async revoke(id, revokedBy) {
        const i = state.invites.find((x) => x.id === String(id));
        if (!i || i.usedAt || i.revokedAt) return false;
        i.revokedAt = clock(); i.revokedBy = String(revokedBy);
        return true;
      },
      _keyHashes: () => state.invites.map((i) => i.keyHash),
    };
    return { users, sessions, tickets, events, schedule, invites };
  };

  const repos = build();
  // Transactions: if the callback throws, every change it made is rolled back (like ROLLBACK in PostgreSQL).
  repos.tx = async (fn) => {
    const snap = structuredClone(state);
    try { return await fn(repos); } catch (e) { state = snap; throw e; }
  };
  repos._state = () => state;
  repos._setClock = (c) => { clock = c; };
  return repos;
};
