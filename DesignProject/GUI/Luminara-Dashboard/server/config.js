// Settings for the database, sessions and cookies. Everything comes from environment variables
// (see .env.example). Nothing secret has a default.
const int = (name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const bool = (name, fallback) => {
  const raw = (process.env[name] || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
};

export const readConfig = () => {
  const production = process.env.NODE_ENV === 'production';
  return {
    production,
    // A connection string wins; otherwise the usual PG* variables are used by the pg driver itself.
    databaseUrl: process.env.DATABASE_URL || '',
    hasDatabaseSettings: !!(process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER)),
    dbSsl: bool('DATABASE_SSL', false),
    dbPoolMax: int('DATABASE_POOL_MAX', 10, { max: 100 }),
    sessionTtlHours: int('SESSION_TTL_HOURS', 12, { max: 24 * 30 }),
    // Secure cookies need HTTPS. localhost counts as secure in Chrome/Firefox, but a plain-http LAN address does not.
    cookieSecure: bool('COOKIE_SECURE', production),
    cookieName: process.env.SESSION_COOKIE_NAME || 'luminara_session',
    bcryptRounds: int('BCRYPT_ROUNDS', 12, { min: 10, max: 15 }),
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    loginMaxFailures: int('LOGIN_MAX_FAILURES', 5, { max: 100 }),
    loginWindowMinutes: int('LOGIN_WINDOW_MINUTES', 15, { max: 24 * 60 }),
  };
};
