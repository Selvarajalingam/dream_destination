import { config } from 'dotenv';

config({ path: '.env', quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env before running integration tests.');
}
