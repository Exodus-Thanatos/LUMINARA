// PostgreSQL access. Every statement is parameterized ($1, $2 …); column names come only from the fixed lists below,
// never from request data. `createRepos(db)` returns the repositories; `repos.tx(fn)` runs fn(repos) inside one transaction.
import { HttpError } from './http-util.js';

export class ConflictError extends Error {
  constructor(field) {
    super(`duplicate ${field}`);
    this.field = field;
  }
}

const ms = (d) => (d ? new Date(d).getTime() : null);
const str = (v) => (v === null || v === undefined ? null : String(v));

const USER_COLS = 'id, full_name, username, email, password_hash, role, account_status, must_change_password, last_login_at, created_at, updated_at, created_by';
export const mapUser = (r, prefix = '') =>
  r && {
    id: str(r[`${prefix}id`]),
    fullName: r[`${prefix}full_name`],
    username: r[`${prefix}username`],
    email: r[`${prefix}email`],
    passwordHash: r[`${prefix}password_hash`],
    role: r[`${prefix}role`],
    accountStatus: r[`${prefix}account_status`],
    mustChangePassword: r[`${prefix}must_change_password`],
    lastLoginAt: ms(r[`${prefix}last_login_at`]),
    createdAt: ms(r[`${prefix}created_at`]),
    updatedAt: ms(r[`${prefix}updated_at`]),
    createdBy: str(r[`${prefix}created_by`]),
  };

const USER_FIELDS = { fullName: 'full_name', username: 'username', email: 'email', role: 'role', accountStatus: 'account_status', mustChangePassword: 'must_change_password' };

// Turns the two unique-index violations into something the service can report as "username/e-mail already taken".
const guardUnique = async (fn) => {
  try {
    return await fn();
  } catch (e) {
    if (e && e.code === '23505') {
      if (String(e.constraint).includes('username')) throw new ConflictError('username');
      if (String(e.constraint).includes('email')) throw new ConflictError('email');
    }
    throw e;
  }
};

const usersRepo = (q) => ({
  async findById(id) {
    const r = await q.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
    return mapUser(r.rows[0]) || null;
  },
  async findByLogin(login) {
    const r = await q.query(`SELECT ${USER_COLS} FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)`, [login]);
    return mapUser(r.rows[0]) || null;
  },
  async findByUsername(username) {
    const r = await q.query(`SELECT ${USER_COLS} FROM users WHERE lower(username) = lower($1)`, [username]);
    return mapUser(r.rows[0]) || null;
  },
  async findByEmail(email) {
    const r = await q.query(`SELECT ${USER_COLS} FROM users WHERE lower(email) = lower($1)`, [email]);
    return mapUser(r.rows[0]) || null;
  },
  async list() {
    const r = await q.query(`SELECT ${USER_COLS} FROM users ORDER BY lower(full_name), id`);
    return r.rows.map((x) => mapUser(x));
  },
  async listActiveTechnicians() {
    const r = await q.query(`SELECT ${USER_COLS} FROM users WHERE role = 'TECHNICIAN' AND account_status = 'ACTIVE' ORDER BY lower(full_name), id`);
    return r.rows.map((x) => mapUser(x));
  },
  create: (u) =>
    guardUnique(async () => {
      const r = await q.query(
        `INSERT INTO users (full_name, username, email, password_hash, role, account_status, must_change_password, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${USER_COLS}`,
        [u.fullName, u.username, u.email, u.passwordHash, u.role, u.accountStatus, !!u.mustChangePassword, u.createdBy ?? null]
      );
      return mapUser(r.rows[0]);
    }),
  update: (id, patch) =>
    guardUnique(async () => {
      const sets = [];
      const vals = [];
      for (const [key, col] of Object.entries(USER_FIELDS)) {
        if (patch[key] !== undefined) {
          vals.push(patch[key]);
          sets.push(`${col} = $${vals.length}`);
        }
      }
      if (sets.length === 0) return usersRepo(q).findById(id);
      vals.push(id);
      const r = await q.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING ${USER_COLS}`, vals);
      return mapUser(r.rows[0]) || null;
    }),
  async setPassword(id, hash, mustChange) {
    await q.query('UPDATE users SET password_hash = $1, must_change_password = $2 WHERE id = $3', [hash, !!mustChange, id]);
  },
  async touchLogin(id) {
    await q.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
  },
  // Locks the active administrators' rows until the transaction ends, so two admins cannot demote each other at the same moment.
  async lockActiveAdmins() {
    const r = await q.query("SELECT id FROM users WHERE role = 'ADMIN' AND account_status = 'ACTIVE' FOR UPDATE");
    return r.rows.map((x) => str(x.id));
  },
  async lockById(id) {
    const r = await q.query(`SELECT ${USER_COLS} FROM users WHERE id = $1 FOR UPDATE`, [id]);
    return mapUser(r.rows[0]) || null;
  },
  async countAdmins() {
    const r = await q.query("SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN'");
    return r.rows[0].n;
  },
});

const sessionsRepo = (q) => ({
  async create({ userId, tokenHash, expiresAt, ip, userAgent }) {
    await q.query('INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5)', [tokenHash, userId, new Date(expiresAt), ip || null, (userAgent || '').slice(0, 300) || null]);
  },
  async findValid(tokenHash) {
    const r = await q.query(
      `SELECT s.expires_at AS s_expires_at, s.last_seen_at AS s_last_seen_at,
              u.id, u.full_name, u.username, u.email, u.password_hash, u.role, u.account_status, u.must_change_password, u.last_login_at, u.created_at, u.updated_at, u.created_by
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash]
    );
    const row = r.rows[0];
    return row ? { user: mapUser(row), expiresAt: ms(row.s_expires_at), lastSeenAt: ms(row.s_last_seen_at) } : null;
  },
  async touch(tokenHash) {
    await q.query("UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1 AND last_seen_at < now() - interval '1 minute'", [tokenHash]);
  },
  async delete(tokenHash) {
    await q.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  },
  async deleteForUser(userId, exceptTokenHash = null) {
    await q.query('DELETE FROM sessions WHERE user_id = $1 AND ($2::text IS NULL OR token_hash <> $2)', [userId, exceptTokenHash]);
  },
  async purgeExpired() {
    const r = await q.query('DELETE FROM sessions WHERE expires_at <= now()');
    return r.rowCount;
  },
});

