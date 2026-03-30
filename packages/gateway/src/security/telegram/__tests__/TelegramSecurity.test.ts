/**
 * TelegramSecurity -- Unit Tests
 * Task T-006, Feature F-012, Domain DOMAIN-006
 *
 * Test Cases:
 * TC-006-1: allowedUsers whitelist -- authorized user => AccessResult.allowed = true
 * TC-006-2: allowedUsers whitelist -- unauthorized user => AccessResult.allowed = false
 * TC-006-3: Empty whitelist => all blocked => AccessResult.allowed = false
 */

import { describe, it, expect } from 'vitest';
import { TelegramSecurity } from '../TelegramSecurity.js';
import type { TelegramSecurityConfig, AccessResult } from '../types.js';

// ---- Helpers ----

function createSecurity(config?: Partial<TelegramSecurityConfig>): TelegramSecurity {
  return new TelegramSecurity(config);
}

// ---- Tests ----

describe('TelegramSecurity', () => {
  describe('checkAccess', () => {
    it('TC-006-1: allowedUsers whitelist -- authorized user is allowed', () => {
      const security = createSecurity({
        allowedUsers: ['user_123', 'user_456'],
      });

      const result: AccessResult = security.checkAccess('user_123');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('TC-006-1b: all users in whitelist are allowed', () => {
      const security = createSecurity({
        allowedUsers: ['user_123', 'user_456', 'user_789'],
      });

      expect(security.checkAccess('user_123').allowed).toBe(true);
      expect(security.checkAccess('user_456').allowed).toBe(true);
      expect(security.checkAccess('user_789').allowed).toBe(true);
    });

    it('TC-006-2: allowedUsers whitelist -- unauthorized user is blocked', () => {
      const security = createSecurity({
        allowedUsers: ['user_123'],
      });

      const result: AccessResult = security.checkAccess('user_999');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('user_999');
      expect(result.reason).toContain('not in the allowed users whitelist');
    });

    it('TC-006-3: empty whitelist -- all users are blocked', () => {
      const security = createSecurity({
        allowedUsers: [],
      });

      const result1: AccessResult = security.checkAccess('user_123');
      expect(result1.allowed).toBe(false);
      expect(result1.reason).toContain('Whitelist is empty');

      const result2: AccessResult = security.checkAccess('any_user');
      expect(result2.allowed).toBe(false);
      expect(result2.reason).toContain('Whitelist is empty');
    });

    it('TC-006-3b: default config (no allowedUsers) -- all blocked', () => {
      const security = createSecurity();

      const result: AccessResult = security.checkAccess('user_1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Whitelist is empty');
    });
  });

  describe('getAllowedUsers', () => {
    it('returns set of configured allowed users', () => {
      const security = createSecurity({
        allowedUsers: ['a', 'b', 'c'],
      });

      const users = security.getAllowedUsers();
      expect(users.size).toBe(3);
      expect(users.has('a')).toBe(true);
      expect(users.has('b')).toBe(true);
      expect(users.has('c')).toBe(true);
    });

    it('returns empty set when no users configured', () => {
      const security = createSecurity();
      expect(security.getAllowedUsers().size).toBe(0);
    });
  });

  describe('setAllowedUsers', () => {
    it('updates allowed users list at runtime', () => {
      const security = createSecurity({
        allowedUsers: ['user_1'],
      });

      expect(security.checkAccess('user_1').allowed).toBe(true);
      expect(security.checkAccess('user_2').allowed).toBe(false);

      security.setAllowedUsers(['user_2', 'user_3']);

      expect(security.checkAccess('user_1').allowed).toBe(false);
      expect(security.checkAccess('user_2').allowed).toBe(true);
      expect(security.checkAccess('user_3').allowed).toBe(true);
    });
  });

  describe('getSessionEncryption', () => {
    it('returns a SessionEncryption instance', () => {
      const security = createSecurity({
        sessionEncryption: {
          encryptionKey: 'a'.repeat(64),
          sessionDir: '/tmp/test-session',
        },
      });

      const encryption = security.getSessionEncryption();
      expect(encryption).toBeDefined();
      expect(encryption.getConfig().encryptionKey).toBe('a'.repeat(64));
    });
  });

  describe('getRateLimiter', () => {
    it('returns a RateLimiter instance', () => {
      const security = createSecurity({
        rateLimiter: {
          maxRequests: 10,
          windowMs: 60_000,
        },
      });

      const limiter = security.getRateLimiter();
      expect(limiter).toBeDefined();
      expect(limiter.getConfig().maxRequests).toBe(10);
      expect(limiter.getConfig().windowMs).toBe(60_000);
    });
  });

  describe('getConfig', () => {
    it('returns merged configuration', () => {
      const security = createSecurity({
        allowedUsers: ['u1'],
        rateLimiter: { maxRequests: 5, windowMs: 10_000 },
        sessionEncryption: { encryptionKey: 'k', sessionDir: '/d' },
      });

      const config = security.getConfig();
      expect(config.allowedUsers).toEqual(['u1']);
      expect(config.rateLimiter.maxRequests).toBe(5);
      expect(config.rateLimiter.windowMs).toBe(10_000);
      expect(config.sessionEncryption.encryptionKey).toBe('k');
      expect(config.sessionEncryption.sessionDir).toBe('/d');
    });
  });
});
