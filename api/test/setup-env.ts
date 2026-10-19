// Runs before every test file. Points the app at the TEST database so tests
// can wipe data freely. ConfigModule won't override a variable that is already
// set, so setting DATABASE_URL here wins over the value in .env.
import { config } from 'dotenv';

config();

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is not set. Copy api/.env.example to api/.env.');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.POSTBACK_SECRET = process.env.POSTBACK_SECRET || 'test-secret';

// Tests must never reach a real (paid) model, even if the developer's .env has a key.
// Specs that need a model plug in a fake classifier instead.
process.env.LLM_API_KEY = '';
