/**
 * @osai/skills-core -- CommandValidator Tests (DOMAIN-003, T-003)
 *
 * Test cases from ROADMAP_TASKS_F-012.md:
 * TC-003-1: Обычная команда (ls -la) -- разрешена
 * TC-003-2: "rm -rf /" -- заблокирована
 * TC-003-3: "mkfs.ext4" -- заблокирована
 * TC-003-4: "sudo rm -rf /" -- заблокирована (sudo prefix strip)
 * TC-003-8: Конфигурируемый blocked_commands из osai.json
 */

import { describe, it, expect } from 'vitest';
import { CommandValidator } from '../CommandValidator.js';

describe('CommandValidator', () => {
  describe('TC-003-1: Normal commands are allowed', () => {
    it('should allow "ls -la"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('ls -la');
      expect(result.allowed).toBe(true);
    });

    it('should allow "echo hello"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('echo hello');
      expect(result.allowed).toBe(true);
    });

    it('should allow "git status"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('git status');
      expect(result.allowed).toBe(true);
    });

    it('should allow "cat /etc/hosts"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('cat /etc/hosts');
      expect(result.allowed).toBe(true);
    });

    it('should allow "npm install"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('npm install');
      expect(result.allowed).toBe(true);
    });
  });

  describe('TC-003-2: "rm -rf /" is blocked', () => {
    it('should block "rm -rf /"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('rm -rf /');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('Destructive');
    });

    it('should block "rm -rf /" with extra spaces', () => {
      const validator = new CommandValidator();
      const result = validator.validate('  rm -rf /  ');
      expect(result.allowed).toBe(false);
    });
  });

  describe('TC-003-3: "mkfs.ext4" is blocked (wildcard pattern mkfs.*)', () => {
    it('should block "mkfs.ext4"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('mkfs.ext4 /dev/sda1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('filesystem format');
    });

    it('should block "mkfs.ntfs"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('mkfs.ntfs /dev/sda1');
      expect(result.allowed).toBe(false);
    });

    it('should block "mkfs.fat"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('mkfs.fat -F 32 /dev/sda1');
      expect(result.allowed).toBe(false);
    });
  });

  describe('TC-003-4: sudo prefix strip', () => {
    it('should block "sudo rm -rf /" after stripping sudo', () => {
      const validator = new CommandValidator();
      const result = validator.validate('sudo rm -rf /');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Destructive');
    });

    it('should block "sudo -E rm -rf /"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('sudo -E rm -rf /');
      expect(result.allowed).toBe(false);
    });

    it('should block "sudo mkfs.ext4"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('sudo mkfs.ext4 /dev/sda1');
      expect(result.allowed).toBe(false);
    });

    it('should block "sudo dd if=/dev/zero"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('sudo dd if=/dev/zero of=/dev/sda');
      expect(result.allowed).toBe(false);
    });

    it('should block "sudo chmod -R 777 /"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('sudo chmod -R 777 /');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Hardcoded blocked: dd if=/dev/zero', () => {
    it('should block "dd if=/dev/zero of=/dev/sda"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('dd if=/dev/zero of=/dev/sda');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('zero-fill');
    });
  });

  describe('Hardcoded blocked: fork bomb', () => {
    it('should block the fork bomb ":(){ :|:& };:"', () => {
      const validator = new CommandValidator();
      const result = validator.validate(':(){ :|:& };:');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('fork bomb');
    });
  });

  describe('Hardcoded blocked: chmod -R 777 /', () => {
    it('should block "chmod -R 777 /"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('chmod -R 777 /');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('chmod');
    });

    it('should not block "chmod 755 script.sh"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('chmod 755 script.sh');
      expect(result.allowed).toBe(true);
    });
  });

  describe('TC-003-8: Configurable blocked commands from osai.json', () => {
    it('should block user-configured commands', () => {
      const userBlocked = [
        { pattern: 'shutdown', reason: 'System shutdown is not allowed' },
        { pattern: 'reboot', reason: 'System reboot is not allowed' },
      ];
      const validator = new CommandValidator(userBlocked);

      expect(validator.validate('shutdown -h now').allowed).toBe(false);
      expect(validator.validate('reboot').allowed).toBe(false);
    });

    it('should still block hardcoded commands when user commands are configured', () => {
      const userBlocked = [
        { pattern: 'shutdown', reason: 'System shutdown is not allowed' },
      ];
      const validator = new CommandValidator(userBlocked);

      // Hardcoded should still be active
      expect(validator.validate('rm -rf /').allowed).toBe(false);
      expect(validator.validate('mkfs.ext4').allowed).toBe(false);
      // User custom should also be active
      expect(validator.validate('shutdown').allowed).toBe(false);
    });

    it('should support wildcard patterns in user-configured commands', () => {
      const userBlocked = [
        { pattern: 'systemctl *', reason: 'Service management restricted' },
      ];
      const validator = new CommandValidator(userBlocked);

      // "systemctl restart nginx" matches "systemctl *" pattern
      expect(validator.validate('systemctl restart nginx').allowed).toBe(false);
      expect(validator.validate('systemctl stop nginx').allowed).toBe(false);
      // "systemctl" without arguments does NOT match "systemctl *" (no trailing space)
      expect(validator.validate('systemctl').allowed).toBe(true);
    });

    it('should expose blocked patterns via getBlockedPatterns()', () => {
      const userBlocked = [
        { pattern: 'shutdown', reason: 'Custom reason' },
      ];
      const validator = new CommandValidator(userBlocked);
      const patterns = validator.getBlockedPatterns();

      // Should contain both hardcoded and user patterns
      const reasons = patterns.map((p) => p.reason);
      expect(reasons.length).toBeGreaterThan(1);
      expect(reasons).toContain('Custom reason');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty command', () => {
      const validator = new CommandValidator();
      const result = validator.validate('');
      expect(result.allowed).toBe(true);
    });

    it('should handle command with only whitespace', () => {
      const validator = new CommandValidator();
      const result = validator.validate('   ');
      expect(result.allowed).toBe(true);
    });

    it('should not block "rm -rf" without "/" argument', () => {
      const validator = new CommandValidator();
      const result = validator.validate('rm -rf ./build');
      expect(result.allowed).toBe(true);
    });

    it('should block nested sudo: "sudo sudo rm -rf /"', () => {
      const validator = new CommandValidator();
      const result = validator.validate('sudo sudo rm -rf /');
      expect(result.allowed).toBe(false);
    });
  });
});
