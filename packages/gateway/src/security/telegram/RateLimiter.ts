/**
 * RateLimiter -- Token bucket / sliding window rate limiter for Telegram userbot
 * Task T-006, Feature F-012, Domain DOMAIN-006
 *
 * Default: 30 requests per minute (60000ms window)
 *
 * Uses a sliding window approach: tracks request timestamps and
 * counts requests within the configured time window.
 */

import type { RateLimiterConfig, RateLimitResult } from './types.js';

/** Default rate limit: 30 requests per minute */
export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  maxRequests: 30,
  windowMs: 60_000,
};

/**
 * RateLimiter implements a sliding window rate limiter.
 *
 * For each key (e.g., a chat_id or user_id), it tracks individual
 * request timestamps and counts how many fall within the current window.
 */
export class RateLimiter {
  private readonly config: RateLimiterConfig;
  /** Per-key request timestamp arrays */
  private readonly buckets: Map<string, number[]> = new Map();

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = {
      maxRequests: config?.maxRequests ?? DEFAULT_RATE_LIMITER_CONFIG.maxRequests,
      windowMs: config?.windowMs ?? DEFAULT_RATE_LIMITER_CONFIG.windowMs,
    };
  }

  /** Get current configuration */
  getConfig(): Readonly<RateLimiterConfig> {
    return this.config;
  }

  /**
   * Check if a request is allowed for the given key.
   *
   * @param key - Unique identifier (e.g., chat_id, user_id)
   * @returns RateLimitResult with allowed status and metadata
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get or create bucket for key
    let timestamps = this.buckets.get(key);
    if (timestamps === undefined) {
      timestamps = [];
      this.buckets.set(key, timestamps);
    }

    // Remove expired timestamps (outside the window)
    while (timestamps.length > 0 && timestamps[0]! < windowStart) {
      timestamps.shift();
    }

    const totalRequests = timestamps.length;

    // Check if limit is exceeded
    if (totalRequests >= this.config.maxRequests) {
      // Calculate when the oldest request in the window will expire
      const oldestInWindow = timestamps[0]!;
      const retryAfterMs = oldestInWindow + this.config.windowMs - now;

      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, retryAfterMs),
        totalRequests,
      };
    }

    // Record the request
    timestamps.push(now);

    return {
      allowed: true,
      remaining: this.config.maxRequests - timestamps.length,
      totalRequests: timestamps.length,
    };
  }

  /**
   * Reset the rate limiter for a specific key.
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Reset all rate limiter buckets.
   */
  resetAll(): void {
    this.buckets.clear();
  }

  /**
   * Get the number of tracked keys.
   */
  getBucketCount(): number {
    return this.buckets.size;
  }
}
