// Runs automatically before `npm run test:e2e` (npm "pre" script).
// Rebuilds the TEST database from the migrations, so tests always start from
// the current schema. It never touches the main DATABASE_URL.
import { config } from 'dotenv';
import { execSync } from 'node:child_process';

config();

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error('TEST_DATABASE_URL is not set. Copy api/.env.example to api/.env.');
}
if (testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL: tests wipe their database.');
}

execSync('npx prisma migrate reset --force --skip-seed', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
});
