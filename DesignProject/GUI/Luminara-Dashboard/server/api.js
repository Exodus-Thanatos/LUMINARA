// HTTP layer for accounts, sessions, users and maintenance tickets, plus the session guard in front of the
// existing dashboard endpoints. `handle(req, res)` returns true when it answered the request itself, and false
// when the request should continue to the original receiver code in server.js (which this file never changes).
import { HttpError, sendJson, readJson, parseCookies, sessionCookie, clearCookie, originAllowed, clientIp, hashToken } from './http-util.js';
import { translateDbError } from './repos.js';
import { can } from './permissions.js';

// Open dashboard connections (the live SSE stream), so logout / deactivation / password reset can cut them off at once.
export const createStreamRegistry = () => {
  const set = new Set();
  return {
    add(entry) {
      set.add(entry);
      entry.res.once('close', () => set.delete(entry));
    },
    close({ tokenHash, userId, exceptTokenHash }) {
      for (const e of [...set]) {
        const hit = (tokenHash && e.tokenHash === tokenHash) || (userId && e.userId === String(userId) && e.tokenHash !== exceptTokenHash);
        if (hit) {
          set.delete(e);
          try { e.res.end(); } catch { /* already closed */ }
        }
      }
    },
    async sweep(isValid) {
      for (const e of [...set]) if (!(await isValid(e.tokenHash))) this.close({ tokenHash: e.tokenHash });
    },
    get size() { return set.size; },
  };
};

// Existing endpoints that need a signed-in user. Device endpoints (/api/telemetry, /api/pzem POST, /api/command) are NOT here:
// the ESP32 cannot sign in and keeps using its X-Api-Key exactly as before.
const GUARDED = [
  ['GET', '/api/lamps', 'dashboard.view'],
  ['GET', '/api/stream', 'dashboard.view'],
  ['GET', '/api/control', 'dashboard.view'],
  ['POST', '/api/control', 'controls.operate'],
  ['GET', '/api/sleep', 'dashboard.view'],
  ['POST', '/api/sleep', 'controls.operate'], // LoRa node sleep: AUTO / MANUAL / sleep now. /api/sleep/poll is the master's (device key)
  // The power (PZEM) readings are technical data: not part of the simplified BASIC dashboard.
  ['GET', '/api/pzem', 'technical.view'],
  ['GET', '/api/pzem/history', 'technical.view'],
];
const MUST_CHANGE_OK = new Set(['/api/auth/me', '/api/auth/logout', '/api/auth/change-password']);

