/**
 * Unit tests for ShellSkill (T-005: Shell Skill)
 *
 * Test cases:
 * TC-005-1: exec executes echo command successfully
 * TC-005-2: exec returns error for invalid command
 * TC-005-3: exec timeout kills process
 * TC-005-4: exec always confirm permission
 * TC-005-5: exec_sandbox placeholder returns "not implemented"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createShellSkill, getSleepCommand } from '../ShellSkill.js';
import { PermissionChecker } from '../../../permissions/PermissionChecker.js';
import type { ToolResult } from '../../../types.js';

describe('ShellSkill', () => {
  let skill: ReturnType<typeof createShellSkill>;
  let checker: PermissionChecker;

  beforeEach(() => {
    skill = createShellSkill();
    checker = new PermissionChecker();
  });

  // --- TC-005-1: exec executes echo command ---

  describe('TC-005-1: exec executes echo command', () => {
    it('should execute echo and return stdout with exitCode=0', async () => {
      const execTool = skill.tools.find((t) => t.name === 'exec');
      expect(execTool).toBeDefined();

      const result = (await execTool!.handler({ command: 'echo hello' })) as ToolResult;

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as { stdout: string }).stdout).toContain('hello');
      expect((result.data as { exitCode: number }).exitCode).toBe(0);
    });
  });

  // --- TC-005-2: exec returns error for invalid command ---

  describe('TC-005-2: exec returns error for invalid command', () => {
    it('should return success=false with non-zero exitCode for invalid command', async () => {
      const execTool = skill.tools.find((t) => t.name === 'exec');
      expect(execTool).toBeDefined();

      // Use a command that does not exist
      const nonExistentCommand = 'nonexistent_command_xyz_12345';
      const result = (await execTool!.handler({ command: nonExistentCommand })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.data).toBeDefined();
      const exitCode = (result.data as { exitCode: number }).exitCode;
      expect(exitCode).not.toBe(0);
    });

    it('should return error message when command not found', async () => {
      const execTool = skill.tools.find((t) => t.name === 'exec');
      expect(execTool).toBeDefined();

      const result = (await execTool!.handler({
        command: 'nonexistent_command_xyz_12345',
      })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return success=false when command parameter is missing', async () => {
      const execTool = skill.tools.find((t) => t.name === 'exec');
      expect(execTool).toBeDefined();

      const result = (await execTool!.handler({})) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('command');
    });

    it('should return success=false when command parameter is empty string', async () => {
      const execTool = skill.tools.find((t) => t.name === 'exec');
      expect(execTool).toBeDefined();

      const result = (await execTool!.handler({ command: '' })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('command');
    });
  });

  // --- TC-005-3: exec timeout kills process ---

  describe('TC-005-3: exec timeout kills process', () => {
    it('should kill process on timeout and return error containing "timeout"', async () => {
      const execTool = skill.tools.find((t) => t.name === 'exec');
      expect(execTool).toBeDefined();

      const sleepCmd = getSleepCommand(10);
      const result = (await execTool!.handler({
        command: sleepCmd,
        timeout: 1000,
      })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.toLowerCase()).toContain('timeout');
    });

    it('should complete successfully when timeout is not exceeded', async () => {
      const execTool = skill.tools.find((t) => t.name === 'exec');
      expect(execTool).toBeDefined();

      const result = (await execTool!.handler({
        command: 'echo quick',
        timeout: 5000,
      })) as ToolResult;

      expect(result.success).toBe(true);
      expect((result.data as { stdout: string }).stdout).toContain('quick');
    });
  });

  // --- TC-005-4: exec always confirm permission ---

  describe('TC-005-4: exec always confirm permission', () => {
    it('should return confirm decision for exec tool via policy', () => {
      const decision = checker.check('exec', skill.permissions);

      expect(decision.decision).toBe('confirm');
      expect(decision.toolName).toBe('exec');
      expect(decision.category).toBe('exec');
      expect(decision.riskLevel).toBe('high');
    });

    it('should return confirm decision for exec_sandbox tool via policy', () => {
      const decision = checker.check('exec_sandbox', skill.permissions);

      expect(decision.decision).toBe('confirm');
      expect(decision.toolName).toBe('exec_sandbox');
      expect(decision.category).toBe('exec');
      expect(decision.riskLevel).toBe('high');
    });

    it('should have both exec and exec_sandbox in permissions with confirm level', () => {
      expect(skill.permissions['exec']).toBe('confirm');
      expect(skill.permissions['exec_sandbox']).toBe('confirm');
    });

    it('should have both tools defined', () => {
      const toolNames = skill.tools.map((t) => t.name);
      expect(toolNames).toContain('exec');
      expect(toolNames).toContain('exec_sandbox');
    });
  });

  // --- TC-005-5: exec_sandbox placeholder ---

  describe('TC-005-5: exec_sandbox placeholder', () => {
    it('should return success=false with "not implemented" error', async () => {
      const sandboxTool = skill.tools.find((t) => t.name === 'exec_sandbox');
      expect(sandboxTool).toBeDefined();

      const result = (await sandboxTool!.handler({
        command: 'echo hello',
        image: 'ubuntu:latest',
      })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('not implemented');
    });

    it('should return same result regardless of parameters', async () => {
      const sandboxTool = skill.tools.find((t) => t.name === 'exec_sandbox');
      expect(sandboxTool).toBeDefined();

      const result1 = (await sandboxTool!.handler({ command: 'ls' })) as ToolResult;
      const result2 = (await sandboxTool!.handler({ command: 'rm -rf /' })) as ToolResult;

      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
      expect(result1.error).toContain('not implemented');
      expect(result2.error).toContain('not implemented');
    });
  });

  // --- Skill metadata tests ---

  describe('Skill metadata', () => {
    it('should have correct name, version, and category', () => {
      expect(skill.name).toBe('shell');
      expect(skill.version).toBe('0.0.1');
      expect(skill.category).toBe('bundled');
      expect(skill.enabled).toBe(true);
    });

    it('should have a description', () => {
      expect(skill.description).toBeDefined();
      expect(skill.description.length).toBeGreaterThan(0);
    });

    it('should have valid JSON Schema parameters for exec tool', () => {
      const execTool = skill.tools.find((t) => t.name === 'exec');
      expect(execTool).toBeDefined();
      expect(execTool!.parameters.type).toBe('object');
      expect(execTool!.parameters.required).toContain('command');
      expect(execTool!.parameters.properties).toBeDefined();
      expect((execTool!.parameters.properties as Record<string, unknown>)['command']).toBeDefined();
      expect((execTool!.parameters.properties as Record<string, unknown>)['timeout']).toBeDefined();
    });

    it('should have valid JSON Schema parameters for exec_sandbox tool', () => {
      const sandboxTool = skill.tools.find((t) => t.name === 'exec_sandbox');
      expect(sandboxTool).toBeDefined();
      expect(sandboxTool!.parameters.type).toBe('object');
      expect(sandboxTool!.parameters.required).toContain('command');
      expect((sandboxTool!.parameters.properties as Record<string, unknown>)['command']).toBeDefined();
      expect((sandboxTool!.parameters.properties as Record<string, unknown>)['image']).toBeDefined();
    });
  });

  // --- getSleepCommand helper ---

  describe('getSleepCommand', () => {
    it('should return a non-empty string', () => {
      const cmd = getSleepCommand(5);
      expect(typeof cmd).toBe('string');
      expect(cmd.length).toBeGreaterThan(0);
    });

    it('should return different commands based on platform (validated indirectly)', () => {
      const cmd = getSleepCommand(10);
      if (process.platform === 'win32') {
        expect(cmd).toContain('timeout');
      } else {
        expect(cmd).toContain('sleep');
      }
    });
  });
});
