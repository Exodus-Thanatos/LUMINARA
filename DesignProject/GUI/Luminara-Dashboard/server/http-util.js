// Small HTTP helpers shared by the API router: JSON replies, body reading, cookies, origin check.
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const sendJson = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};

export const readJson = (req, limit = 20000) =>
  new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') return reject(new HttpError(415, 'unsupported_media_type', 'Send the request as application/json.'));
    let raw = '';
    let tooBig = false;
    req.on('data', (c) => {
      if (tooBig) return;
      raw += c;
      if (raw.length > limit) {
        tooBig = true;
        reject(new HttpError(413, 'too_large', 'Request body too large.'));
        req.resume();
      }
    });
    req.on('end', () => {
      if (tooBig) return undefined;
      if (raw === '') return resolve({});
      try {
        const v = JSON.parse(raw);
        if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(new HttpError(400, 'invalid_json', 'The request body must be a JSON object.'));
        return resolve(v);
      } catch {
        return reject(new HttpError(400, 'invalid_json', 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
    return undefined;
  });

export const parseCookies = (header = '') => {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
};

export const sessionCookie = (name, value, { maxAgeSeconds, secure }) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
export const clearCookie = (name, { secure }) => `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`;

// Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE. If it is present it must be this site (or a listed one).
export const originAllowed = (req, allowed = []) => {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin GETs and non-browser clients; the JSON content type + SameSite=Lax cookie cover the rest
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const own = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  return host.toLowerCase() === own || allowed.includes(origin);
};

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const clientIp = (req) => req.socket?.remoteAddress || '';