export const createApi = ({ services, streams, config }) => {
  const cookieOpts = { secure: config.cookieSecure };

  const authOf = async (req) => {
    const token = parseCookies(req.headers.cookie)[config.cookieName];
    return token ? services.authenticate(token) : null;
  };

  const fail = (res, e) => {
    const err = translateDbError(e) || e;
    if (err instanceof HttpError) return sendJson(res, err.status, { ok: false, code: err.code, error: err.message, ...err.extra });
    console.error('API error:', e);
    return sendJson(res, 500, { ok: false, code: 'server_error', error: 'Something went wrong on the server.' });
  };

  const needAuth = (auth) => {
    if (!auth) throw new HttpError(401, 'unauthenticated', 'Please sign in.');
    return auth;
  };

  const routes = async (req, res, url, auth) => {
    const { pathname } = url;
    const m = req.method;
    let match;

    // ---- auth ----
    if (pathname === '/api/auth/login' && m === 'POST') {
      const b = await readJson(req);
      const r = await services.login(b.identifier, b.password, { ip: clientIp(req), userAgent: req.headers['user-agent'] });
      return sendJson(res, 200, { ok: true, user: r.user }, { 'Set-Cookie': sessionCookie(config.cookieName, r.token, { maxAgeSeconds: Math.floor(config.sessionTtlHours * 3600), ...cookieOpts }) });
    }
    if (pathname === '/api/auth/logout' && m === 'POST') {
      const token = parseCookies(req.headers.cookie)[config.cookieName];
      await services.logout(token);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(config.cookieName, cookieOpts) });
    }
    if (pathname === '/api/auth/me' && m === 'GET') {
      needAuth(auth);
      return sendJson(res, 200, { ok: true, user: auth.user });
    }
    if (pathname === '/api/auth/change-password' && m === 'POST') {
      needAuth(auth);
      const b = await readJson(req);
      const user = await services.changePassword(auth, b.currentPassword, b.newPassword);
      return sendJson(res, 200, { ok: true, user });
    }

    // Public: creates a DEVELOPER account, and only with a valid administrator-issued key. The role is never read from the request.
    if (pathname === '/api/auth/register-developer' && m === 'POST') {
      const r = await services.registerDeveloper(await readJson(req), { ip: clientIp(req) });
      return sendJson(res, 201, { ok: true, ...r });
    }

    // ---- developer registration keys (ADMIN) ----
    if (pathname === '/api/developer-invites' && m === 'GET') return sendJson(res, 200, { ok: true, invites: await services.listDeveloperInvites(needAuth(auth).user) });
    if (pathname === '/api/developer-invites' && m === 'POST') {
      const r = await services.createDeveloperInvite(needAuth(auth).user, await readJson(req)); // the only response that ever contains the key
      return sendJson(res, 201, { ok: true, ...r });
    }
    if ((match = /^\/api\/developer-invites\/(\d+)\/revoke$/.exec(pathname)) && m === 'POST') {
      return sendJson(res, 200, { ok: true, invite: await services.revokeDeveloperInvite(needAuth(auth).user, match[1]) });
    }

    // ---- users (ADMIN) ----
    if (pathname === '/api/users' && m === 'GET') return sendJson(res, 200, { ok: true, users: await services.listUsers(needAuth(auth).user) });
    if (pathname === '/api/users' && m === 'POST') {
      const r = await services.createUser(needAuth(auth).user, await readJson(req));
      return sendJson(res, 201, { ok: true, ...r });
    }
    if ((match = /^\/api\/users\/(\d+)$/.exec(pathname)) && m === 'PATCH') {
      return sendJson(res, 200, { ok: true, user: await services.updateUser(needAuth(auth).user, match[1], await readJson(req)) });
    }
    if ((match = /^\/api\/users\/(\d+)\/reset-password$/.exec(pathname)) && m === 'POST') {
      return sendJson(res, 200, { ok: true, ...(await services.resetPassword(needAuth(auth).user, match[1])) });
    }
    if (pathname === '/api/technicians' && m === 'GET') return sendJson(res, 200, { ok: true, technicians: await services.listTechnicians(needAuth(auth).user) });

    // ---- maintenance tickets ----
    if (pathname === '/api/tickets' && m === 'GET') {
      return sendJson(res, 200, { ok: true, ...(await services.listTickets(needAuth(auth).user, { archived: url.searchParams.get('archived') === '1' })) });
    }
    if (pathname === '/api/tickets' && m === 'POST') return sendJson(res, 201, { ok: true, ticket: await services.createTicket(needAuth(auth).user, await readJson(req)) });
    if (pathname === '/api/tickets/import' && m === 'POST') {
      return sendJson(res, 200, { ok: true, ...(await services.importTickets(needAuth(auth).user, await readJson(req, 1500000))) });
    }
    if ((match = /^\/api\/tickets\/(\d+)$/.exec(pathname)) && m === 'PATCH') {
      return sendJson(res, 200, { ok: true, ticket: await services.updateTicket(needAuth(auth).user, match[1], await readJson(req)) });
    }
    if ((match = /^\/api\/tickets\/(\d+)\/archive$/.exec(pathname)) && m === 'POST') {
      return sendJson(res, 200, { ok: true, ticket: await services.archiveTicket(needAuth(auth).user, match[1]) });
    }
    if ((match = /^\/api\/tickets\/(\d+)\/restore$/.exec(pathname)) && m === 'POST') {
      return sendJson(res, 200, { ok: true, ticket: await services.restoreTicket(needAuth(auth).user, match[1]) });
    }
    // ---- permanent streetlight history and the lighting schedule ----
    if (pathname === '/api/history' && m === 'GET') {
      const q = url.searchParams;
      return sendJson(res, 200, { ok: true, ...(await services.listHistory(needAuth(auth).user, { lamp: q.get('lamp'), type: q.get('type'), limit: q.get('limit'), beforeAt: q.get('beforeAt'), beforeId: q.get('beforeId') })) });
    }
    if (pathname === '/api/schedule' && m === 'GET') return sendJson(res, 200, { ok: true, ...(await services.getSchedule(needAuth(auth).user)) });
    if (pathname === '/api/schedule' && m === 'PUT') return sendJson(res, 200, { ok: true, ...(await services.updateSchedule(needAuth(auth).user, await readJson(req))) });
    // ---- read-only data viewer ----
    if (pathname === '/api/data/summary' && m === 'GET') return sendJson(res, 200, { ok: true, ...(await services.dataSummary(needAuth(auth).user)) });
    if (pathname === '/api/data/tickets' && m === 'GET') {
      const archived = ['1', 'true'].includes(url.searchParams.get('archived'));
      return sendJson(res, 200, { ok: true, ...(await services.listDataTickets(needAuth(auth).user, { archived })) });
    }
    return null; // not one of ours
  };

  return {
    streams,
    async handle(req, res) {
      let url;
      try {
        url = new URL(req.url, 'http://localhost');
      } catch {
        return false;
      }
      const { pathname } = url;
      const ours = /^\/api\/(auth|users|technicians|tickets|history|schedule|developer-invites|data)(\/|$)/.test(pathname);
      const guarded = GUARDED.find(([method, p]) => method === req.method && p === pathname);
      if (!ours && !guarded) return false;

      try {
        if (req.method !== 'GET' && req.method !== 'HEAD' && !originAllowed(req, config.allowedOrigins)) {
          throw new HttpError(403, 'bad_origin', 'This request did not come from the LUMINARA site.');
        }
        const auth = await authOf(req);
        if (auth?.user.mustChangePassword && !MUST_CHANGE_OK.has(pathname)) {
          throw new HttpError(403, 'password_change_required', 'You must choose a new password before continuing.');
        }
        if (guarded) {
          if (!auth) throw new HttpError(401, 'unauthenticated', 'Please sign in.');
          if (!can(auth.user.role, guarded[2])) throw new HttpError(403, 'forbidden', 'You do not have permission to do that.');
          if (pathname === '/api/stream') streams.add({ res, userId: auth.user.id, tokenHash: auth.tokenHash });
          return false; // allowed: continue to the original handler
        }
        const handled = await routes(req, res, url, auth);
        if (handled === null) {
          sendJson(res, 404, { ok: false, code: 'not_found', error: 'not found' });
        }
        return true;
      } catch (e) {
        fail(res, e);
        return true;
      }
    },
  };
};

export { hashToken };
