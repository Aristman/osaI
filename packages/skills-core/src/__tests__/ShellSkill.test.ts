/**
 * ShellSkill unit tests
 */

import { describe, it, expect } from 'vitest';
import { createShellSkill, createShellSkillDefinition } from '../skills/ShellSkill.js';

describe('ShellSkill', () => {
  describe('definition', () => {
    it('should have correct skill name', () => {
      const { definition } = createShellSkill();
      expect(definition.name).toBe('shell');
    });

    it('should have correct version', () => {
      const { definition } = createShellSkill();
      expect(definition.version).toBe('1.0.0');
    });

    it('should have 1 tool', () => {
      const { definition } = createShellSkill();
      expect(definition.tools).toHaveLength(1);
    });

    it('should have execute tool', () => {
      const { definition } = createShellSkill();
      expect(definition.tools[0]!.name).toBe('execute');
    });
  });

  describe('createShellSkillDefinition', () => {
    it('should return a valid skill definition', () => {
      const def = createShellSkillDefinition();
      expect(def.name).toBe('shell');
      expect(def.tools.length).toBe(1);
    });
  });

  describe('execute tool', () => {
    it('should execute a safe command', async () => {
      const { executors } = createShellSkill();
      const result = await executors['execute']!(
        { command: 'echo hello' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'execute', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('hello');
    });

    it('should execute ls command', async () => {
      const { executors } = createShellSkill();
      const result = await executors['execute']!(
        { command: 'ls /tmp' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'execute', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
    });

    it('should reject blocked commands', async () => {
      const { executors } = createShellSkill();
      const result = await executors['execute']!(
        { command: 'rm -rf /' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'execute', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked');
    });

    it('should reject empty commands', async () => {
      const { executors } = createShellSkill();
      const result = await executors['execute']!(
        { command: '' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'execute', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
    });

    it('should handle command failure', async () => {
      const { executors } = createShellSkill();
      const result = await executors['execute']!(
        { command: 'false' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'execute', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should sanitize commands before execution', async () => {
      const { executors } = createShellSkill();
      const result = await executors['execute']!(
        { command: '  echo   test  ' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'execute', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('test');
    });

    it('should use custom timeout', async () => {
      const { executors } = createShellSkill({ timeout: 1000 });
      const result = await executors['execute']!(
        { command: 'sleep 10', timeout: 500 },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'execute', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });
});
