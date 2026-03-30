/**
 * SessionEncryption -- Unit Tests
 * Task T-006, Feature F-012, Domain DOMAIN-006
 *
 * Test Cases:
 * TC-006-4: Session encryption -- encrypt + decrypt roundtrip => original data === decrypted data
 * TC-006-5: Session encryption -- wrong key => error thrown
 */

import { describe, it, expect } from 'vitest';
import { SessionEncryption } from '../SessionEncryption.js';
import { SessionEncryptionError } from '../types.js';
import type { SessionEncryptionConfig } from '../types.js';

// ---- Helpers ----

const VALID_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

function createEncryption(config?: Partial<SessionEncryptionConfig>): SessionEncryption {
  return new SessionEncryption({
    encryptionKey: VALID_KEY,
    sessionDir: '/tmp/osai-test-session',
    ...config,
  });
}

// ---- Tests ----

describe('SessionEncryption', () => {
  describe('encrypt/decrypt roundtrip', () => {
    it('TC-006-4: encrypt + decrypt roundtrip produces original data (Buffer)', () => {
      const encryption = createEncryption();
      const original = Buffer.from('Hello, Telegram session data!');

      const encrypted = encryption.encrypt(original);
      const decrypted = encryption.decrypt(encrypted);

      expect(Buffer.compare(decrypted, original)).toBe(0);
      expect(decrypted.toString()).toBe('Hello, Telegram session data!');
    });

    it('TC-006-4b: roundtrip with binary data', () => {
      const encryption = createEncryption();
      const original = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x80, 0x7f]);

      const encrypted = encryption.encrypt(original);
      const decrypted = encryption.decrypt(encrypted);

      expect(Buffer.compare(decrypted, original)).toBe(0);
    });

    it('TC-006-4c: roundtrip with empty buffer', () => {
      const encryption = createEncryption();
      const original = Buffer.alloc(0);

      const encrypted = encryption.encrypt(original);
      const decrypted = encryption.decrypt(encrypted);

      expect(decrypted.length).toBe(0);
    });

    it('TC-006-4d: roundtrip with large data (64KB)', () => {
      const encryption = createEncryption();
      const original = Buffer.alloc(65536, 0x42);

      const encrypted = encryption.encrypt(original);
      const decrypted = encryption.decrypt(encrypted);

      expect(Buffer.compare(decrypted, original)).toBe(0);
    });

    it('each encryption produces unique ciphertext (random IV + salt)', () => {
      const encryption = createEncryption();
      const data = Buffer.from('same data');

      const encrypted1 = encryption.encrypt(data);
      const encrypted2 = encryption.encrypt(data);

      // Ciphertexts should be different due to random IV + salt
      expect(Buffer.compare(encrypted1, encrypted2)).not.toBe(0);

      // But both should decrypt to the same data
      expect(Buffer.compare(encryption.decrypt(encrypted1), data)).toBe(0);
      expect(Buffer.compare(encryption.decrypt(encrypted2), data)).toBe(0);
    });
  });

  describe('wrong key', () => {
    it('TC-006-5: decryption with wrong key throws SessionEncryptionError', () => {
      const encryption1 = createEncryption({ encryptionKey: VALID_KEY });
      const encryption2 = createEncryption({ encryptionKey: 'z9y8x7w6v5u4z3y2x1w0v9u8z7y6x5w4v3u2z1y0x9w8v7u6z5y4x3w2v1u0z9y8' });

      const original = Buffer.from('secret session data');
      const encrypted = encryption1.encrypt(original);

      expect(() => encryption2.decrypt(encrypted)).toThrow(SessionEncryptionError);
      expect(() => encryption2.decrypt(encrypted)).toThrow('wrong key or corrupted data');
    });
  });

  describe('corrupted data', () => {
    it('throws SessionEncryptionError for truncated data', () => {
      const encryption = createEncryption();
      const corrupted = Buffer.from('too short');

      expect(() => encryption.decrypt(corrupted)).toThrow(SessionEncryptionError);
      expect(() => encryption.decrypt(corrupted)).toThrow('Encrypted data too short');
    });

    it('throws SessionEncryptionError for tampered ciphertext', () => {
      const encryption = createEncryption();
      const original = Buffer.from('test data');
      const encrypted = encryption.encrypt(original);

      // Tamper with the ciphertext (last byte)
      const tampered = Buffer.from(encrypted);
      tampered[tampered.length - 1] ^= 0xff;

      expect(() => encryption.decrypt(tampered)).toThrow(SessionEncryptionError);
    });
  });

  describe('no key configured', () => {
    it('throws SessionEncryptionError when no encryption key is set', () => {
      const encryption = createEncryption({ encryptionKey: '' });

      expect(() => encryption.encrypt(Buffer.from('data'))).toThrow(SessionEncryptionError);
      expect(() => encryption.encrypt(Buffer.from('data'))).toThrow('No encryption key configured');
    });
  });

  describe('generateKey', () => {
    it('generates a 64-character hex string (32 bytes)', () => {
      const key = SessionEncryption.generateKey();

      expect(key).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
    });

    it('generates unique keys', () => {
      const key1 = SessionEncryption.generateKey();
      const key2 = SessionEncryption.generateKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe('encryptFile/decryptFile', () => {
    it('encrypts and decrypts a file correctly', async () => {
      const tmpDir = `/tmp/osai-test-session-${Date.now()}`;
      const encryption = createEncryption({ sessionDir: tmpDir });
      const original = Buffer.from('session file content');

      await encryption.encryptFile('test.session', original);
      const decrypted = await encryption.decryptFile('test.session');

      expect(Buffer.compare(decrypted, original)).toBe(0);

      // Cleanup
      const { rmSync } = await import('node:fs');
      try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
    });
  });

  describe('getConfig', () => {
    it('returns current configuration', () => {
      const encryption = createEncryption({
        encryptionKey: VALID_KEY,
        sessionDir: '/custom/path',
      });

      const config = encryption.getConfig();
      expect(config.encryptionKey).toBe(VALID_KEY);
      expect(config.sessionDir).toBe('/custom/path');
    });
  });
});
