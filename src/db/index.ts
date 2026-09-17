import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './sqlite.db';
const sqlite = new Database(dbPath);

// Automatic schema initialization for SQLite tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS records_user_public_idx ON records(user_id, public_id);
  CREATE INDEX IF NOT EXISTS records_user_created_idx ON records(user_id, created_at);

  CREATE TABLE IF NOT EXISTS deletion_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    record_public_id TEXT NOT NULL,
    record_title TEXT NOT NULL,
    deleted_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL DEFAULT 'RECORD_DELETED',
    deleted_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS deletion_audits_user_deleted_idx ON deletion_audits(deleted_by_user_id, deleted_at);
`);

export { sqlite };
export const db = drizzle(sqlite, { schema });

