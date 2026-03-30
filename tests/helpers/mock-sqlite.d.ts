/**
 * In-memory SQLite factory for test isolation.
 *
 * Provides a convenience wrapper around better-sqlite3
 * to create disposable in-memory databases for each test.
 */
import type Database from "better-sqlite3";
/**
 * Options for creating a mock SQLite database.
 */
export interface MockSqliteOptions {
    /** Whether to enable WAL mode (default: true) */
    wal?: boolean;
    /** Whether to enable foreign keys (default: true) */
    foreignKeys?: boolean;
    /** SQL statements to execute on initialization */
    initSql?: string[];
}
/**
 * Create an in-memory SQLite database for testing.
 *
 * The database is fully isolated -- no data persists between calls.
 * Use this factory in beforeEach hooks to get a fresh DB per test.
 *
 * @param options - Configuration options
 * @returns Database instance (caller is responsible for closing)
 *
 * @example
 * ```ts
 * import { createMockDb } from "../../tests/helpers/mock-sqlite.js";
 * import Database from "better-sqlite3";
 *
 * let db: Database.Database;
 *
 * beforeEach(() => {
 *   db = createMockDb({
 *     initSql: [
 *       `CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`,
 *     ],
 *   });
 * });
 *
 * afterEach(() => {
 *   db.close();
 * });
 * ```
 */
export declare function createMockDb(options?: MockSqliteOptions): Database.Database;
/**
 * Apply the osaI schema to a mock database.
 * This is a convenience function that runs the core schema DDL.
 *
 * @param db - Database instance to apply schema to
 */
export declare function applyOmaiCoreSchema(db: Database.Database): void;
//# sourceMappingURL=mock-sqlite.d.ts.map