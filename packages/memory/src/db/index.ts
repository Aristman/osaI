/**
 * @osai/memory -- DB module barrel export (T-005)
 */

export {
  MemoryRepository,
} from './memory-repository.js';
export type {
  MemoryEntry,
  StoreMemoryEntry,
  MemoryTier,
} from './memory-repository.js';

export {
  MEMORY_SCHEMA_SQL,
  MEMORY_MIGRATION_VERSION,
  MEMORY_TABLE_NAMES,
} from './schema.js';
