import { existsSync } from 'node:fs';

// Load .env for local runs. Imported before db.js, which reads the DB settings
// at import time. The container has no .env and gets its env from the task
// definition, so this is a no-op there.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
