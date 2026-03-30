/**
 * @osai/shared -- Migration Runner (T-005)
 *
 * Simple migration framework for osaI SQLite schema.
 * Uses _schema_version table to track applied migrations.
 * Migrations are idempotent: re-running is safe.
 *
 * All migrations use CREATE TABLE IF NOT EXISTS and
 * CREATE INDEX IF NOT EXISTS for safety.
 */

import type Database from 'better-sqlite3';
import {
  MIGRATION_001_CREATE_CORE_TABLES,
  MIGRATION_VERSION_001,
} from './schema.js';

/** Migration definition */
interface Migration {
  version: number;
  description: string;
  sql: string;
}

/** All registered migrations in order */
const MIGRATIONS: readonly Migration[] = [
  {
    version: MIGRATION_VERSION_001,
    description: 'Create core tables: chats, chat_messages, sessions, osai_audit_log',
    sql: MIGRATION_001_CREATE_CORE_TABLES,
  },
] as const;

/**
 * Ensure the _schema_version tracking table exists.
 */
function ensureVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      version      INTEGER NOT NULL,
      description  TEXT NOT NULL,
      applied_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (version)
    )
  `);
}

/**
 * Get the set of already-applied migration versions.
 */
function getAppliedVersions(db: Database.Database): Set<number> {
  const rows = db
    .prepare('SELECT version FROM _schema_version')
    .all() as { version: number }[];

  return new Set(rows.map((r) => r.version));
}

/**
 * Record a migration as applied.
 *
 * Uses parameterized query (TT-005-08).
 */
function recordMigration(
  db: Database.Database,
  version: number,
  description: string
): void {
  db.prepare(
    'INSERT OR IGNORE INTO _schema_version (version, description) VALUES (?, ?)'
  ).run(version, description);
}

/**
 * Run all pending migrations against the database.
 *
 * This function is idempotent: already-applied migrations
 * are skipped based on the _schema_version table.
 *
 * @param db - Active better-sqlite3 database connection
 */
export function runMigrations(db: Database.Database): void {
  ensureVersionTable(db);

  const applied = getAppliedVersions(db);

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }

    db.exec(migration.sql);
    recordMigration(db, migration.version, migration.description);
  }
}

/**
 * Get the current schema version from the database.
 *
 * @param db - Active database connection
 * @returns Current version number, or 0 if no migrations applied
 */
export function getCurrentVersion(db: Database.Database): number {
  ensureVersionTable(db);

  const row = db
    .prepare('SELECT MAX(version) as v FROM _schema_version')
    .get() as { v: number | null };

  return row?.v ?? 0;
}
