/**
 * FileSandbox unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileSandbox } from '../security/FileSandbox.js';

describe('FileSandbox', () => {
  let tempDir: string;
  let sandbox: FileSandbox;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sandbox-test-'));
    sandbox = new FileSandbox({
      allowedDirs: [tempDir],
      blockedPatterns: [],
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validatePath', () => {
    it('should validate a path within allowed directories', () => {
      const testFile = join(tempDir, 'test.txt');
      writeFileSync(testFile, 'hello');

      const result = sandbox.validatePath(testFile, 'read');

      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toBeDefined();
    });

    it('should reject a path outside allowed directories', () => {
      const result = sandbox.validatePath('/etc/passwd', 'read');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('outside allowed directories');
    });

    it('should validate non-existent paths within allowed directories', () => {
      const newFile = join(tempDir, 'new-file.txt');

      const result = sandbox.validatePath(newFile, 'write');

      expect(result.valid).toBe(true);
    });

    it('should validate paths with blocked patterns', () => {
      const sandboxWithBlocks = new FileSandbox({
        allowedDirs: [tempDir],
        blockedPatterns: ['\\.secret$'],
      });

      const secretFile = join(tempDir, 'config.secret');
      writeFileSync(secretFile, 'sensitive');

      const result = sandboxWithBlocks.validatePath(secretFile, 'read');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('blocked pattern');
    });

    it('should work with all FileOperation types', () => {
      const testFile = join(tempDir, 'test.txt');
      writeFileSync(testFile, 'data');

      const operations = ['read', 'write', 'delete', 'move', 'list', 'search'] as const;

      for (const op of operations) {
        const result = sandbox.validatePath(testFile, op);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('isAllowed', () => {
    it('should return true for allowed paths', () => {
      const testFile = join(tempDir, 'allowed.txt');
      writeFileSync(testFile, 'content');

      expect(sandbox.isAllowed(testFile)).toBe(true);
    });

    it('should return false for disallowed paths', () => {
      expect(sandbox.isAllowed('/etc/shadow')).toBe(false);
    });

    it('should return false for paths matching blocked patterns', () => {
      const sandboxWithBlocks = new FileSandbox({
        allowedDirs: [tempDir],
        blockedPatterns: ['\\.env$'],
      });

      const envFile = join(tempDir, '.env');
      writeFileSync(envFile, 'KEY=value');

      expect(sandboxWithBlocks.isAllowed(envFile)).toBe(false);
    });
  });

  describe('resolveSymlinks', () => {
    it('should resolve symlinks to real paths', () => {
      const realFile = join(tempDir, 'real-file.txt');
      writeFileSync(realFile, 'content');

      const linkFile = join(tempDir, 'link-file.txt');
      symlinkSync(realFile, linkFile);

      const resolved = sandbox.resolveSymlinks(linkFile);
      expect(resolved).toBe(realFile);
    });
  });

  describe('isBlockedPattern', () => {
    it('should detect blocked patterns', () => {
      const sandboxWithBlocks = new FileSandbox({
        allowedDirs: [tempDir],
        blockedPatterns: ['\\.log$', '\\.tmp$'],
      });

      const logFile = join(tempDir, 'app.log');
      const tmpFile = join(tempDir, 'data.tmp');
      const normalFile = join(tempDir, 'data.txt');

      writeFileSync(logFile, 'log');
      writeFileSync(tmpFile, 'tmp');
      writeFileSync(normalFile, 'data');

      expect(sandboxWithBlocks.isBlockedPattern(logFile)).toBe(true);
      expect(sandboxWithBlocks.isBlockedPattern(tmpFile)).toBe(true);
      expect(sandboxWithBlocks.isBlockedPattern(normalFile)).toBe(false);
    });
  });

  describe('getAllowedDirs', () => {
    it('should return a copy of allowed directories', () => {
      const dirs = sandbox.getAllowedDirs();
      expect(dirs).toEqual([tempDir]);

      // Mutating the returned array should not affect the sandbox
      dirs.push('/tmp/evil');
      expect(sandbox.getAllowedDirs()).toEqual([tempDir]);
    });
  });

  describe('getBlockedPatterns', () => {
    it('should return a copy of blocked patterns', () => {
      const sandboxWithBlocks = new FileSandbox({
        allowedDirs: [tempDir],
        blockedPatterns: ['\\.log$'],
      });

      const patterns = sandboxWithBlocks.getBlockedPatterns();
      expect(patterns).toEqual(['\\.log$']);

      patterns.push('evil');
      expect(sandboxWithBlocks.getBlockedPatterns()).toEqual(['\\.log$']);
    });
  });

  describe('multiple allowed directories', () => {
    it('should allow paths from any configured directory', () => {
      const tempDir2 = mkdtempSync(join(tmpdir(), 'sandbox-test-2-'));
      const multiSandbox = new FileSandbox({
        allowedDirs: [tempDir, tempDir2],
        blockedPatterns: [],
      });

      try {
        const file1 = join(tempDir, 'a.txt');
        const file2 = join(tempDir2, 'b.txt');
        writeFileSync(file1, 'a');
        writeFileSync(file2, 'b');

        expect(multiSandbox.isAllowed(file1)).toBe(true);
        expect(multiSandbox.isAllowed(file2)).toBe(true);
        expect(multiSandbox.isAllowed('/etc/passwd')).toBe(false);
      } finally {
        rmSync(tempDir2, { recursive: true, force: true });
      }
    });
  });

  describe('subdirectory traversal prevention', () => {
    it('should reject path traversal outside allowed dirs', () => {
      const result = sandbox.validatePath(tempDir + '/../../../etc/passwd', 'read');
      expect(result.valid).toBe(false);
    });
  });
});
