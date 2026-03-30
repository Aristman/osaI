export {
  ensureOsaiDir,
  initOsai,
  OSAI_SUBDIRS,
  // Re-exports from config for convenience
  createDefaultConfig,
  getOsaiDir,
  getConfigPath,
  DEFAULT_CONFIG,
} from "./init.js";

export {
  // Error class
  ConfigError,
  // Zod schema and type
  osaiConfigSchema,
  type OsaiConfig,
  type ConfigSection,
  // Config loading and caching
  loadConfig,
  validateConfig,
  getConfig,
  reloadConfig,
  resetConfigCache,
  // Section / provider accessors
  getProviderConfig,
  getConfigSection,
} from "./config.js";