// ---- tickets ----
const TICKET_SELECT = `
  SELECT t.id, t.ticket_number, t.streetlight_id, t.location, t.issue_description, t.priority, t.assigned_technician_id, t.legacy_technician_name,
         t.status, t.reported_at, t.first_response_at, t.resolved_at, t.resolution, t.archived_at, t.archived_by, t.created_by, t.version, t.created_at, t.updated_at,
         tu.full_name AS technician_name, tu.role AS technician_role, tu.account_status AS technician_status, au.full_name AS archived_by_name
    FROM maintenance_tickets t
    LEFT JOIN users tu ON tu.id = t.assigned_technician_id
    LEFT JOIN users au ON au.id = t.archived_by`;

export const mapTicket = (r) =>
  r && {
    dbId: str(r.id),
    id: r.ticket_number,
    lamp: r.streetlight_id,
    where: r.location,
    issue: r.issue_description,
    priority: r.priority,
    status: r.status,
    technicianId: str(r.assigned_technician_id),
    technician: r.technician_name || r.legacy_technician_name || '',
    technicianLegacy: !r.assigned_technician_id && !!r.legacy_technician_name,
    createdAt: ms(r.reported_at),
    updatedAt: ms(r.updated_at),
    firstResponseAt: ms(r.first_response_at),
    resolvedAt: ms(r.resolved_at),
    resolution: r.resolution || '',
    archivedAt: ms(r.archived_at),
    archivedBy: str(r.archived_by),
    archivedByName: r.archived_by_name || null,
    version: r.version,
    history: [],
  };

const TICKET_FIELDS = {
  lamp: 'streetlight_id',
  where: 'location',
  issue: 'issue_description',
  priority: 'priority',
  status: 'status',
  technicianId: 'assigned_technician_id',
  legacyTechnician: 'legacy_technician_name',
  reportedAt: 'reported_at',
  firstResponseAt: 'first_response_at',
  resolvedAt: 'resolved_at',
  resolution: 'resolution',
  archivedAt: 'archived_at',
  archivedBy: 'archived_by',
};
const DATE_FIELDS = new Set(['reportedAt', 'firstResponseAt', 'resolvedAt', 'archivedAt']);
const toDb = (key, v) => (DATE_FIELDS.has(key) && v !== null && v !== undefined ? new Date(v) : v);

