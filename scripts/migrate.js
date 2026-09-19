import { readFile } from 'node:fs/promises';

import { Client, neonConfig } from '@neondatabase/serverless';

// The HTTP driver rejects multi-statement SQL, so the schema goes over a
// WebSocket connection instead. Node 22+ provides WebSocket globally.
if (!neonConfig.webSocketConstructor && typeof WebSocket !== 'undefined') {
  neonConfig.webSocketConstructor = WebSocket;
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — cannot run the migration.');
  process.exit(1);
}

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const client = new Client(process.env.DATABASE_URL);

try {
  await client.connect();
  await client.query(schema);
  console.log('Schema applied.');
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
