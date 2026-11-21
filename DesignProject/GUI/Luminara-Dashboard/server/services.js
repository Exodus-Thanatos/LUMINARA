// The rules. Routes call these; these call the repositories. Nothing here knows about HTTP except HttpError.
// Every method receives the signed-in user (`actor`) and checks permission itself, so a new route cannot forget to.
import crypto from 'node:crypto';
import { HttpError } from './http-util.js';
import { ConflictError } from './repos.js';
import { can, ROLES } from './permissions.js';
import { passwordProblems, generateTemporaryPassword } from './password.js';
import { newToken, hashToken } from './http-util.js';
import { validateSchedule, scheduleSummary, DEFAULT_SCHEDULE } from './schedule.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const LAMP_RE = /^L-\d{3}$/;
export const STATUSES = ['OPEN', 'ASSIGNED', 'IN PROGRESS', 'RESOLVED'];
const INITIAL_STATUSES = ['OPEN', 'ASSIGNED', 'IN PROGRESS'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const ACTIVE = ['ASSIGNED', 'IN PROGRESS'];
const ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE'];
const ID_RE = /^[1-9]\d{0,17}$/;
const MAX_IMPORT = 500;
// Developer registration keys (Phase 5 Step 4): 'LDK-' + 32 random URL-safe characters (192 bits). Shown once, stored only as a hash.
const INVITE_KEY_RE = /^LDK-[A-Za-z0-9_-]{32}$/;
export const INVITE_DEFAULT_DAYS = 7;
export const INVITE_MAX_DAYS = 30;
export const newInviteKey = () => `LDK-${crypto.randomBytes(24).toString('base64url')}`;
export const hashInviteKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');
const INVALID_KEY_MESSAGE = 'This registration key is not valid. Ask an administrator for a new one.'; // the same words for wrong, used, revoked and expired

const fail = (status, code, message, fields) => new HttpError(status, code, message, fields ? { fields } : {});
const validation = (fields) => fail(400, 'validation', 'Please correct the highlighted fields.', fields);
const forbid = (msg = 'You do not have permission to do that.') => fail(403, 'forbidden', msg);
const need = (actor, permission) => {
  if (!actor) throw fail(401, 'unauthenticated', 'Please sign in.');
  if (!can(actor.role, permission)) throw forbid();
};
const cleanId = (id) => {
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  const s = String(id);
  return ID_RE.test(s) ? s : null;
};
const normName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

export const publicUser = (u) => ({
  id: u.id,
  fullName: u.fullName,
  username: u.username,
  email: u.email,
  role: u.role,
  accountStatus: u.accountStatus,
  mustChangePassword: !!u.mustChangePassword,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
});

// Human-readable line for one history row (what the Maintenance screen shows).
export const historyText = (h) => {
  switch (h.action) {
    case 'CREATED': return `Ticket created as ${h.next}`;
    case 'STATUS_CHANGED': return `Status ${h.previous} → ${h.next}`;
    case 'TECHNICIAN_CHANGED': return h.next ? (h.previous ? `Technician ${h.previous} → ${h.next}` : `Technician set to ${h.next}`) : 'Technician removed';
    case 'PRIORITY_CHANGED': return `Priority ${h.previous} → ${h.next}`;
    case 'DETAILS_EDITED': return 'Details edited';
    case 'RESOLVED': return `Resolution: ${h.next}`;
    case 'ARCHIVED': return 'Archived (removed from the active list)';
    case 'RESTORED': return 'Restored from the archive';
    default: return h.next || h.action;
  }
};

export const createServices = ({ repos, hasher, config, now = () => Date.now(), onRevoke = () => {}, onScheduleChange = () => {}, localOffsetMin }) => {
  const ttlMs = config.sessionTtlHours * 3600 * 1000;

  // ---------- login throttle (in memory; resets on restart) ----------
  const fails = new Map();
  const windowMs = config.loginWindowMinutes * 60000;
  const throttleKeys = (ip, identifier) => [`u:${ip}|${identifier.toLowerCase()}`, `ip:${ip}`];
  const limitFor = (key) => (key.startsWith('ip:') ? config.loginMaxFailures * 4 : config.loginMaxFailures);
  const blocked = (keys) => keys.some((k) => {
    const f = fails.get(k);
    if (!f) return false;
    if (now() - f.first > windowMs) { fails.delete(k); return false; }
    return f.count >= limitFor(k);
  });
  // Developer registration has its own counter (per address), so guessing keys is slowed down without touching the login limits.
  const regFails = new Map();
  const regKey = (ip) => `reg:${ip || 'unknown'}`;
  const regBlocked = (ip) => {
    const f = regFails.get(regKey(ip));
    if (!f) return false;
    if (now() - f.first > windowMs) { regFails.delete(regKey(ip)); return false; }
    return f.count >= config.loginMaxFailures;
  };
  const regNoteFailure = (ip) => {
    const f = regFails.get(regKey(ip));
    if (!f || now() - f.first > windowMs) regFails.set(regKey(ip), { count: 1, first: now() });
    else f.count += 1;
  };
  const noteFailure = (keys) => keys.forEach((k) => {
    const f = fails.get(k);
    if (!f || now() - f.first > windowMs) fails.set(k, { count: 1, first: now() });
    else f.count += 1;
  });

  // ---------- users & sessions ----------
  const checkUserFields = (f, { partial = false } = {}) => {
    const e = {};
    const out = {};
    if (!partial || f.fullName !== undefined) {
      const v = normName(f.fullName);
      if (v.length < 2 || v.length > 80) e.fullName = 'Enter the full name (2 to 80 characters).';
      else out.fullName = v;
    }
    if (!partial || f.username !== undefined) {
      const v = String(f.username ?? '').trim();
      if (!USERNAME_RE.test(v)) e.username = 'Use 3 to 32 letters, numbers, dots, dashes or underscores.';
      else out.username = v;
    }
    if (!partial || f.email !== undefined) {
      const v = String(f.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(v) || v.length > 254) e.email = 'Enter a valid email address.';
      else out.email = v;
    }
    if (!partial || f.role !== undefined) {
      if (!ROLES.includes(f.role)) e.role = 'Choose a role.';
      else out.role = f.role;
    }
    if (!partial || f.accountStatus !== undefined) {
      const v = f.accountStatus ?? 'ACTIVE';
      if (!ACCOUNT_STATUSES.includes(v)) e.accountStatus = 'Choose Active or Inactive.';
      else out.accountStatus = v;
    }
    return { errors: e, values: out };
  };

  const dupFields = async (values, exceptId = null) => {
    const e = {};
    if (values.username) {
      const u = await repos.users.findByUsername(values.username);
      if (u && u.id !== exceptId) e.username = 'That username is already taken.';
    }
    if (values.email) {
      const u = await repos.users.findByEmail(values.email);
      if (u && u.id !== exceptId) e.email = 'That email address is already registered.';
    }
    return e;
  };
  const conflictToHttp = (err) => {
    if (err instanceof ConflictError) return validation({ [err.field]: err.field === 'username' ? 'That username is already taken.' : 'That email address is already registered.' });
    return err;
  };

  const svc = {
    // ----- authentication -----
    async login(identifier, password, { ip = '', userAgent = '' } = {}) {
      const id = String(identifier ?? '').trim();
      const pw = typeof password === 'string' ? password : '';
      if (!id || !pw || id.length > 254 || pw.length > 1000) throw fail(400, 'validation', 'Enter your username or email and your password.');
      const keys = throttleKeys(ip, id);
      if (blocked(keys)) throw fail(429, 'too_many_attempts', `Too many failed sign-in attempts. Wait ${config.loginWindowMinutes} minutes and try again.`);
      const user = await repos.users.findByLogin(id);
      const ok = user ? await hasher.verify(pw, user.passwordHash) : await hasher.verifyDummy(pw);
      if (!user || !ok) {
        noteFailure(keys);
        throw fail(401, 'invalid_credentials', 'Incorrect username/email or password.');
      }
      if (user.accountStatus !== 'ACTIVE') throw fail(403, 'account_inactive', 'This account is inactive. Contact your administrator.');
      keys.forEach((k) => fails.delete(k));
      const token = newToken();
      const expiresAt = now() + ttlMs;
      await repos.sessions.create({ userId: user.id, tokenHash: hashToken(token), expiresAt, ip, userAgent });
      await repos.users.touchLogin(user.id);
      return { token, expiresAt, user: publicUser(user) };
    },
    async authenticate(token) {
      if (!token || typeof token !== 'string' || token.length > 200) return null;
      const tokenHash = hashToken(token);
      const s = await repos.sessions.findValid(tokenHash);
      if (!s) return null;
      if (s.user.accountStatus !== 'ACTIVE') {
        await repos.sessions.delete(tokenHash); // deactivated: the session is worthless from now on
        return null;
      }
      await repos.sessions.touch(tokenHash);
      return { user: s.user, tokenHash, expiresAt: s.expiresAt };
    },
    async authenticateHash(tokenHash) {
      const s = await repos.sessions.findValid(tokenHash);
      return !!s && s.user.accountStatus === 'ACTIVE';
    },
    async logout(token) {
      if (!token) return;
      const tokenHash = hashToken(token);
      await repos.sessions.delete(tokenHash);
      onRevoke({ tokenHash });
    },
    async changePassword(auth, current, next) {
      const user = await repos.users.findById(auth.user.id);
      if (!user || !(await hasher.verify(String(current ?? ''), user.passwordHash))) throw validation({ currentPassword: 'The current password is not correct.' });
      const problems = passwordProblems(next, user);
      if (problems.length) throw validation({ newPassword: problems.join(' ') });
      if (await hasher.verify(next, user.passwordHash)) throw validation({ newPassword: 'Choose a password you have not used for this account just now.' });
      await repos.users.setPassword(user.id, await hasher.hash(next), false);
      await repos.sessions.deleteForUser(user.id, auth.tokenHash); // every other device is signed out
      onRevoke({ userId: user.id, exceptTokenHash: auth.tokenHash });
      return publicUser({ ...user, mustChangePassword: false });
    },
    async purgeSessions() {
      return repos.sessions.purgeExpired();
    },

    // ----- user management (ADMIN) -----
    async listUsers(actor) {
      need(actor, 'users.manage');
      return (await repos.users.list()).map(publicUser);
    },
    async listTechnicians(actor) {
      need(actor, 'technicians.list');
      return (await repos.users.listActiveTechnicians()).map((u) => ({ id: u.id, fullName: u.fullName, role: u.role }));
    },
    async createUser(actor, input) {
      need(actor, 'users.manage');
      const { errors, values } = checkUserFields(input);
      let password = input.password;
      let temporary = null;
      if (input.generateTemporaryPassword) {
        temporary = generateTemporaryPassword();
        password = temporary;
      } else {
        if (password !== input.confirmPassword) errors.confirmPassword = 'The two passwords do not match.';
        const problems = passwordProblems(password, values);
        if (problems.length) errors.password = problems.join(' ');
      }
      Object.assign(errors, await dupFields(values));
      if (Object.keys(errors).length) throw validation(errors);
      try {
        const u = await repos.users.create({ ...values, passwordHash: await hasher.hash(password), mustChangePassword: true, createdBy: actor.id });
        return { user: publicUser(u), temporaryPassword: temporary };
      } catch (e) {
        throw conflictToHttp(e);
      }
    },
    async updateUser(actor, rawId, input) {
      need(actor, 'users.manage');
      const id = cleanId(rawId);
      if (!id) throw fail(404, 'not_found', 'User not found.');
      const { errors, values } = checkUserFields(input, { partial: true });
      if (Object.keys(errors).length) throw validation(errors);
      Object.assign(errors, await dupFields(values, id));
      if (Object.keys(errors).length) throw validation(errors);
      try {
        const { updated, revoked } = await repos.tx(async (r) => {
          const target = await r.users.lockById(id);
          if (!target) throw fail(404, 'not_found', 'User not found.');
          const losesAdmin = target.role === 'ADMIN' && target.accountStatus === 'ACTIVE' && ((values.role && values.role !== 'ADMIN') || values.accountStatus === 'INACTIVE');
          if (losesAdmin) {
            const admins = await r.users.lockActiveAdmins();
            if (admins.length <= 1) throw fail(409, 'last_admin', 'This is the last active administrator. Create or activate another administrator first.');
          }
          const row = await r.users.update(id, values);
          const mustSignOut = (values.accountStatus === 'INACTIVE' && target.accountStatus !== 'INACTIVE') || (values.role !== undefined && values.role !== target.role);
          if (mustSignOut) await r.sessions.deleteForUser(id); // deactivated or role changed: force a fresh sign-in
          return { updated: row, revoked: mustSignOut };
        });
        if (revoked) onRevoke({ userId: id });
        return publicUser(updated);
      } catch (e) {
        throw conflictToHttp(e);
      }
    },
    async resetPassword(actor, rawId, input = {}) {
      need(actor, 'users.manage');
      const id = cleanId(rawId);
      const target = id && (await repos.users.findById(id));
      if (!target) throw fail(404, 'not_found', 'User not found.');
      const temporary = generateTemporaryPassword();
      void input;
      await repos.users.setPassword(id, await hasher.hash(temporary), true);
      await repos.sessions.deleteForUser(id);
      onRevoke({ userId: id });
      return { user: publicUser({ ...target, mustChangePassword: true }), temporaryPassword: temporary };
    },

    // ----- developer registration keys (Phase 5 Step 4) -----
    // ADMIN creates a key; it is returned ONCE here and never again (the list below has no key, no hash).
    async createDeveloperInvite(actor, input = {}) {
      need(actor, 'developers.invite');
      const errors = {};
      const label = normName(input.label);
      if (label.length < 2 || label.length > 60) errors.label = 'Enter a short label (2 to 60 characters), for example who the key is for.';
      let days = input.expiresInDays === undefined || input.expiresInDays === '' ? INVITE_DEFAULT_DAYS : Number(input.expiresInDays);
      if (!Number.isInteger(days) || days < 1 || days > INVITE_MAX_DAYS) errors.expiresInDays = `Choose 1 to ${INVITE_MAX_DAYS} days.`;
      if (Object.keys(errors).length) throw validation(errors);
      days = Number(days);
      const key = newInviteKey();
      const invite = await repos.invites.create({ keyHash: hashInviteKey(key), label, createdBy: actor.id, expiresAt: now() + days * 86400000 });
      return { invite, key };
    },
    async listDeveloperInvites(actor) {
      need(actor, 'developers.invite');
      return repos.invites.list();
    },
    async revokeDeveloperInvite(actor, rawId) {
      need(actor, 'developers.invite');
      const id = cleanId(rawId);
      const invite = id && (await repos.invites.findById(id));
      if (!invite) throw fail(404, 'not_found', 'Registration key not found.');
      if (invite.status === 'USED') throw fail(409, 'invite_used', 'This key has already been used to create an account, so it cannot be revoked.');
      if (invite.status === 'REVOKED') return invite;
      await repos.invites.revoke(id, actor.id);
      return repos.invites.findById(id);
    },
    // Public (no sign-in). The role is ALWAYS DEVELOPER: nothing in the request can choose another one. The key is consumed and the
    // account created in ONE transaction, so a key is never burned by a failed registration and never works twice.
    async registerDeveloper(input = {}, { ip = '' } = {}) {
      const errors = {};
      const { errors: fieldErrors, values } = checkUserFields({ fullName: input.fullName, username: input.username, email: input.email, role: 'DEVELOPER', accountStatus: 'ACTIVE' });
      Object.assign(errors, fieldErrors);
      const password = input.password;
      if (password !== input.confirmPassword) errors.confirmPassword = 'The two passwords do not match.';
      const problems = passwordProblems(password, values);
      if (problems.length) errors.password = problems.join(' ');
      const rawKey = typeof input.registrationKey === 'string' ? input.registrationKey.trim() : '';
      if (!rawKey) errors.registrationKey = 'Enter the developer registration key.';
      // Field mistakes are reported before anything touches the key or the database, so they reveal nothing about keys or accounts.
      if (Object.keys(errors).length) throw validation(errors);
      if (regBlocked(ip)) throw fail(429, 'too_many_attempts', `Too many registration attempts. Wait ${config.loginWindowMinutes} minutes and try again.`);
      const passwordHash = await hasher.hash(password);
      try {
        const created = await repos.tx(async (r) => {
          const inviteId = INVITE_KEY_RE.test(rawKey) ? await r.invites.consume(hashInviteKey(rawKey)) : null;
          if (!inviteId) throw fail(403, 'invalid_registration_key', INVALID_KEY_MESSAGE);
          const dup = await dupFields(values); // only a holder of a valid key learns whether a username or email is taken
          if (Object.keys(dup).length) throw validation(dup); // rolls back: the key is NOT used up
          const u = await r.users.create({ ...values, role: 'DEVELOPER', accountStatus: 'ACTIVE', passwordHash, mustChangePassword: false, createdBy: null });
          await r.invites.setUsedBy(inviteId, u.id);
          return u;
        });
        return { user: publicUser(created) };
      } catch (e) {
        if (e instanceof HttpError && e.code === 'invalid_registration_key') regNoteFailure(ip);
        throw conflictToHttp(e);
      }
    },
  };

  // ---------- tickets ----------
  const loadHistory = async (tickets) => {
    const rows = await repos.tickets.historyFor(tickets.map((t) => t.dbId));
    const byTicket = new Map();
    for (const h of rows) {
      if (!byTicket.has(h.ticketId)) byTicket.set(h.ticketId, []);
      byTicket.get(h.ticketId).push({ at: h.at, text: historyText(h), action: h.action, by: h.by, previous: h.previous, next: h.next });
    }
    return tickets.map((t) => ({ ...t, history: byTicket.get(t.dbId) || [] }));
  };

  const parseWhen = (v, label) => {
    const t = typeof v === 'number' ? v : Date.parse(String(v));
    if (!Number.isFinite(t)) throw validation({ reportedAt: `${label} is not a valid date.` });
    return t;
  };

  const checkTechnician = async (r, technicianId) => {
    const id = cleanId(technicianId);
    const u = id && (await r.users.findById(id));
    if (!u || u.role !== 'TECHNICIAN' || u.accountStatus !== 'ACTIVE') throw validation({ technician: 'Choose a registered, active technician.' });
    return u;
  };

  const checkTicketFields = (f) => {
    const e = {};
    const lamp = String(f.lamp ?? '').trim().toUpperCase();
    if (!LAMP_RE.test(lamp)) e.lamp = 'Use the format L-000, for example L-008.';
    const where = String(f.where ?? '').trim();
    if (where.length < 3 || where.length > 80) e.where = 'Location must be 3 to 80 characters.';
    const issue = String(f.issue ?? '').trim();
    if (issue.length < 5 || issue.length > 300) e.issue = 'Describe the issue (5 to 300 characters).';
    if (!PRIORITIES.includes(f.priority)) e.priority = 'Choose a priority.';
    return { e, lamp, where, issue };
  };

  const ticketView = async (id) => {
    const t = await repos.tickets.findById(id);
    return (await loadHistory([t]))[0];
  };

  // ---------- streetlight history: maintenance events are written in the SAME transaction as the ticket change ----------
  const ticketEvent = (r, { lamp, ticketId, at, previous, next, description, actorId }) =>
    r.events.add({ streetlightId: lamp, occurredAt: at, type: 'MAINTENANCE', previous: previous ?? null, next, description: description.slice(0, 400), source: 'USER', ticketId, actorId });
  const EVENT_TYPES = ['STATUS_CHANGE', 'MAINTENANCE', 'SCHEDULE_CHANGE'];
  const fmtSchedule = (x) => `ON ${x.onTime} · OFF ${x.offTime}`;

  Object.assign(svc, {
    async listTickets(actor, { archived = false } = {}) {
      // BASIC has no maintenance.view: it only gets the read-only list of tickets assigned to the signed-in user.
      const assignedOnly = !!actor && !can(actor.role, 'maintenance.view') && can(actor.role, 'maintenance.viewAssigned');
      if (archived) need(actor, 'maintenance.viewArchive');
      else if (!assignedOnly) need(actor, 'maintenance.view');
      const scope = actor.role === 'TECHNICIAN' || assignedOnly ? { technicianId: actor.id } : {};
      const tickets = await loadHistory(await repos.tickets.list({ archived, ...scope }));
      if (archived) return { tickets };
      return { tickets, summaryRows: await repos.tickets.summaryRows(scope), serverTime: now() };
    },

    async createTicket(actor, input) {
      need(actor, 'maintenance.create');
      const { e, lamp, where, issue } = checkTicketFields(input);
      if (!INITIAL_STATUSES.includes(input.status)) e.status = 'Choose Open, Assigned or In Progress.';
      const techGiven = input.technicianId !== undefined && input.technicianId !== null && input.technicianId !== '';
      if (ACTIVE.includes(input.status) && !techGiven) e.technician = 'Assign a technician before setting this status.';
      if (input.status === 'OPEN' && techGiven) e.technician = 'An Open ticket has no technician. Choose Assigned or In Progress, or clear the technician.';
      const t0 = now();
      let reportedAt = t0;
      if (input.reportedAt !== undefined && input.reportedAt !== null) {
        reportedAt = parseWhen(input.reportedAt, 'The report date');
        if (reportedAt > t0 + 60000) e.reportedAt = 'The report date cannot be in the future.';
      }
      if (Object.keys(e).length) throw validation(e);
      const id = await repos.tx(async (r) => {
        const tech = techGiven ? await checkTechnician(r, input.technicianId) : null;
        const newId = await r.tickets.create({
          lamp, where, issue, priority: input.priority, technicianId: tech ? tech.id : null, status: input.status, reportedAt,
          firstResponseAt: input.status === 'OPEN' ? null : t0, createdBy: actor.id,
        });
        await r.tickets.addHistory({ ticketId: newId, action: 'CREATED', next: input.status, performedBy: actor.id });
        if (tech) await r.tickets.addHistory({ ticketId: newId, action: 'TECHNICIAN_CHANGED', next: tech.fullName, performedBy: actor.id });
        const made = await r.tickets.findById(newId);
        await ticketEvent(r, { lamp, ticketId: newId, at: t0, next: input.status, actorId: actor.id, description: `Maintenance ticket ${made.id} opened (${input.priority} priority, ${input.status}): ${issue}` });
        if (tech) await ticketEvent(r, { lamp, ticketId: newId, at: t0, next: `Assigned to ${tech.fullName}`, actorId: actor.id, description: `Ticket ${made.id} assigned to ${tech.fullName}.` });
        return newId;
      });
      return ticketView(id);
    },

    async updateTicket(actor, rawId, input) {
      if (!actor) throw fail(401, 'unauthenticated', 'Please sign in.');
      const full = can(actor.role, 'maintenance.edit');
      const own = can(actor.role, 'maintenance.updateOwn');
      if (!full && !own) throw forbid();
      const id = cleanId(rawId);
      if (!id) throw fail(404, 'not_found', 'Ticket not found.');
      const resolvedId = await repos.tx(async (r) => {
        const cur = await r.tickets.findById(id, { forUpdate: true });
        if (!cur) throw fail(404, 'not_found', 'Ticket not found.');
        if (cur.archivedAt) throw fail(409, 'archived', 'This ticket is archived. Restore it before changing it.');
        if (input.expectedVersion !== undefined && Number(input.expectedVersion) !== cur.version) {
          throw fail(409, 'stale', 'Someone else changed this ticket. Close it and open it again to see the latest version.');
        }
        const t0 = now();
        const patch = {};
        const log = [];

        if (!full) {
          // TECHNICIAN: only their own ticket, only status (and the resolution note)
          if (cur.technicianId !== actor.id) throw forbid('You can only update tickets assigned to you.');
          const allowedKeys = new Set(['status', 'resolution', 'expectedVersion']);
          const extra = Object.keys(input).filter((k) => !allowedKeys.has(k));
          if (extra.length) throw forbid('Technicians can only update the status of their own tickets.');
          const ALLOWED = { ASSIGNED: ['IN PROGRESS', 'RESOLVED'], 'IN PROGRESS': ['RESOLVED', 'ASSIGNED'] };
          if (input.status !== undefined && input.status !== cur.status && !(ALLOWED[cur.status] || []).includes(input.status)) {
            throw forbid(`You cannot change a ticket from ${cur.status} to ${input.status}.`);
          }
        }

        if (full) {
          const merged = { lamp: input.lamp ?? cur.lamp, where: input.where ?? cur.where, issue: input.issue ?? cur.issue, priority: input.priority ?? cur.priority };
          const { e, lamp, where, issue } = checkTicketFields(merged);
          if (Object.keys(e).length) throw validation(e);
          if (lamp !== cur.lamp) patch.lamp = lamp;
          if (where !== cur.where) patch.where = where;
          if (issue !== cur.issue) patch.issue = issue;
          if (merged.priority !== cur.priority) { patch.priority = merged.priority; log.push({ action: 'PRIORITY_CHANGED', previous: cur.priority, next: merged.priority }); }
          if (input.reportedAt !== undefined && input.reportedAt !== null) {
            const when = parseWhen(input.reportedAt, 'The report date');
            if (when > t0 + 60000) throw validation({ reportedAt: 'The report date cannot be in the future.' });
            if (when !== cur.createdAt) patch.reportedAt = when;
          }
          if (patch.lamp !== undefined || patch.where !== undefined || patch.issue !== undefined || patch.reportedAt !== undefined) log.push({ action: 'DETAILS_EDITED' });
        }

        const status = input.status ?? cur.status;
        if (!STATUSES.includes(status)) throw validation({ status: 'Choose a status.' });

        // technician (ADMIN only)
        let techName = cur.technician;
        let hasTech = !!(cur.technicianId || cur.technicianLegacy);
        if (full && input.technicianId !== undefined) {
          const wanted = input.technicianId === null || input.technicianId === '' ? null : cleanId(input.technicianId);
          if (input.technicianId !== null && input.technicianId !== '' && !wanted) throw validation({ technician: 'Choose a registered, active technician.' });
          if (wanted !== cur.technicianId) {
            const u = wanted ? await checkTechnician(r, wanted) : null;
            patch.technicianId = u ? u.id : null;
            patch.legacyTechnician = null;
            log.push({ action: 'TECHNICIAN_CHANGED', previous: cur.technician || null, next: u ? u.fullName : null });
            techName = u ? u.fullName : '';
            hasTech = !!u;
          } else if (!wanted && cur.technicianLegacy) {
            patch.legacyTechnician = null; // clearing a legacy name
            log.push({ action: 'TECHNICIAN_CHANGED', previous: cur.technician, next: null });
            hasTech = false;
          }
        }
        void techName;
        // Only judge the assignment when this request changes the status or the technician, so an old ticket can still have its priority edited.
        if (status !== cur.status || 'technicianId' in patch || 'legacyTechnician' in patch) {
          if (status === 'OPEN' && hasTech) throw validation({ technician: 'An Open ticket has no technician. Choose Assigned or In Progress, or clear the technician.' });
          if (ACTIVE.includes(status) && !hasTech) throw validation({ technician: 'Assign a technician before setting this status.' });
          if (status === 'RESOLVED' && !hasTech) throw validation({ technician: 'Assign a technician before resolving.' });
        }

        if (status !== cur.status) {
          patch.status = status;
          log.push({ action: 'STATUS_CHANGED', previous: cur.status, next: status });
          if (cur.firstResponseAt === null && status !== 'OPEN') patch.firstResponseAt = t0;
          if (status === 'RESOLVED') {
            patch.resolvedAt = t0;
            const note = String(input.resolution ?? '').trim();
            if (note.length > 200) throw validation({ resolution: 'Keep the resolution note under 200 characters.' });
            patch.resolution = note;
            if (note) log.push({ action: 'RESOLVED', next: note });
          } else if (cur.status === 'RESOLVED') {
            patch.resolvedAt = null; // re-opened
          }
        }
        if (log.length === 0 && Object.keys(patch).length === 0) return id;
        await r.tickets.update(id, patch);
        for (const l of log) await r.tickets.addHistory({ ticketId: id, action: l.action, previous: l.previous ?? null, next: l.next ?? null, performedBy: actor.id });
        // The same changes, as events of the streetlight (RESOLVED notes are folded into the status line).
        const lampNow = patch.lamp ?? cur.lamp;
        for (const l of log) {
          const common = { lamp: lampNow, ticketId: id, at: t0, actorId: actor.id };
          if (l.action === 'STATUS_CHANGED') {
            const note = l.next === 'RESOLVED' && patch.resolution ? ` Resolution: ${patch.resolution}` : '';
            await ticketEvent(r, { ...common, previous: l.previous, next: l.next, description: `Ticket ${cur.id} status changed from ${l.previous} to ${l.next}.${note}` });
          } else if (l.action === 'TECHNICIAN_CHANGED') {
            await ticketEvent(r, { ...common, previous: l.previous ?? 'Unassigned', next: l.next ?? 'Unassigned', description: l.next ? `Ticket ${cur.id} assigned to ${l.next}.` : `Ticket ${cur.id} technician removed.` });
          } else if (l.action === 'PRIORITY_CHANGED') {
            await ticketEvent(r, { ...common, previous: l.previous, next: l.next, description: `Ticket ${cur.id} priority changed from ${l.previous} to ${l.next}.` });
          }
        }
        return id;
      });
      return ticketView(resolvedId);
    },

    async archiveTicket(actor, rawId) {
      need(actor, 'maintenance.archive');
      const id = cleanId(rawId);
      if (!id) throw fail(404, 'not_found', 'Ticket not found.');
      await repos.tx(async (r) => {
        const cur = await r.tickets.findById(id, { forUpdate: true });
        if (!cur) throw fail(404, 'not_found', 'Ticket not found.');
        if (cur.archivedAt) throw fail(409, 'already_archived', 'This ticket is already archived.');
        if (cur.status !== 'RESOLVED') throw fail(409, 'not_resolved', 'Only resolved tickets can be removed. Mark the ticket as resolved first.');
        await r.tickets.update(id, { archivedAt: now(), archivedBy: actor.id });
        await r.tickets.addHistory({ ticketId: id, action: 'ARCHIVED', performedBy: actor.id });
      });
      return ticketView(id);
    },

    async restoreTicket(actor, rawId) {
      need(actor, 'maintenance.restore');
      const id = cleanId(rawId);
      if (!id) throw fail(404, 'not_found', 'Ticket not found.');
      await repos.tx(async (r) => {
        const cur = await r.tickets.findById(id, { forUpdate: true });
        if (!cur) throw fail(404, 'not_found', 'Ticket not found.');
        if (!cur.archivedAt) throw fail(409, 'not_archived', 'This ticket is not archived.');
        await r.tickets.update(id, { archivedAt: null, archivedBy: null });
        await r.tickets.addHistory({ ticketId: id, action: 'RESTORED', performedBy: actor.id });
      });
      return ticketView(id);
    },

    // One-time import of tickets that were saved in a browser by the old prototype. Never overwrites, never deletes.
    async importTickets(actor, input) {
      need(actor, 'maintenance.import');
      const list = Array.isArray(input.tickets) ? input.tickets : null;
      if (!list) throw fail(400, 'validation', 'Send { "tickets": [ … ] }.');
      if (list.length > MAX_IMPORT) throw fail(400, 'too_many', `Import at most ${MAX_IMPORT} tickets at a time.`);
      const result = { imported: [], skipped: [] };
      for (const raw of list) {
        const number = typeof raw?.id === 'string' ? raw.id.trim() : '';
        if (!/^MT-\d{1,9}$/.test(number)) { result.skipped.push({ id: number || '(no number)', reason: 'invalid ticket number' }); continue; }
        const { e, lamp, where, issue } = checkTicketFields({ lamp: raw.lamp, where: raw.where, issue: raw.issue, priority: raw.priority });
        if (Object.keys(e).length || !STATUSES.includes(raw.status)) { result.skipped.push({ id: number, reason: 'invalid ticket data' }); continue; }
        const created = Number.isFinite(raw.createdAt) ? raw.createdAt : now();
        const updated = Number.isFinite(raw.updatedAt) ? raw.updatedAt : created;
        const legacy = normName(raw.technician).slice(0, 80) || null;
        const resolvedAt = raw.status === 'RESOLVED' ? (Number.isFinite(raw.resolvedAt) ? raw.resolvedAt : updated) : null;
        const history = Array.isArray(raw.history) ? raw.history.filter((h) => h && typeof h.text === 'string' && Number.isFinite(h.at)).slice(0, 200) : [];
        const row = {
          number, lamp, where, issue, priority: raw.priority, status: raw.status,
          legacyTechnician: legacy,
          reportedAt: created, firstResponseAt: Number.isFinite(raw.firstResponseAt) ? raw.firstResponseAt : null,
          resolvedAt, resolution: String(raw.resolution ?? '').slice(0, 200), createdBy: actor.id, createdAt: created, updatedAt: updated,
        };
        // The database requires an assigned/in-progress ticket to have a technician; old data sometimes had none.
        if (ACTIVE.includes(row.status) && !row.legacyTechnician) row.legacyTechnician = 'Unknown (imported)';
        try {
          const newId = await repos.tx(async (r) => {
            const nid = await r.tickets.insertImported(row);
            if (!nid) return null;
            await r.tickets.addHistory({ ticketId: nid, action: 'IMPORTED_NOTE', next: 'Imported from this browser’s saved prototype data', performedBy: actor.id });
            for (const h of history) await r.tickets.addHistory({ ticketId: nid, action: 'IMPORTED_NOTE', next: h.text.slice(0, 300), performedBy: actor.id, at: h.at });
            return nid;
          });
          if (newId) result.imported.push(number);
          else result.skipped.push({ id: number, reason: 'a ticket with this number already exists in the database' });
        } catch (err) {
          if (err instanceof HttpError) throw err;
          result.skipped.push({ id: number, reason: 'could not be saved' });
        }
      }
      if (result.imported.length) await repos.tickets.bumpNumberSequence();
      return result;
    },

    // ---------- permanent streetlight history ----------
    // Query: { lamp: 'L-008' | omitted, type: STATUS_CHANGE | MAINTENANCE | SCHEDULE_CHANGE | omitted, limit, beforeAt, beforeId }
    async listHistory(actor, q = {}) {
      need(actor, 'history.view');
      const e = {};
      let lamp = null;
      if (q.lamp !== undefined && q.lamp !== null && q.lamp !== '') {
        lamp = String(q.lamp).trim().toUpperCase();
        if (!LAMP_RE.test(lamp)) e.lamp = 'Use the format L-000, for example L-008.';
      }
      let type = null;
      if (q.type !== undefined && q.type !== null && q.type !== '') {
        type = String(q.type).toUpperCase();
        if (!EVENT_TYPES.includes(type)) e.type = 'Choose Status change, Maintenance or Schedule change.';
      }
      let limit = 50;
      if (q.limit !== undefined && q.limit !== null && q.limit !== '') {
        limit = Number(q.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) e.limit = 'The page size must be 1 to 200.';
      }
      let before = null;
      if (q.beforeAt !== undefined && q.beforeAt !== null && q.beforeAt !== '') {
        const at = Number(q.beforeAt);
        const id = cleanId(q.beforeId);
        if (!Number.isFinite(at) || !id) e.before = 'Invalid page position.';
        else before = { at, id };
      }
      if (Object.keys(e).length) throw validation(e);
      // One extra row tells us whether another page exists.
      const rows = await repos.events.list({ lamp, type, limit: limit + 1, before });
      const more = rows.length > limit;
      const events = more ? rows.slice(0, limit) : rows;
      const last = events[events.length - 1];
      return { events, next: more && last ? { beforeAt: last.at, beforeId: last.id } : null, serverTime: now() };
    },

    // ---------- read-only data viewer (ADMIN, DEVELOPER) ----------
    // Row counts for the Data screen. The user count is only included for someone who may see users (ADMIN).
    async dataSummary(actor) {
      need(actor, 'data.view');
      const [events, active, archived, newest] = await Promise.all([
        repos.events.count(),
        repos.tickets.list({ archived: false }),
        repos.tickets.list({ archived: true }),
        repos.events.list({ limit: 1 }),
      ]);
      const users = can(actor.role, 'users.manage') ? (await repos.users.list()).length : null;
      return {
        counts: { events, tickets: active.length, archivedTickets: archived.length, users },
        lastEventAt: newest[0] ? newest[0].at : null,
        serverTime: now(),
      };
    },
    // Every saved ticket (active, or the archive) with its per-ticket trail, exactly as stored.
    async listDataTickets(actor, { archived = false } = {}) {
      need(actor, 'data.view');
      return { tickets: await loadHistory(await repos.tickets.list({ archived: !!archived })), serverTime: now() };
    },

    // ---------- lighting schedule ----------
    async getSchedule(actor) {
      need(actor, 'schedule.view');
      const cur = (await repos.schedule.get()) || { ...DEFAULT_SCHEDULE, updatedAt: null, updatedBy: null };
      return { schedule: { onTime: cur.onTime, offTime: cur.offTime, updatedAt: cur.updatedAt }, summary: scheduleSummary(cur, now(), localOffsetMin), serverTime: now() };
    },

    async updateSchedule(actor, input) {
      need(actor, 'schedule.edit');
      const { errors, values } = validateSchedule(input || {});
      if (Object.keys(errors).length) throw validation(errors);
      const t0 = now();
      const saved = await repos.tx(async (r) => {
        const cur = (await r.schedule.get({ forUpdate: true })) || { ...DEFAULT_SCHEDULE };
        if (cur.onTime === values.onTime && cur.offTime === values.offTime) return { changed: false, schedule: cur };
        const next = await r.schedule.set({ ...values, updatedBy: actor.id });
        await r.events.add({
          streetlightId: null, occurredAt: t0, type: 'SCHEDULE_CHANGE', previous: fmtSchedule(cur), next: fmtSchedule(values),
          description: `Lighting schedule changed from ${fmtSchedule(cur)} to ${fmtSchedule(values)}. The lamps keep following the times in the firmware until it is updated to match.`,
          source: 'USER', actorId: actor.id,
        });
        return { changed: true, schedule: next };
      });
      if (saved.changed) onScheduleChange({ onTime: saved.schedule.onTime, offTime: saved.schedule.offTime });
      return { changed: saved.changed, ...(await svc.getSchedule(actor)) };
    },
  });

  return svc;
};
