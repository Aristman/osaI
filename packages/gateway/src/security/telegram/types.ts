/**
 * Telegram Security -- Types
 * Task T-006, Feature F-012, Domain DOMAIN-006
 */

/** Telegram security configuration */
export interface TelegramSecurityConfig {
  /** Bot allowedUsers whitelist (from osai.json channels.telegram.bot.allowedUsers) */
  allowedUsers: AllowedUsersList;
  /** Rate limiter configuration */
  rateLimiter: RateLimiterConfig;
  /** Session encryption configuration */
  sessionEncryption: SessionEncryptionConfig;
}

/** Allowed users list for Telegram bot whitelist */
export type AllowedUsersList = ReadonlyArray<string>;

/** Access check result */
export interface AccessResult {
  /** Whether access is granted */
  readonly allowed: boolean;
  /** Reason for denial (when allowed = false) */
  readonly reason?: string;
}

/** Rate limiter configuration */
export interface RateLimiterConfig {
  /** Maximum number of requests per window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/** Rate limiter check result */
export interface RateLimitResult {
  /** Whether the request is allowed */
  readonly allowed: boolean;
  /** Number of remaining requests in current window */
  readonly remaining: number;
  /** Timestamp (ms) until the rate limit resets, if blocked */
  readonly retryAfterMs?: number;
  /** Total requests in current window */
  readonly totalRequests: number;
}

/** Session encryption configuration */
export interface SessionEncryptionConfig {
  /** AES-256 key (32 bytes, hex-encoded) */
  encryptionKey: string;
  /** Session directory path (default: ~/.osai/channels/telegram/session/) */
  sessionDir: string;
}

/** Session encryption error */
export class SessionEncryptionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SessionEncryptionError';
  }
}

/** Rate limiter error */
export class RateLimitExceededError extends Error {
  constructor(
    public readonly retryAfterMs: number,
  ) {
    super(`Rate limit exceeded. Retry after ${retryAfterMs}ms`);
    this.name = 'RateLimitExceededError';
  }
}
