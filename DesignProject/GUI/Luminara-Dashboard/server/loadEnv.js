// Loads ./.env into process.env when the file exists (Node 20.12+/21.7+ has this built in, so no dotenv package).
// Variables that are already set in the real environment always win over the file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const loadEnv = () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return false;
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(file); // does not overwrite variables that are already set
      return true;
    } catch (e) {
      console.error(`Could not read ${file}: ${e.message}`);
      return false;
    }
  }
  console.error('This Node version cannot read .env files by itself. Use Node 20.12+ or start with: node --env-file=.env server/server.js');
  return false;
};