const ticketsRepo = (q) => ({
  async list({ archived = false, technicianId = null } = {}) {
    const r = await q.query(
      `${TICKET_SELECT}
        WHERE ${archived ? 't.archived_at IS NOT NULL' : 't.archived_at IS NULL'} AND ($1::bigint IS NULL OR t.assigned_technician_id = $1::bigint)
        ORDER BY ${archived ? 't.archived_at' : 't.updated_at'} DESC, t.id DESC`,
      [technicianId]
    );
    return r.rows.map(mapTicket);
  },
  // Light rows for the summary cards: every ticket, archived or not, so archiving never changes the statistics.
  async summaryRows({ technicianId = null } = {}) {
    const r = await q.query(
      `SELECT status, reported_at, first_response_at, resolved_at FROM maintenance_tickets
        WHERE ($1::bigint IS NULL OR assigned_technician_id = $1::bigint)`,
      [technicianId]
    );
    return r.rows.map((x) => ({ status: x.status, createdAt: ms(x.reported_at), firstResponseAt: ms(x.first_response_at), resolvedAt: ms(x.resolved_at) }));
  },
  async findById(id, { forUpdate = false } = {}) {
    const r = await q.query(`${TICKET_SELECT} WHERE t.id = $1 ${forUpdate ? 'FOR UPDATE OF t' : ''}`, [id]);
    return mapTicket(r.rows[0]) || null;
  },
  async findByNumber(number) {
    const r = await q.query(`${TICKET_SELECT} WHERE t.ticket_number = $1`, [number]);
    return mapTicket(r.rows[0]) || null;
  },
  async create(t) {
    const r = await q.query(
      `INSERT INTO maintenance_tickets (streetlight_id, location, issue_description, priority, assigned_technician_id, status, reported_at, first_response_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [t.lamp, t.where, t.issue, t.priority, t.technicianId, t.status, new Date(t.reportedAt), t.firstResponseAt ? new Date(t.firstResponseAt) : null, t.createdBy]
    );
    return str(r.rows[0].id);
  },
  // Used by the one-time import: keeps the original ticket number and timestamps. Returns the new id, or null if the number already exists.
  async insertImported(t) {
    const r = await q.query(
      `INSERT INTO maintenance_tickets (ticket_number, streetlight_id, location, issue_description, priority, legacy_technician_name, status, reported_at, first_response_at, resolved_at, resolution, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (ticket_number) DO NOTHING RETURNING id`,
      [t.number, t.lamp, t.where, t.issue, t.priority, t.legacyTechnician, t.status, new Date(t.reportedAt), t.firstResponseAt ? new Date(t.firstResponseAt) : null, t.resolvedAt ? new Date(t.resolvedAt) : null, t.resolution || '', t.createdBy, new Date(t.createdAt), new Date(t.updatedAt)]
    );
    return r.rows[0] ? str(r.rows[0].id) : null;
  },
  async update(id, patch) {
    const sets = [];
    const vals = [];
    for (const [key, col] of Object.entries(TICKET_FIELDS)) {
      if (patch[key] !== undefined) {
        vals.push(toDb(key, patch[key]));
        sets.push(`${col} = $${vals.length}`);
      }
    }
    sets.push('version = version + 1');
    vals.push(id);
    await q.query(`UPDATE maintenance_tickets SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  },
  // After an import, make the MT-#### counter continue after the highest imported number.
  async bumpNumberSequence() {
    await q.query(
      `SELECT setval('maintenance_ticket_seq', GREATEST(
         (SELECT COALESCE(MAX(substring(ticket_number from 4)::bigint), 1000) FROM maintenance_tickets WHERE ticket_number ~ '^MT-[0-9]+$'),
         (SELECT CASE WHEN is_called THEN last_value ELSE 1000 END FROM maintenance_ticket_seq),
         1000))`
    );
  },
  async addHistory({ ticketId, action, previous = null, next = null, performedBy = null, at = null }) {
    await q.query('INSERT INTO maintenance_history (ticket_id, action, previous_value, new_value, performed_by, created_at) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))', [
      ticketId,
      action,
      previous,
      next,
      performedBy,
      at ? new Date(at).toISOString() : null,
    ]);
  },
  async historyFor(ticketIds) {
    if (ticketIds.length === 0) return [];
    const r = await q.query(
      `SELECT h.ticket_id, h.action, h.previous_value, h.new_value, h.performed_by, h.created_at, u.full_name AS performed_by_name
         FROM maintenance_history h LEFT JOIN users u ON u.id = h.performed_by
        WHERE h.ticket_id = ANY($1::bigint[]) ORDER BY h.created_at, h.id`,
      [ticketIds]
    );
    return r.rows.map((x) => ({ ticketId: str(x.ticket_id), action: x.action, previous: x.previous_value, next: x.new_value, performedBy: str(x.performed_by), by: x.performed_by_name || null, at: ms(x.created_at) }));
  },
});


// ---- streetlight history (append-only) and the lighting schedule ----
const EVENT_SELECT = `
  SELECT e.id, e.streetlight_id, e.occurred_at, e.event_type, e.previous_status, e.new_status, e.raw_status, e.lux, e.description, e.source,
         e.ticket_id, e.actor_id, t.ticket_number, u.full_name AS actor_name
    FROM streetlight_events e
    LEFT JOIN maintenance_tickets t ON t.id = e.ticket_id
    LEFT JOIN users u ON u.id = e.actor_id`;

export const mapEvent = (r) =>
  r && {
    id: str(r.id),
    lamp: r.streetlight_id,
    at: ms(r.occurred_at),
    type: r.event_type,
    previous: r.previous_status,
    next: r.new_status,
    rawStatus: r.raw_status,
    lux: r.lux === null || r.lux === undefined ? null : Number(r.lux),
    description: r.description,
    source: r.source,
    ticketId: str(r.ticket_id),
    ticketNumber: r.ticket_number || null,
    actorId: str(r.actor_id),
    actorName: r.actor_name || null,
  };

const eventsRepo = (q) => ({
  async add(e) {
    const r = await q.query(
      `INSERT INTO streetlight_events (streetlight_id, occurred_at, event_type, previous_status, new_status, raw_status, lux, description, source, ticket_id, actor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [e.streetlightId ?? null, new Date(e.occurredAt), e.type, e.previous ?? null, e.next, e.rawStatus ?? null, e.lux ?? null, e.description, e.source, e.ticketId ?? null, e.actorId ?? null]
    );
    return str(r.rows[0].id);
  },
  // Newest first. `before` = { at, id } continues after the last row of the previous page.
  async list({ lamp = null, type = null, ticketId = null, limit = 50, before = null } = {}) {
    const r = await q.query(
      `${EVENT_SELECT}
        WHERE ($1::text IS NULL OR e.streetlight_id = $1 OR e.streetlight_id IS NULL)
          AND ($2::text IS NULL OR e.event_type = $2)
          AND ($3::bigint IS NULL OR e.ticket_id = $3::bigint)
          AND ($4::timestamptz IS NULL OR (e.occurred_at, e.id) < ($4::timestamptz, $5::bigint))
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT $6`,
      [lamp, type, ticketId, before ? new Date(before.at) : null, before ? before.id : null, limit]
    );
    return r.rows.map(mapEvent);
  },
  // The last recorded condition of every lamp, so a server restart does not record the same condition again.
  async lastStatuses() {
    const r = await q.query(
      `SELECT DISTINCT ON (streetlight_id) streetlight_id, new_status FROM streetlight_events
        WHERE event_type = 'STATUS_CHANGE' AND streetlight_id IS NOT NULL
        ORDER BY streetlight_id, occurred_at DESC, id DESC`
    );
    return Object.fromEntries(r.rows.map((x) => [x.streetlight_id, x.new_status]));
  },
  async count() {
    const r = await q.query('SELECT count(*)::int AS n FROM streetlight_events');
    return r.rows[0].n;
  },
});

const mapSchedule = (r) => r && { onTime: r.on_time, offTime: r.off_time, updatedAt: ms(r.updated_at), updatedBy: str(r.updated_by) };
const scheduleRepo = (q) => ({
  async get({ forUpdate = false } = {}) {
    const r = await q.query(`SELECT on_time, off_time, updated_at, updated_by FROM lighting_schedule WHERE id = 1 ${forUpdate ? 'FOR UPDATE' : ''}`);
    return mapSchedule(r.rows[0]) || null;
  },
  async set({ onTime, offTime, updatedBy }) {
    const r = await q.query('UPDATE lighting_schedule SET on_time = $1, off_time = $2, updated_by = $3 WHERE id = 1 RETURNING on_time, off_time, updated_at, updated_by', [onTime, offTime, updatedBy ?? null]);
    return mapSchedule(r.rows[0]);
  },
});


// ---- developer registration keys (Phase 5 Step 4) ----
// Only the SHA-256 hash of a key is stored. Nothing here ever returns a hash or a key.
const INVITE_SELECT = `
  SELECT i.id, i.label, i.created_at, i.expires_at, i.used_at, i.revoked_at,
         cu.full_name AS created_by_name, uu.full_name AS used_by_name, uu.username AS used_by_username, ru.full_name AS revoked_by_name
    FROM developer_invites i
    LEFT JOIN users cu ON cu.id = i.created_by
    LEFT JOIN users uu ON uu.id = i.used_by
    LEFT JOIN users ru ON ru.id = i.revoked_by`;
export const mapInvite = (r, nowMs = Date.now()) =>
  r && {
    id: str(r.id),
    label: r.label,
    createdAt: ms(r.created_at),
    createdByName: r.created_by_name || null,
    expiresAt: ms(r.expires_at),
    usedAt: ms(r.used_at),
    usedByName: r.used_by_name || null,
    usedByUsername: r.used_by_username || null,
    revokedAt: ms(r.revoked_at),
    revokedByName: r.revoked_by_name || null,
    status: r.used_at ? 'USED' : r.revoked_at ? 'REVOKED' : ms(r.expires_at) <= nowMs ? 'EXPIRED' : 'ACTIVE',
  };

const invitesRepo = (q) => ({
  async create({ keyHash, label, createdBy, expiresAt }) {
    const r = await q.query('INSERT INTO developer_invites (key_hash, label, created_by, expires_at) VALUES ($1, $2, $3, $4) RETURNING id', [keyHash, label, createdBy, new Date(expiresAt)]);
    return invitesRepo(q).findById(str(r.rows[0].id));
  },
  async findById(id) {
    const r = await q.query(`${INVITE_SELECT} WHERE i.id = $1`, [id]);
    return mapInvite(r.rows[0]) || null;
  },
  async list() {
    const r = await q.query(`${INVITE_SELECT} ORDER BY i.created_at DESC, i.id DESC LIMIT 200`);
    return r.rows.map((x) => mapInvite(x));
  },
  // One atomic statement: it succeeds for exactly ONE caller, and only while the key is unused, not revoked and not expired.
  // Returns the invite id, or null. Two people submitting the same key at the same moment cannot both win.
  async consume(keyHash) {
    const r = await q.query('UPDATE developer_invites SET used_at = now() WHERE key_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING id', [keyHash]);
    return r.rows[0] ? str(r.rows[0].id) : null;
  },
  async setUsedBy(id, userId) {
    await q.query('UPDATE developer_invites SET used_by = $1 WHERE id = $2', [userId, id]);
  },
  // Revokes only a key that is still unused and not already revoked. Returns true when something changed.
  async revoke(id, revokedBy) {
    const r = await q.query('UPDATE developer_invites SET revoked_at = now(), revoked_by = $2 WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL', [id, revokedBy]);
    return r.rowCount > 0;
  },
});

export const createRepos = (db) => {
  const build = (q) => ({ users: usersRepo(q), sessions: sessionsRepo(q), tickets: ticketsRepo(q), events: eventsRepo(q), schedule: scheduleRepo(q), invites: invitesRepo(q) });
  const repos = build(db);
  repos.tx = (fn) => db.tx((client) => fn(build(client)));
  return repos;
};

// Anything that is not one of our own errors and looks like "the database is unreachable" becomes a 503.
export const translateDbError = (e) => {
  if (e instanceof HttpError) return e;
  const code = String(e?.code || '');
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '57P01', '57P03'].includes(code) || code.startsWith('08')) {
    return new HttpError(503, 'database_unavailable', 'The database is not reachable right now. Try again in a moment.');
  }
  return null;
};
