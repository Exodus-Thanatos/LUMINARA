// Creates the FIRST administrator from environment variables. Run it once, on the server, from the command line:
//   npm run db:seed-admin
// There is no web page or API route for this, so nobody on the network can trigger it. It refuses to run if an
// administrator already exists, and it never prints the password. The new admin must choose a new password at first sign-in.
import { pathToFileURL } from 'node:url';
import { passwordProblems } from './password.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

export const seedAdmin = async ({ repos, hasher, env = process.env, log = console.log }) => {
  const fullName = String(env.INITIAL_ADMIN_FULL_NAME || '').trim().replace(/\s+/g, ' ');
  const username = String(env.INITIAL_ADMIN_USERNAME || '').trim();
  const email = String(env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = env.INITIAL_ADMIN_PASSWORD || '';

  if ((await repos.users.countAdmins()) > 0) {
    log('An administrator already exists. Nothing was changed. (Use the User Management page to add more users.)');
    return { created: false, reason: 'admin_exists' };
  }
  const problems = [];
  if (fullName.length < 2) problems.push('INITIAL_ADMIN_FULL_NAME is missing or too short.');
  if (!USERNAME_RE.test(username)) problems.push('INITIAL_ADMIN_USERNAME must be 3-32 letters, numbers, dots, dashes or underscores.');
  if (!EMAIL_RE.test(email)) problems.push('INITIAL_ADMIN_EMAIL is missing or not a valid email address.');
  if (!password) problems.push('INITIAL_ADMIN_PASSWORD is missing.');
  else problems.push(...passwordProblems(password, { username, email }).map((p) => `INITIAL_ADMIN_PASSWORD: ${p}`));
  if (problems.length) {
    problems.forEach((p) => log(`  - ${p}`));
    return { created: false, reason: 'invalid', problems };
  }
  const user = await repos.users.create({
    fullName, username, email, passwordHash: await hasher.hash(password), role: 'ADMIN', accountStatus: 'ACTIVE', mustChangePassword: true, createdBy: null,
  });
  log(`Initial administrator "${user.username}" created. Sign in, then choose a new password when asked.`);
  log('Now delete INITIAL_ADMIN_PASSWORD from your .env file.');
  return { created: true, user };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { loadEnv } = await import('./loadEnv.js');
  const { createPool, wrapPool } = await import('./db.js');
  const { createRepos } = await import('./repos.js');
  const { createBcryptHasher } = await import('./password.js');
  const { readConfig } = await import('./config.js');
  loadEnv();
  let db;
  try {
    db = wrapPool(await createPool());
    const r = await seedAdmin({ repos: createRepos(db), hasher: createBcryptHasher({ rounds: readConfig().bcryptRounds }) });
    if (!r.created && r.reason === 'invalid') process.exitCode = 1;
  } catch (e) {
    console.error(`Could not create the administrator: ${e.message}`);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}
