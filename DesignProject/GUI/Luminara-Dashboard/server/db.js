// One reusable PostgreSQL connection pool for the whole server.
// `pg` is imported lazily so the telemetry-only tests (which never touch the database) run without it.
import { readConfig } from './config.js';

export class DbConfigError extends Error {}

export const createPool = async (cfg = readConfig()) => {
  if (!cfg.hasDatabaseSettings) {
    throw new DbConfigError('No database settings found. Set DATABASE_URL (or PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) in .env — see .env.example.');
  }
  let pg;
  try {
    pg = (await import('pg')).default;
  } catch {
    throw new DbConfigError('The "pg" package is not installed. Run: npm install');
  }
  const pool = new pg.Pool({
    ...(cfg.databaseUrl ? { connectionString: cfg.databaseUrl } : {}),
    max: cfg.dbPoolMax,
    ssl: cfg.dbSsl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  // An idle client that errors (server restart, network drop) must not crash the process.
  pool.on('error', (err) => console.error('PostgreSQL pool error:', err.message));
  return pool;
};

// Small wrapper: db.query(text, params) and db.tx(fn). Always use $1, $2 … placeholders, never string concatenation.
export const wrapPool = (pool) => ({
  pool,
  query: (text, params = []) => pool.query(text, params),
  async tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({ query: (text, params = []) => client.query(text, params) });
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* connection already gone */
      }
      throw e;
    } finally {
      client.release();
    }
  },
  close: () => pool.end(),
});

// Check that the server can reach the database and that migrations were applied. Returns { ok, error }.
export const checkDatabase = async (db) => {
  try {
    await db.query('SELECT 1');
  } catch (e) {
    return { ok: false, error: `Cannot connect to PostgreSQL: ${e.message}` };
  }
  try {
    const r = await db.query("SELECT to_regclass('public.users') AS users, to_regclass('public.maintenance_tickets') AS tickets");
    if (!r.rows[0].users || !r.rows[0].tickets) return { ok: false, error: 'The database is reachable but the tables are missing. Run: npm run db:migrate' };
  } catch (e) {
    return { ok: false, error: `Database check failed: ${e.message}` };
  }
  return { ok: true };
};
