/**
 * @osai/gateway -- Security Module barrel export (DOMAIN-001, T-005/T-006)
 *
 * Exports all security-related modules from gateway:
 *   - Docker Sandbox (T-005): SandboxManager, DockerSandbox, SandboxMode
 *   - Telegram Security (T-006): TelegramSecurity, SessionEncryption, RateLimiter
 */

// Docker Sandbox (Layer 2)
export {
  SandboxMode,
  DockerSandbox,
  SandboxManager,
  DEFAULT_DOCKER_CONFIG,
} from './sandbox/index.js';

export type {
  SandboxExecResult,
  SandboxManagerState,
  DockerConfig,
  DockerConstraints,
  DockerInfo,
  ContainerState,
} from './sandbox/types.js';

// Telegram Security (Layer 6)
export {
  TelegramSecurity,
  SessionEncryption,
  RateLimiter,
  DEFAULT_TELEGRAM_SECURITY_CONFIG,
  DEFAULT_RATE_LIMITER_CONFIG,
  SessionEncryptionError,
  RateLimitExceededError,
} from './telegram/index.js';

export type {
  TelegramSecurityConfig,
  AllowedUsersList,
  AccessResult,
  RateLimiterConfig,
  RateLimitResult,
  SessionEncryptionConfig,
} from './telegram/types.js';
