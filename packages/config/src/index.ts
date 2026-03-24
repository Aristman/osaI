/**
 * @osai/config -- Configuration System for osaI monorepo
 *
 * Provides configuration loading, validation, initialization, and hot-reload.
 * F-003: Configuration System
 */

// Schema (T-001)
export {
  configSchema,
  DEFAULT_CONFIG,
  CONFIG_SCHEMA_VERSION,
  validateConfig,
  applyDefaults,
  isGatewayConfig,
  isModelConfig,
  isSessionConfig,
  isSkillsConfig,
  isSecurityConfig,
  isMemoryConfig,
  isObservabilityConfig,
  isOsaIConfig,
} from './schema.js';
export type {
  ValidationError,
  ValidationResult,
} from './schema.js';

// Re-export types from @osai/types
export type {
  OsaIConfig,
  GatewayConfig,
  ModelConfig,
  SessionConfig,
  SkillsConfig,
  SkillsEntry,
  SecurityConfig,
  SecurityShellConfig,
  MemoryConfig,
  MemoryShortTermConfig,
  MemoryLongTermConfig,
  MemoryEmbeddingConfig,
  ObservabilityConfig,
  ObservabilityTracesConfig,
  ObservabilityMetricsConfig,
  ObservabilityLogsConfig,
  ObservabilityAuditConfig,
} from './schema.js';

// Errors (T-002)
export {
  ConfigError,
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  ConfigPermissionWarning,
} from './errors.js';

// Loader (T-002)
export {
  getOsaiDirectory,
  getConfigPath,
  readConfigFile,
  parseConfig,
  checkPermissions,
  validateAndNormalize,
  loadConfigSync,
  loadConfig,
  getCachedConfig,
  invalidateCache,
  getConfig,
  resetLoaderState,
} from './loader.js';
export type { LoadConfigOptions } from './loader.js';

// Init (T-003)
export {
  ensureDirectory,
  ensureFile,
  initializeOsaiDirectory,
  initializeOsaiDirectorySync,
  isOsaiDirectoryInitialized,
  getExpectedPaths,
} from './init.js';
export type { InitOptions } from './init.js';

// Hot-Reload (T-004)
export {
  ConfigWatcher,
  computeDiff,
  debounce,
} from './hot-reload.js';
export type {
  ConfigChangeEvent,
  ConfigDiff,
  ConfigChangeCallback,
  ConfigErrorCallback,
  Unsubscribe,
  ConfigWatcherOptions,
} from './hot-reload.js';
