import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example and fill in the Neon connection string.');
}

// Tagged-template calls on this client are parameterised, never interpolated.
export const sql = neon(process.env.DATABASE_URL);
