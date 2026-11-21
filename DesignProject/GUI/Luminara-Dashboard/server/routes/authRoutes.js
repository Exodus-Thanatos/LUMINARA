// server/routes/authRoutes.js
import { query } from '../db.js';
import { verifyCredentials, createSession, destroySession, getSessionUser } from '../auth.js';

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { if (raw.length < 4096) raw += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

export async function handleAuthRoutes(req, res, url) {
  // POST /api/auth/login
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 400, { ok: false, code: 'invalid_json', error: 'Invalid JSON.' }); }
    const { username, password } = body || {};
    if (!username || !password) return json(res, 400, { ok: false, code: 'missing_fields', error: 'Username and password are required.' });
    const user = await verifyCredentials(String(username), String(password));
    if (!user) return json(res, 401, { ok: false, code: 'bad_credentials', error: 'Incorrect username or password.' });
    if (user.account_status !== 'ACTIVE') return json(res, 403, { ok: false, code: 'account_inactive', error: 'Your account has been deactivated. Contact your administrator.' });
    await createSession(res, user.id);
    return json(res, 200, { ok: true, user: { id: user.id, full_name: user.full_name, username: user.username, email: user.email, role: user.role } });
  }

  // POST /api/auth/logout
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    await destroySession(req, res);
    return json(res, 200, { ok: true });
  }

  // GET /api/auth/me
  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = await getSessionUser(req);
    if (!user) return json(res, 401, { ok: false, code: 'unauthenticated' });
    return json(res, 200, { ok: true, user: { id: user.id, full_name: user.full_name, username: user.username, email: user.email, role: user.role } });
  }

  return false; // not handled
}
