/**
 * @osai/shared -- Shared Types and Utilities
 *
 * Shared types, database singleton, configuration loader,
 * common utilities used across all osaI packages.
 */

// Database (T-005)
export {
  DatabaseManager,
  createDatabaseManager,
  getDefaultDbPath,
} from './database.js';
export type { DatabaseManagerOptions } from './database.js';

// Schema (T-005)
export {
  MIGRATION_001_CREATE_CORE_TABLES,
  MIGRATION_VERSION_001,
  CORE_TABLE_NAMES,
} from './schema.js';

// Migrations (T-005)
export { runMigrations, getCurrentVersion } from './migrations.js';
