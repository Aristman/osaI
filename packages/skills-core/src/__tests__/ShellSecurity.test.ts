/**
 * ShellSecurity unit tests
 */

import { describe, it, expect } from 'vitest';
import { ShellSecurity } from '../security/ShellSecurity.js';

describe('ShellSecurity', () => {
  describe('constructor', () => {
    it('should use default blocked commands when no config provided', () => {
      const security = new ShellSecurity();
      expect(security.getBlockedCommands().length).toBeGreaterThan(0);
    });

    it('should use default timeout when no config provided', () => {
      const security = new ShellSecurity();
      expect(security.getTimeout()).toBe(30_000);
    });

    it('should use custom blocked commands', () => {
      const security = new ShellSecurity({
        blockedCommands: ['evil-command'],
      });
      expect(security.getBlockedCommands()).toEqual(['evil-command']);
    });

    it('should use custom timeout', () => {
      const security = new ShellSecurity({ timeout: 5_000 });
      expect(security.getTimeout()).toBe(5_000);
    });
  });

  describe('validateCommand', () => {
    it('should validate a simple safe command', () => {
      const security = new ShellSecurity();
      const result = security.validateCommand('echo hello');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('echo hello');
    });

    it('should reject empty commands', () => {
      const security = new ShellSecurity();
      const result = security.validateCommand('');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject whitespace-only commands', () => {
      const security = new ShellSecurity();
      const result = security.validateCommand('   ');

      expect(result.valid).toBe(false);
    });

    it('should reject blocked commands', () => {
      const security = new ShellSecurity();
      const result = security.validateCommand('rm -rf /');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('blocked');
    });

    it('should reject commands containing blocked substrings', () => {
      const security = new ShellSecurity();
      const result = security.validateCommand('echo "do not rm -rf /"');

      expect(result.valid).toBe(false);
    });

    it('should reject commands case-insensitively', () => {
      const security = new ShellSecurity();
      const result = security.validateCommand('RM -RF /');

      expect(result.valid).toBe(false);
    });

    it('should sanitize commands', () => {
      const security = new ShellSecurity();
      const result = security.validateCommand('  echo   hello  ');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('echo hello');
    });

    it('should remove trailing semicolons', () => {
      const security = new ShellSecurity();
      const result = security.validateCommand('echo hello;');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('echo hello');
    });
  });

  describe('isBlocked', () => {
    it('should detect blocked commands', () => {
      const security = new ShellSecurity();
      expect(security.isBlocked('rm -rf /')).toBe(true);
    });

    it('should allow safe commands', () => {
      const security = new ShellSecurity();
      expect(security.isBlocked('ls -la')).toBe(false);
    });

    it('should detect fork bombs', () => {
      const security = new ShellSecurity();
      expect(security.isBlocked(':(){ :|:& };:')).toBe(true);
    });

    it('should detect shutdown commands', () => {
      const security = new ShellSecurity();
      expect(security.isBlocked('shutdown now')).toBe(true);
      expect(security.isBlocked('reboot')).toBe(true);
    });
  });

  describe('sanitizeCommand', () => {
    it('should trim whitespace', () => {
      const security = new ShellSecurity();
      expect(security.sanitizeCommand('  echo  ')).toBe('echo');
    });

    it('should normalize multiple spaces', () => {
      const security = new ShellSecurity();
      expect(security.sanitizeCommand('echo    hello    world')).toBe(
        'echo hello world',
      );
    });

    it('should remove trailing semicolons', () => {
      const security = new ShellSecurity();
      expect(security.sanitizeCommand('echo hello ;')).toBe('echo hello');
    });

    it('should not remove internal semicolons', () => {
      const security = new ShellSecurity();
      expect(security.sanitizeCommand('echo hello; echo world')).toBe(
        'echo hello; echo world',
      );
    });
  });

  describe('getBlockedCommands', () => {
    it('should return a copy of the blocked commands', () => {
      const security = new ShellSecurity();
      const commands = security.getBlockedCommands();

      commands.push('evil');
      expect(security.getBlockedCommands()).not.toContain('evil');
    });
  });

  describe('custom config', () => {
    it('should use only custom blocked commands (replacing defaults)', () => {
      const security = new ShellSecurity({
        blockedCommands: ['custom-block'],
        timeout: 10_000,
      });

      expect(security.isBlocked('rm -rf /')).toBe(false);
      expect(security.isBlocked('custom-block')).toBe(true);
      expect(security.getTimeout()).toBe(10_000);
    });
  });
});
