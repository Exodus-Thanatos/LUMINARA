// server/routes/userRoutes.js
import { query } from '../db.js';
import { requireAuth, checkRole, hashPassword } from '../auth.js';

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { if (raw.length < 8192) raw += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = ['ADMIN', 'TECHNICIAN', 'STAFF'];

export async function handleUserRoutes(req, res, url) {
  if (!url.pathname.startsWith('/api/users')) return false;

  const user = await requireAuth(req, res);
  if (!user) return true;

  // --- GET /api/users ---
  if (req.method === 'GET' && url.pathname === '/api/users') {
    if (!checkRole(user, ['ADMIN'], res)) return true;
    const r = await query(
      `SELECT id, full_name, username, email, role, account_status, created_at,
              (SELECT full_name FROM users cb WHERE cb.id = u.created_by) AS created_by_name
       FROM users u ORDER BY created_at ASC`,
      []
    );
    return json(res, 200, { ok: true, users: r.rows });
  }

  // --- POST /api/users (create) ---
  if (req.method === 'POST' && url.pathname === '/api/users') {
    if (!checkRole(user, ['ADMIN'], res)) return true;
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { ok: false, code: 'invalid_json', error: 'Invalid JSON.' }); }
    const { full_name, username, email, password, role, account_status } = body || {};
    const errors = {};
    if (!full_name || full_name.trim().length < 2) errors.full_name = 'Full name is required (min 2 chars).';
    if (!username || username.trim().length < 3) errors.username = 'Username is required (min 3 chars).';
    if (!EMAIL_RE.test((email || '').trim())) errors.email = 'Valid email is required.';
    if (!password || password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (!VALID_ROLES.includes(role)) errors.role = 'Role must be ADMIN, TECHNICIAN, or STAFF.';
    if (Object.keys(errors).length) return json(res, 400, { ok: false, code: 'validation', errors });
    const hash = await hashPassword(password);
    try {
      const r = await query(
        `INSERT INTO users (full_name, username, email, password_hash, role, account_status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, full_name, username, email, role, account_status, created_at`,
        [full_name.trim(), username.trim().toLowerCase(), email.trim().toLowerCase(), hash,
         role, account_status || 'ACTIVE', user.id]
      );
      return json(res, 201, { ok: true, user: r.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        const field = err.constraint?.includes('username') ? 'username' : 'email';
        return json(res, 409, { ok: false, code: 'duplicate', errors: { [field]: `This ${field} is already in use.` } });
      }
      throw err;
    }
  }

  // Match /api/users/:id
  const idMatch = url.pathname.match(/^\/api\/users\/(\d+)(\/.*)?$/);
  if (!idMatch) return false;
  const targetId = parseInt(idMatch[1], 10);
  const sub = idMatch[2] || '';

  // --- PUT /api/users/:id (update) ---
  if (req.method === 'PUT' && sub === '') {
    if (!checkRole(user, ['ADMIN'], res)) return true;
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { ok: false, code: 'invalid_json', error: 'Invalid JSON.' }); }
    const { full_name, username, email, role, account_status } = body || {};
    // Safety: prevent the last active admin from being demoted or deactivated
    if (targetId === user.id && (role !== 'ADMIN' || account_status === 'INACTIVE')) {
      const r = await query(`SELECT COUNT(*) AS c FROM users WHERE role='ADMIN' AND account_status='ACTIVE'`);
      if (r.rows[0].c <= 1) {
        return json(res, 400, { ok: false, code: 'last_admin', error: 'Cannot remove the last active administrator.' });
      }
    }
    const errors = {};
    if (full_name !== undefined && full_name.trim().length < 2) errors.full_name = 'Full name min 2 chars.';
    if (username !== undefined && username.trim().length < 3) errors.username = 'Username min 3 chars.';
    if (email !== undefined && !EMAIL_RE.test(email.trim())) errors.email = 'Valid email required.';
    if (role !== undefined && !VALID_ROLES.includes(role)) errors.role = 'Invalid role.';
    if (Object.keys(errors).length) return json(res, 400, { ok: false, code: 'validation', errors });
    try {
      const r = await query(
        `UPDATE users SET
           full_name = COALESCE($1, full_name),
           username = COALESCE($2, username),
           email = COALESCE($3, email),
           role = COALESCE($4, role),
           account_status = COALESCE($5, account_status),
           updated_at = NOW()
         WHERE id = $6
         RETURNING id, full_name, username, email, role, account_status, updated_at`,
        [full_name?.trim() || null, username?.trim().toLowerCase() || null,
         email?.trim().toLowerCase() || null, role || null, account_status || null, targetId]
      );
      if (!r.rows.length) return json(res, 404, { ok: false, error: 'User not found.' });
      return json(res, 200, { ok: true, user: r.rows[0] });
    } catch (err) {
      if (err.code === '23505') return json(res, 409, { ok: false, code: 'duplicate', error: 'Username or email already in use.' });
      throw err;
    }
  }

  // --- PATCH /api/users/:id/status ---
  if (req.method === 'PATCH' && sub === '/status') {
    if (!checkRole(user, ['ADMIN'], res)) return true;
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { ok: false, code: 'invalid_json' }); }
    const { account_status } = body || {};
    if (!['ACTIVE','INACTIVE'].includes(account_status)) return json(res, 400, { ok: false, error: 'account_status must be ACTIVE or INACTIVE.' });
    if (targetId === user.id && account_status === 'INACTIVE') {
      const r = await query(`SELECT COUNT(*) AS c FROM users WHERE role='ADMIN' AND account_status='ACTIVE'`);
      if (r.rows[0].c <= 1) return json(res, 400, { ok: false, code: 'last_admin', error: 'Cannot deactivate the last active administrator.' });
    }
    const r = await query(`UPDATE users SET account_status=$1, updated_at=NOW() WHERE id=$2 RETURNING id, account_status`, [account_status, targetId]);
    if (!r.rows.length) return json(res, 404, { ok: false, error: 'User not found.' });
    return json(res, 200, { ok: true, user: r.rows[0] });
  }

  // --- POST /api/users/:id/reset-password ---
  if (req.method === 'POST' && sub === '/reset-password') {
    if (!checkRole(user, ['ADMIN'], res)) return true;
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { ok: false, code: 'invalid_json' }); }
    const { new_password } = body || {};
    if (!new_password || new_password.length < 8) return json(res, 400, { ok: false, error: 'Password must be at least 8 characters.' });
    const hash = await hashPassword(new_password);
    const r = await query(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2 RETURNING id`, [hash, targetId]);
    if (!r.rows.length) return json(res, 404, { ok: false, error: 'User not found.' });
    return json(res, 200, { ok: true, message: 'Password updated.' });
  }

  return false;
}
