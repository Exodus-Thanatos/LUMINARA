// Imported FIRST by server.js so that values in .env exist before server.js reads PORT / DEVICE_KEY.
// Only when started as `node server/server.js` — the test runner importing server.js never reads a developer's .env.
import { loadEnv } from './loadEnv.js';

if (/server[\\/]server\.js$/.test(process.argv[1] || '')) loadEnv();
