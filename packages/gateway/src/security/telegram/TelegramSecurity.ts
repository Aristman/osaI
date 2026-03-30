/**
 * TelegramSecurity -- Whitelist-based access control for Telegram bot
 * Task T-006, Feature F-012, Domain DOMAIN-006
 *
 * Responsibilities:
 * - allowedUsers whitelist check (from osai.json channels.telegram.bot.allowedUsers)
 * - Session encryption delegation (AES-256-GCM via SessionEncryption)
 * - Rate limiting delegation (via RateLimiter)
 */

import type { TelegramSecurityConfig, AccessResult, AllowedUsersList } from './types.js';
import { SessionEncryption } from './SessionEncryption.js';
import { RateLimiter, DEFAULT_RATE_LIMITER_CONFIG } from './RateLimiter.js';

/** Default Telegram security configuration */
export const DEFAULT_TELEGRAM_SECURITY_CONFIG: TelegramSecurityConfig = {
  allowedUsers: [],
  rateLimiter: DEFAULT_RATE_LIMITER_CONFIG,
  sessionEncryption: {
    encryptionKey: '',
    sessionDir: '',
  },
};

/**
 * TelegramSecurity provides layered security for Telegram integration:
 *
 * 1. Bot access control via allowedUsers whitelist
 * 2. Userbot session encryption (AES-256-GCM)
 * 3. Rate limiting for userbot requests
 */
export class TelegramSecurity {
  private readonly allowedUsers: Set<string>;
  private readonly rateLimiter: RateLimiter;
  private readonly sessionEncryption: SessionEncryption;
  private _config: TelegramSecurityConfig;

  constructor(config?: Partial<TelegramSecurityConfig>) {
    const merged: TelegramSecurityConfig = {
      allowedUsers: config?.allowedUsers ?? DEFAULT_TELEGRAM_SECURITY_CONFIG.allowedUsers,
      rateLimiter: {
        ...DEFAULT_TELEGRAM_SECURITY_CONFIG.rateLimiter,
        ...config?.rateLimiter,
      },
      sessionEncryption: {
        ...DEFAULT_TELEGRAM_SECURITY_CONFIG.sessionEncryption,
        ...config?.sessionEncryption,
      },
    };
    this._config = merged;

    this.allowedUsers = new Set(merged.allowedUsers);
    this.rateLimiter = new RateLimiter(merged.rateLimiter);
    this.sessionEncryption = new SessionEncryption(merged.sessionEncryption);
  }

  /** Get current configuration */
  getConfig(): Readonly<TelegramSecurityConfig> {
    return this._config;
  }

  /**
   * Check if a Telegram user (by user ID) is allowed to interact with the bot.
   *
   * @param userId - Telegram user ID (as string)
   * @returns AccessResult with allowed status
   */
  checkAccess(userId: string): AccessResult {
    // Empty whitelist means nobody is allowed
    if (this.allowedUsers.size === 0) {
      return {
        allowed: false,
        reason: 'Whitelist is empty: no users are allowed',
      };
    }

    if (this.allowedUsers.has(userId)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `User ${userId} is not in the allowed users whitelist`,
    };
  }

  /**
   * Get the session encryption instance.
   */
  getSessionEncryption(): SessionEncryption {
    return this.sessionEncryption;
  }

  /**
   * Get the rate limiter instance.
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * Get the list of allowed users.
   */
  getAllowedUsers(): ReadonlySet<string> {
    return this.allowedUsers;
  }

  /**
   * Update allowed users list at runtime.
   */
  setAllowedUsers(users: AllowedUsersList): void {
    this.allowedUsers.clear();
    for (const user of users) {
      this.allowedUsers.add(user);
    }
    this._config = {
      ...this._config,
      allowedUsers: [...users],
    };
  }
}
