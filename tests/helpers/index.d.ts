/**
 * Test helpers barrel export.
 *
 * Re-exports filesystem and SQLite test utilities.
 * WS helpers must be imported directly from "./mock-ws.js"
 * to avoid pulling in the 'ws' dependency for tests that do not need it.
 *
 * @example
 * // FS helpers -- via barrel
 * import { createTempDir } from "../helpers/index.js";
 * // WS helpers -- direct import
 * import { createWsPair } from "../helpers/mock-ws.js";
 */
export { createTempDir, createTempFile, removeTempDir, cleanupTempDirs, createMockStructure, } from "./mock-fs.js";
export { createMockDb, applyOmaiCoreSchema } from "./mock-sqlite.js";
export type { MockSqliteOptions } from "./mock-sqlite.js";
//# sourceMappingURL=index.d.ts.map