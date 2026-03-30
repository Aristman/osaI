/**
 * @osai/memory -- Vector Storage barrel export
 */

export type { VectorStorage } from './vector-storage.js';
export { SqliteVecStorage } from './sqlite-vec-storage.js';
export { InMemoryVectorStorage, cosineSimilarity } from './in-memory-vector-storage.js';
export { createVectorStorage } from './factory.js';
export type { VectorStorageResult, CreateVectorStorageOptions } from './factory.js';
