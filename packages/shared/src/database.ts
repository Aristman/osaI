/**
 * @osai/shared -- DatabaseManager (T-005)
 *
 * Singleton database manager for osaI SQLite backend.
 * Initializes better-sqlite3 with WAL mode and required PRAGMAs.
 *
 * Constraints:
 *   - Single DB instance per process (AD-008)
 *   - WAL mode required (AD-007)
 *   - Foreign keys enabled
 *   - Parameterized queries only (TT-005-08)
 */

import type Database from 'better-sqlite3';

export interface DatabaseManagerOptions {
  /** Path to the SQLite database file */
  dbPath: string;
  /** Busy timeout in milliseconds (default: 5000) */
  busyTimeout?: number;
}

export class DatabaseManager {
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly busyTimeout: number;

  constructor(options: DatabaseManagerOptions) {
    this.dbPath = options.dbPath;
    this.busyTimeout = options.busyTimeout ?? 5000;
  }

  /**
   * Initialize the database connection with required PRAGMAs.
   *
   * This method is idempotent: calling it multiple times
   * does not recreate the connection.
   */
  initialize(): void {
    if (this.db !== null) {
      return;
    }

    // better-sqlite3 is synchronous by design -- this is intentional
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DatabaseConstructor = require('better-sqlite3') as typeof import('better-sqlite3');
    this.db = new DatabaseConstructor(this.dbPath);

    // Configure PRAGMAs
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma(`busy_timeout = ${this.busyTimeout}`);
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -8000'); // 8MB cache
  }

  /**
   * Get the underlying database connection.
   *
   * @throws {Error} if database has not been initialized
   */
  getDb(): Database.Database {
    if (this.db === null) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Close the database connection.
   *
   * After calling close(), getDb() will throw until initialize() is called again.
   */
  close(): void {
    if (this.db !== null) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get the database file path.
   */
  getDbPath(): string {
    return this.dbPath;
  }
}

/**
 * Create a DatabaseManager with the default osaI database path.
 *
 * @param customPath - Optional custom path to the database file
 * @returns Configured DatabaseManager instance
 */
export function createDatabaseManager(customPath?: string): DatabaseManager {
  const dbPath = customPath ?? getDefaultDbPath();
  return new DatabaseManager({ dbPath });
}

/**
 * Get the default database path: ~/.osai/data/osai.db
 */
export function getDefaultDbPath(): string {
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  return path.join(os.homedir(), '.osai', 'data', 'osai.db');
}
