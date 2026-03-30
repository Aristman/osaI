/**
 * @osai/providers -- Auth Rotation Unit Tests (DOMAIN-008)
 */

/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from 'vitest';
import { AuthRotator } from '../../chain/auth-rotation.js';
import { RateLimitError } from '../../errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRotator(keys: string[]): AuthRotator {
  return new AuthRotator({ apiKeys: keys });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthRotator', () => {
  // -- Construction ---------------------------------------------------------

  describe('construction', () => {
    it('should store api keys from config', () => {
      const rotator = createRotator(['key1', 'key2', 'key3']);
      expect(rotator.apiKeys).toEqual(['key1', 'key2', 'key3']);
    });

    it('should handle empty key list', () => {
      const rotator = createRotator([]);
      expect(rotator.apiKeys).toEqual([]);
    });

    it('should handle single key', () => {
      const rotator = createRotator(['key1']);
      expect(rotator.apiKeys).toEqual(['key1']);
    });
  });

  // -- canRotate ------------------------------------------------------------

  describe('canRotate', () => {
    it('should return true when multiple keys exist', () => {
      const rotator = createRotator(['key1', 'key2']);
      expect(rotator.canRotate()).toBe(true);
    });

    it('should return false when single key exists', () => {
      const rotator = createRotator(['key1']);
      expect(rotator.canRotate()).toBe(false);
    });

    it('should return false when no keys exist', () => {
      const rotator = createRotator([]);
      expect(rotator.canRotate()).toBe(false);
    });
  });

  // -- getDefaultKey --------------------------------------------------------

  describe('getDefaultKey', () => {
    it('should return the first key', () => {
      const rotator = createRotator(['key1', 'key2']);
      expect(rotator.getDefaultKey()).toBe('key1');
    });

    it('should return undefined for empty key list', () => {
      const rotator = createRotator([]);
      expect(rotator.getDefaultKey()).toBeUndefined();
    });
  });

  // -- getNextKey -----------------------------------------------------------

  describe('getNextKey', () => {
    it('should return the first unused key', () => {
      const rotator = createRotator(['key1', 'key2', 'key3']);
      expect(rotator.getNextKey(new Set([0]))).toBe('key2');
    });

    it('should return the first key when none used', () => {
      const rotator = createRotator(['key1', 'key2']);
      expect(rotator.getNextKey(new Set())).toBe('key1');
    });

    it('should return undefined when all keys used', () => {
      const rotator = createRotator(['key1', 'key2']);
      expect(rotator.getNextKey(new Set([0, 1]))).toBeUndefined();
    });
  });

  // -- getRemainingKeyCount -------------------------------------------------

  describe('getRemainingKeyCount', () => {
    it('should count unused keys correctly', () => {
      const rotator = createRotator(['key1', 'key2', 'key3']);
      expect(rotator.getRemainingKeyCount(new Set([0]))).toBe(2);
      expect(rotator.getRemainingKeyCount(new Set([0, 1]))).toBe(1);
      expect(rotator.getRemainingKeyCount(new Set([0, 1, 2]))).toBe(0);
      expect(rotator.getRemainingKeyCount(new Set())).toBe(3);
    });
  });

  // -- tryWithRotation ------------------------------------------------------

  describe('tryWithRotation', () => {
    it('should return result on first key success', async () => {
      const rotator = createRotator(['key1', 'key2']);
      const fn = vi.fn().mockResolvedValue('result');

      const result = await rotator.tryWithRotation(fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('key1');
    });

    it('should rotate to next key on RateLimitError', async () => {
      const rotator = createRotator(['key1', 'key2', 'key3']);
      const fn = vi.fn()
        .mockRejectedValueOnce(new RateLimitError('429', 'test-provider', { retryAfterMs: 1000 }))
        .mockResolvedValueOnce('result');

      const onRateLimit = vi.fn();
      const result = await rotator.tryWithRotation(fn, onRateLimit);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenNthCalledWith(1, 'key1');
      expect(fn).toHaveBeenNthCalledWith(2, 'key2');
      expect(onRateLimit).toHaveBeenCalledTimes(1);
      expect(onRateLimit).toHaveBeenCalledWith(0, 1000);
    });

    it('should rotate through multiple rate limit errors', async () => {
      const rotator = createRotator(['key1', 'key2', 'key3']);
      const fn = vi.fn()
        .mockRejectedValueOnce(new RateLimitError('429', 'p', { retryAfterMs: 500 }))
        .mockRejectedValueOnce(new RateLimitError('429', 'p', { retryAfterMs: 500 }))
        .mockResolvedValueOnce('result');

      const result = await rotator.tryWithRotation(fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(3);
      expect(fn).toHaveBeenLastCalledWith('key3');
    });

    it('should throw when all keys are exhausted with rate limit', async () => {
      const rotator = createRotator(['key1', 'key2']);
      const fn = vi.fn()
        .mockRejectedValueOnce(new RateLimitError('429', 'p'))
        .mockRejectedValueOnce(new RateLimitError('429', 'p'));

      await expect(rotator.tryWithRotation(fn)).rejects.toThrow('429');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw non-rate-limit errors immediately', async () => {
      const rotator = createRotator(['key1', 'key2']);
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Connection refused'));

      await expect(rotator.tryWithRotation(fn)).rejects.toThrow('Connection refused');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw error for empty key list', async () => {
      const rotator = createRotator([]);
      const fn = vi.fn();

      await expect(rotator.tryWithRotation(fn)).rejects.toThrow('No API keys configured');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should detect rate limit by retryAfterMs property', async () => {
      const rotator = createRotator(['key1', 'key2']);

      // Create a plain error with retryAfterMs (duck typing)
      class CustomRateLimitError extends Error {
        public readonly retryAfterMs = 2000;
        public readonly statusCode = 429;
        constructor() {
          super('Rate limited');
          this.name = 'CustomRateLimitError';
        }
      }

      const fn = vi.fn()
        .mockRejectedValueOnce(new CustomRateLimitError())
        .mockResolvedValueOnce('result');

      const result = await rotator.tryWithRotation(fn);
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should detect rate limit by statusCode 429', async () => {
      const rotator = createRotator(['key1', 'key2']);

      class StatusError extends Error {
        public readonly statusCode = 429;
        constructor() {
          super('Too many requests');
          this.name = 'StatusError';
        }
      }

      const fn = vi.fn()
        .mockRejectedValueOnce(new StatusError())
        .mockResolvedValueOnce('result');

      const result = await rotator.tryWithRotation(fn);
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
