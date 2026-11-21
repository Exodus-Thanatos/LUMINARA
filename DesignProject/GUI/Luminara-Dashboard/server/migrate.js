// Applies the .sql files in server/migrations/ in order, once each. Safe to run repeatedly.
//   npm run db:migrate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export const migrate = async (db, { log = () => {} } = {}) => {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied = [];
  for (const file of files) {
    const done = await db.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (done.rowCount > 0) {
      log(`  already applied: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.tx(async (t) => {
      await t.query(sql); // one transaction per file: a failure leaves the database as it was
      await t.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    });
    log(`  applied: ${file}`);
    applied.push(file);
  }
  return applied;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { loadEnv } = await import('./loadEnv.js');
  const { createPool, wrapPool } = await import('./db.js');
  loadEnv();
  let db;
  try {
    db = wrapPool(await createPool());
    console.log('Applying database migrations…');
    const applied = await migrate(db, { log: console.log });
    console.log(applied.length ? `Done. ${applied.length} migration(s) applied.` : 'Database is already up to date.');
  } catch (e) {
    console.error(`Migration failed: ${e.message}`);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}
