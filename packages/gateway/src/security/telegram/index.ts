/**
 * Telegram Security -- Barrel Exports
 * Task T-006, Feature F-012, Domain DOMAIN-006
 */

// Types
export {
  type TelegramSecurityConfig,
  type AllowedUsersList,
  type AccessResult,
  type RateLimiterConfig,
  type RateLimitResult,
  type SessionEncryptionConfig,
  SessionEncryptionError,
  RateLimitExceededError,
} from './types.js';

// TelegramSecurity -- Whitelist-based access control
export { TelegramSecurity, DEFAULT_TELEGRAM_SECURITY_CONFIG } from './TelegramSecurity.js';

// SessionEncryption -- AES-256-GCM for userbot session files
export { SessionEncryption } from './SessionEncryption.js';

// RateLimiter -- Sliding window rate limiter
export { RateLimiter, DEFAULT_RATE_LIMITER_CONFIG } from './RateLimiter.js';
