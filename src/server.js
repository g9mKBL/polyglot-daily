import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { getDefaultDbPath, openDatabase } from './db/connection.js';
import { initSchema } from './db/schema.js';
import { seedDemoData } from './db/seed.js';
import * as content from '../content/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const port = Number(process.env.PORT || 3000);
const host =
  process.env.HOST ||
  (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const dbPath = process.env.DB_PATH || getDefaultDbPath();

const db = openDatabase(dbPath);
initSchema(db);

if (process.env.AUTO_SEED !== 'false') {
  const { cnt } = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
  if (cnt === 0) {
    seedDemoData(db);
  }
}

const app = createApp({
  db,
  content,
  publicDir: path.join(PROJECT_ROOT, 'public')
});

const server = app.listen(port, host, () => {
  console.log(`Polyglot Daily listening on http://${host}:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
