// server/auth.js — session helpers for the bare http server
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

const SESSION_COOKIE = 'luminara_sid';
const MAX_AGE_MS = (Number(process.env.SESSION_MAX_AGE_HOURS) || 8) * 3600 * 1000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';

// Generate a cryptographically random session ID
export function generateSid() {
  return crypto.randomBytes(32).toString('hex');
}

// Parse cookies from a request
export function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k.trim(), decodeURIComponent(v.join('='))];
    }).filter(([k]) => k)
  );
}

// Set the session cookie on a response
export function setSessionCookie(res, sid) {
  const maxAge = Math.floor(MAX_AGE_MS / 1000);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${sid}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`);
}

// Clear the session cookie
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/`);
}

// Create a session in the DB and set the cookie
export async function createSession(res, userId) {
  const sid = generateSid();
  const expiresAt = new Date(Date.now() + MAX_AGE_MS);
  await query(
    'INSERT INTO sessions (sid, user_id, expires_at) VALUES ($1, $2, $3)',
    [sid, userId, expiresAt]
  );
  setSessionCookie(res, sid);
  return sid;
}

// Destroy a session
export async function destroySession(req, res) {
  const cookies = parseCookies(req);
  const sid = cookies[SESSION_COOKIE];
  if (sid) await query('DELETE FROM sessions WHERE sid = $1', [sid]);
  clearSessionCookie(res);
}

// Resolve the current user from request cookies. Returns user row or null.
export async function getSessionUser(req) {
  const cookies = parseCookies(req);
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return null;
  const r = await query(
    `SELECT u.id, u.full_name, u.username, u.email, u.role, u.account_status
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.sid = $1 AND s.expires_at > NOW()`,
    [sid]
  );
  if (!r.rows.length) return null;
  const user = r.rows[0];
  if (user.account_status !== 'ACTIVE') return null;
  // Slide expiry
  await query('UPDATE sessions SET expires_at = $1 WHERE sid = $2', [new Date(Date.now() + MAX_AGE_MS), sid]);
  return user;
}

// Middleware helper: resolves session and attaches user. Returns user or sends 401.
export async function requireAuth(req, res) {
  const user = await getSessionUser(req);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, code: 'unauthenticated', error: 'Sign in required.' }));
    return null;
  }
  return user;
}

// Returns the user if they have required role, else sends 403. Use after requireAuth.
export function checkRole(user, roles, res) {
  if (!roles.includes(user.role)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, code: 'forbidden', error: 'Insufficient permissions.' }));
    return false;
  }
  return true;
}

// Verify credentials. Returns user row or null.
export async function verifyCredentials(usernameOrEmail, password) {
  const r = await query(
    `SELECT id, full_name, username, email, password_hash, role, account_status
     FROM users WHERE (username = $1 OR email = $1) LIMIT 1`,
    [usernameOrEmail.trim().toLowerCase()]
  );
  if (!r.rows.length) return null;
  const user = r.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? user : null;
}

// Hash a password
export const hashPassword = (pw) => bcrypt.hash(pw, 12);

// Prune expired sessions (call on startup + interval)
export const pruneExpiredSessions = () => query('DELETE FROM sessions WHERE expires_at < NOW()');
