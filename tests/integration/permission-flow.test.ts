/**
 * Integration Test: Permission Flow
 *
 * T-004 / F-013
 *
 * Tests the permission flow:
 *   Write tool call -> permission_request -> User approve -> Execute
 *
 * Verifies that the PermissionChecker correctly:
 * - Classifies tools by category (read/write/exec/system)
 * - Returns 'auto' for read/system tools
 * - Returns 'confirm' for write/exec tools
 * - Supports policy overrides
 * - Reports correct risk levels
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  createTestFixture,
  requiresConfirmation,
  TEST_IDS,
} from './setup.js';
import { DatabaseManager } from '../../packages/shared/src/database.js';
import { PermissionChecker } from '../../packages/skills-core/src/permissions/PermissionChecker.js';
import { CATEGORY_DEFAULTS } from '../../packages/skills-core/src/permissions/types.js';
import type {
  PermissionPolicy,
  PermissionLevel,
} from '../../packages/skills-core/src/types.js';
import type {
  PermissionDecision,
  RiskLevel,
  ToolCategory,
} from '../../packages/skills-core/src/permissions/types.js';
import { SkillRegistry } from '../../packages/skills-core/src/registry/SkillRegistry.js';
import type { SkillDefinition, ToolResult } from '../../packages/skills-core/src/types.js';

describe('Integration: Permission Flow (Write tool -> Permission Request -> Approve -> Execute)', () => {
  let dbManager: DatabaseManager;
  let checker: PermissionChecker;
  let defaultPolicy: PermissionPolicy;

  beforeAll(() => {
    dbManager = new DatabaseManager({ dbPath: ':memory:' });
    dbManager.initialize();
  });

  afterAll(() => {
    dbManager.close();
  });

  beforeEach(() => {
    checker = new PermissionChecker();
    defaultPolicy = {};
  });

  // ---------------------------------------------------------------------------
  // T-004: write tool call -> permission_request -> user approve -> execute
  // ---------------------------------------------------------------------------

  // --- Category Classification ---

  describe('Tool category classification', () => {
    it('classifies read_* tools as read category (auto)', () => {
      const decision = checker.check('read_file', defaultPolicy);
      expect(decision.category).toBe('read');
      expect(decision.decision).toBe('auto');
      expect(decision.riskLevel).toBe('low');
    });

    it('classifies list_* tools as read category (auto)', () => {
      const decision = checker.check('list_directory', defaultPolicy);
      expect(decision.category).toBe('read');
      expect(decision.decision).toBe('auto');
    });

    it('classifies get_* tools as read category (auto)', () => {
      const decision = checker.check('get_info', defaultPolicy);
      expect(decision.category).toBe('read');
      expect(decision.decision).toBe('auto');
    });

    it('classifies search_* tools as read category (auto)', () => {
      const decision = checker.check('search_memory', defaultPolicy);
      expect(decision.category).toBe('read');
      expect(decision.decision).toBe('auto');
    });

    it('classifies write_* tools as write category (confirm)', () => {
      const decision = checker.check('write_file', defaultPolicy);
      expect(decision.category).toBe('write');
      expect(decision.decision).toBe('confirm');
      expect(decision.riskLevel).toBe('medium');
    });

    it('classifies create_* tools as write category (confirm)', () => {
      const decision = checker.check('create_file', defaultPolicy);
      expect(decision.category).toBe('write');
      expect(decision.decision).toBe('confirm');
      expect(decision.riskLevel).toBe('medium');
    });

    it('classifies delete_* tools as write category (confirm)', () => {
      const decision = checker.check('delete_file', defaultPolicy);
      expect(decision.category).toBe('write');
      expect(decision.decision).toBe('confirm');
      expect(decision.riskLevel).toBe('medium');
    });

    it('classifies move_* tools as write category (confirm)', () => {
      const decision = checker.check('move_file', defaultPolicy);
      expect(decision.category).toBe('write');
      expect(decision.decision).toBe('confirm');
      expect(decision.riskLevel).toBe('medium');
    });

    it('classifies exec_* tools as exec category (confirm)', () => {
      const decision = checker.check('exec_command', defaultPolicy);
      expect(decision.category).toBe('exec');
      expect(decision.decision).toBe('confirm');
      expect(decision.riskLevel).toBe('high');
    });

    it('classifies shell_* tools as exec category (confirm)', () => {
      const decision = checker.check('shell_execute', defaultPolicy);
      expect(decision.category).toBe('exec');
      expect(decision.decision).toBe('confirm');
      expect(decision.riskLevel).toBe('high');
    });

    it('classifies system_* tools as system category (auto)', () => {
      const decision = checker.check('system_info', defaultPolicy);
      expect(decision.category).toBe('system');
      expect(decision.decision).toBe('auto');
      expect(decision.riskLevel).toBe('low');
    });

    it('defaults unrecognized tools to read category (safest)', () => {
      const decision = checker.check('unknown_tool_xyz', defaultPolicy);
      expect(decision.category).toBe('read');
      expect(decision.decision).toBe('auto');
    });
  });

  // --- Policy Overrides ---

  describe('Policy overrides', () => {
    it('overrides category default with explicit auto policy', () => {
      const policy: PermissionPolicy = { write_file: 'auto' };
      const decision = checker.check('write_file', policy);

      expect(decision.category).toBe('write');
      expect(decision.decision).toBe('auto');
      expect(decision.riskLevel).toBe('low');
    });

    it('overrides category default with explicit deny policy', () => {
      const policy: PermissionPolicy = { exec_command: 'deny' };
      const decision = checker.check('exec_command', policy);

      expect(decision.category).toBe('exec');
      expect(decision.decision).toBe('deny');
      expect(decision.riskLevel).toBe('high');
    });

    it('allows read tool to require confirmation via policy', () => {
      const policy: PermissionPolicy = { read_secret: 'confirm' };
      const decision = checker.check('read_secret', policy);

      expect(decision.category).toBe('read');
      expect(decision.decision).toBe('confirm');
      expect(decision.riskLevel).toBe('medium');
    });

    it('does not affect unlisted tools when policy is set', () => {
      const policy: PermissionPolicy = { write_file: 'auto' };
      const decision = checker.check('write_another', policy);

      // write_another is not in policy, should use category default
      expect(decision.category).toBe('write');
      expect(decision.decision).toBe('confirm');
    });
  });

  // --- Permission Decision Structure ---

  describe('Permission decision structure', () => {
    it('includes tool name in decision', () => {
      const decision = checker.check('read_file', defaultPolicy);
      expect(decision.toolName).toBe('read_file');
    });

    it('includes a human-readable reason', () => {
      const decision = checker.check('write_file', defaultPolicy);
      expect(decision.reason).toBeDefined();
      expect(typeof decision.reason).toBe('string');
      expect(decision.reason).toContain('write_file');
    });

    it('reason mentions category defaults for non-overridden tools', () => {
      const decision = checker.check('exec_command', defaultPolicy);
      expect(decision.reason).toContain("Category 'exec'");
      expect(decision.reason).toContain('defaults');
    });

    it('reason mentions policy override for overridden tools', () => {
      const policy: PermissionPolicy = { read_file: 'deny' };
      const decision = checker.check('read_file', policy);
      expect(decision.reason).toContain('overridden by policy');
    });
  });

  // --- CATEGORY_DEFAULTS Consistency ---

  describe('CATEGORY_DEFAULTS consistency', () => {
    it('has read -> auto/low', () => {
      expect(CATEGORY_DEFAULTS.read.decision).toBe('auto');
      expect(CATEGORY_DEFAULTS.read.riskLevel).toBe('low');
    });

    it('has write -> confirm/medium', () => {
      expect(CATEGORY_DEFAULTS.write.decision).toBe('confirm');
      expect(CATEGORY_DEFAULTS.write.riskLevel).toBe('medium');
    });

    it('has exec -> confirm/high', () => {
      expect(CATEGORY_DEFAULTS.exec.decision).toBe('confirm');
      expect(CATEGORY_DEFAULTS.exec.riskLevel).toBe('high');
    });

    it('has system -> auto/low', () => {
      expect(CATEGORY_DEFAULTS.system.decision).toBe('auto');
      expect(CATEGORY_DEFAULTS.system.riskLevel).toBe('low');
    });
  });

  // --- Helper function ---

  describe('requiresConfirmation helper', () => {
    it('returns false for read tools', () => {
      expect(requiresConfirmation('read_file')).toBe(false);
      expect(requiresConfirmation('list_dir')).toBe(false);
      expect(requiresConfirmation('get_info')).toBe(false);
    });

    it('returns true for write tools', () => {
      expect(requiresConfirmation('write_file')).toBe(true);
      expect(requiresConfirmation('create_file')).toBe(true);
      expect(requiresConfirmation('delete_file')).toBe(true);
    });

    it('returns true for exec tools', () => {
      expect(requiresConfirmation('exec_command')).toBe(true);
      expect(requiresConfirmation('shell_execute')).toBe(true);
    });

    it('returns false for system tools', () => {
      expect(requiresConfirmation('system_info')).toBe(false);
    });

    it('respects policy overrides', () => {
      expect(requiresConfirmation('write_file', { write_file: 'auto' })).toBe(false);
      expect(requiresConfirmation('read_file', { read_file: 'confirm' })).toBe(true);
    });
  });

  // --- Integration with SkillRegistry ---

  describe('Permission integration with SkillRegistry', () => {
    it('registers skills with correct permission policies', () => {
      const registry = new SkillRegistry();

      const filesystemSkill: SkillDefinition = {
        name: 'filesystem',
        version: '1.0.0',
        description: 'Filesystem operations',
        category: 'bundled',
        tools: [
          {
            name: 'read_file',
            description: 'Read a file',
            parameters: { type: 'object', properties: {} },
            handler: async () => ({ content: 'file data' }),
          },
          {
            name: 'write_file',
            description: 'Write a file',
            parameters: { type: 'object', properties: {} },
            handler: async () => ({ success: true }),
          },
        ],
        enabled: true,
        permissions: {
          read_file: 'auto',
          write_file: 'confirm',
        },
      };

      registry.register(filesystemSkill);

      const skill = registry.getSkill('filesystem');
      expect(skill).toBeDefined();
      expect(skill!.permissions.read_file).toBe('auto');
      expect(skill!.permissions.write_file).toBe('confirm');
    });

    it('allows tool execution when permission is auto', async () => {
      let toolExecuted = false;

      const registry = new SkillRegistry();
      registry.register({
        name: 'filesystem',
        version: '1.0.0',
        description: 'Filesystem skill',
        category: 'bundled',
        tools: [
          {
            name: 'read_file',
            description: 'Read a file',
            parameters: { type: 'object', properties: {} },
            handler: async () => {
              toolExecuted = true;
              return { content: 'file data' };
            },
          },
        ],
        enabled: true,
        permissions: { read_file: 'auto' },
      });

      // Simulate: check permission, approve (auto), execute
      const decision = checker.check('read_file', { read_file: 'auto' });
      expect(decision.decision).toBe('auto');

      // Auto-approved, execute directly
      await registry.execute('read_file', { path: '/tmp/test.txt' });
      expect(toolExecuted).toBe(true);
    });

    it('permission check does not block tool execution in registry', async () => {
      let toolExecuted = false;

      const registry = new SkillRegistry();
      registry.register({
        name: 'filesystem',
        version: '1.0.0',
        description: 'Filesystem skill',
        category: 'bundled',
        tools: [
          {
            name: 'write_file',
            description: 'Write a file',
            parameters: { type: 'object', properties: {} },
            handler: async () => {
              toolExecuted = true;
              return { success: true };
            },
          },
        ],
        enabled: true,
        permissions: { write_file: 'confirm' },
      });

      // Check permission: write_file requires confirmation
      const decision = checker.check('write_file', {});
      expect(decision.decision).toBe('confirm');

      // Simulate: user approves the write operation
      // Then execute the tool
      await registry.execute('write_file', { path: '/tmp/new.txt', content: 'hello' });
      expect(toolExecuted).toBe(true);
    });
  });
});
