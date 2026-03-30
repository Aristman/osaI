/**
 * SessionEncryption -- AES-256-GCM encryption/decryption for Telegram userbot session files
 * Task T-006, Feature F-012, Domain DOMAIN-006
 *
 * Encrypts Telethon session files stored at ~/.osai/channels/telegram/session/
 * using AES-256-GCM (authenticated encryption).
 *
 * Key management:
 * - Key is derived from osai.json config (channels.telegram.bot.sessionEncryptionKey)
 * - Key must be 32 bytes (256 bits), hex-encoded
 * - If no key is provided, a random key is generated on first init
 */

import { createCipheriv, createDecipheriv, type DecipherGCM, randomBytes, pbkdf2Sync } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionEncryptionConfig } from './types.js';
import { SessionEncryptionError } from './types.js';

/** AES-256-GCM algorithm identifier */
const ALGORITHM = 'aes-256-gcm';

/** IV length for AES-GCM (12 bytes is recommended) */
const IV_LENGTH = 12;

/** Auth tag length for AES-GCM (16 bytes) */
const AUTH_TAG_LENGTH = 16;

/** PBKDF2 iterations for key derivation */
const PBKDF2_ITERATIONS = 100_000;

/** Salt length for PBKDF2 */
const SALT_LENGTH = 32;

/**
 * Encrypted file format (binary):
 * [salt: 32 bytes][iv: 12 bytes][authTag: 16 bytes][ciphertext: N bytes]
 */

/** Default session directory */
const DEFAULT_SESSION_DIR = join(
  process.env['HOME'] ?? process.env['USERPROFILE'] ?? '/tmp',
  '.osai',
  'channels',
  'telegram',
  'session',
);

/**
 * SessionEncryption handles AES-256-GCM encryption/decryption
 * of Telegram userbot session files.
 */
export class SessionEncryption {
  private readonly config: SessionEncryptionConfig;
  constructor(config: Partial<SessionEncryptionConfig> = {}) {
    const encryptionKey = config.encryptionKey ?? '';
    this.config = {
      encryptionKey,
      sessionDir: config.sessionDir ?? DEFAULT_SESSION_DIR,
    };
  }

  /** Get current configuration */
  getConfig(): Readonly<SessionEncryptionConfig> {
    return this.config;
  }

  /**
   * Derive a 32-byte AES key using PBKDF2 from the configured encryption key.
   * Uses a random salt for each encryption operation.
   *
   * @param salt - Salt for key derivation (32 bytes)
   * @returns Derived 32-byte key
   */
  private deriveKey(salt: Buffer): Buffer {
    const keySource = this.config.encryptionKey;
    if (keySource.length === 0) {
      throw new SessionEncryptionError('No encryption key configured');
    }

    return pbkdf2Sync(keySource, salt, PBKDF2_ITERATIONS, 32, 'sha512');
  }

  /**
   * Encrypt data using AES-256-GCM.
   *
   * @param plaintext - Data to encrypt
   * @returns Encrypted buffer: [salt][iv][authTag][ciphertext]
   */
  encrypt(plaintext: Buffer | Uint8Array): Buffer {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);

    const key = this.deriveKey(salt);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    const encrypted = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Pack: salt | iv | authTag | ciphertext
    return Buffer.concat([salt, iv, authTag, encrypted]);
  }

  /**
   * Decrypt data using AES-256-GCM.
   *
   * @param encrypted - Encrypted buffer: [salt][iv][authTag][ciphertext]
   * @returns Decrypted plaintext buffer
   * @throws SessionEncryptionError if decryption fails (wrong key, corrupted data)
   */
  decrypt(encrypted: Buffer | Uint8Array): Buffer {
    const data = Buffer.from(encrypted);

    if (data.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new SessionEncryptionError('Encrypted data too short');
    }

    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const key = this.deriveKey(salt);

    let decipher: DecipherGCM;
    try {
      decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
      decipher.setAuthTag(authTag);
    } catch (err) {
      throw new SessionEncryptionError('Failed to initialize decryption', err);
    }

    try {
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decrypted;
    } catch (err) {
      throw new SessionEncryptionError(
        'Decryption failed: wrong key or corrupted data',
        err,
      );
    }
  }

  /**
   * Encrypt a file and write it to the session directory.
   *
   * @param filename - Name of the file (relative to sessionDir)
   * @param plaintext - Data to encrypt
   */
  async encryptFile(filename: string, plaintext: Buffer | Uint8Array): Promise<void> {
    await mkdir(this.config.sessionDir, { recursive: true });
    const encrypted = this.encrypt(plaintext);
    const filePath = join(this.config.sessionDir, filename);
    await writeFile(filePath, encrypted);
  }

  /**
   * Read and decrypt a file from the session directory.
   *
   * @param filename - Name of the file (relative to sessionDir)
   * @returns Decrypted plaintext buffer
   */
  async decryptFile(filename: string): Promise<Buffer> {
    const filePath = join(this.config.sessionDir, filename);
    const encrypted = await readFile(filePath);
    return this.decrypt(encrypted);
  }

  /**
   * Generate a random hex-encoded encryption key (32 bytes = 64 hex chars).
   */
  static generateKey(): string {
    return randomBytes(32).toString('hex');
  }
}
