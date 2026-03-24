/**
 * FilesystemSkill unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFilesystemSkill, createFilesystemSkillDefinition } from '../skills/FilesystemSkill.js';

describe('FilesystemSkill', () => {
  let tempDir: string;
  let skill: ReturnType<typeof createFilesystemSkill>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'fs-skill-test-'));
    skill = createFilesystemSkill({
      allowedDirs: [tempDir],
      blockedPatterns: [],
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('definition', () => {
    it('should have correct skill name', () => {
      expect(skill.definition.name).toBe('filesystem');
    });

    it('should have correct version', () => {
      expect(skill.definition.version).toBe('1.0.0');
    });

    it('should have 6 tools', () => {
      expect(skill.definition.tools).toHaveLength(6);
    });

    it('should have all expected tool names', () => {
      const toolNames = skill.definition.tools.map((t) => t.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('write_file');
      expect(toolNames).toContain('list_directory');
      expect(toolNames).toContain('search_files');
      expect(toolNames).toContain('move_file');
      expect(toolNames).toContain('delete_file');
    });
  });

  describe('createFilesystemSkillDefinition', () => {
    it('should return a valid skill definition', () => {
      const def = createFilesystemSkillDefinition();
      expect(def.name).toBe('filesystem');
      expect(def.tools.length).toBe(6);
    });
  });

  describe('read_file', () => {
    it('should read a file within allowed directory', async () => {
      const testFile = join(tempDir, 'test.txt');
      writeFileSync(testFile, 'hello world');

      const executor = skill.executors['read_file']!;
      const result = await executor(
        { path: testFile },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'read_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('hello world');
    });

    it('should reject reading files outside allowed directory', async () => {
      const executor = skill.executors['read_file']!;
      const result = await executor(
        { path: '/etc/passwd' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'read_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('outside allowed directories');
    });

    it('should return error for non-existent file', async () => {
      const executor = skill.executors['read_file']!;
      const result = await executor(
        { path: join(tempDir, 'nonexistent.txt') },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'read_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('write_file', () => {
    it('should write a file within allowed directory', async () => {
      const testFile = join(tempDir, 'output.txt');

      const executor = skill.executors['write_file']!;
      const result = await executor(
        { path: testFile, content: 'test content' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'write_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('written successfully');
    });

    it('should create parent directories when writing', async () => {
      const testFile = join(tempDir, 'sub', 'dir', 'file.txt');

      const executor = skill.executors['write_file']!;
      const result = await executor(
        { path: testFile, content: 'nested content' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'write_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
    });

    it('should reject writing outside allowed directory', async () => {
      const executor = skill.executors['write_file']!;
      const result = await executor(
        { path: '/tmp/evil.txt', content: 'hack' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'write_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
    });
  });

  describe('list_directory', () => {
    it('should list directory contents', async () => {
      mkdirSync(join(tempDir, 'subdir'));
      writeFileSync(join(tempDir, 'file1.txt'), 'a');
      writeFileSync(join(tempDir, 'file2.txt'), 'b');

      const executor = skill.executors['list_directory']!;
      const result = await executor(
        { path: tempDir },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'list_directory', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('file1.txt');
      expect(result.output).toContain('file2.txt');
      expect(result.output).toContain('subdir');
    });

    it('should reject listing outside allowed directory', async () => {
      const executor = skill.executors['list_directory']!;
      const result = await executor(
        { path: '/etc' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'list_directory', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
    });

    it('should return error for non-existent directory', async () => {
      const executor = skill.executors['list_directory']!;
      const result = await executor(
        { path: join(tempDir, 'nonexistent') },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'list_directory', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
    });
  });

  describe('search_files', () => {
    it('should search for files matching a pattern', async () => {
      mkdirSync(join(tempDir, 'src'));
      writeFileSync(join(tempDir, 'src', 'app.ts'), 'export');
      writeFileSync(join(tempDir, 'src', 'util.ts'), 'util');
      writeFileSync(join(tempDir, 'src', 'readme.md'), 'readme');

      const executor = skill.executors['search_files']!;
      const result = await executor(
        { pattern: '**/*.ts', directory: tempDir },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'search_files', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('.ts');
    });

    it('should reject search outside allowed directory', async () => {
      const executor = skill.executors['search_files']!;
      const result = await executor(
        { pattern: '*.txt', directory: '/etc' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'search_files', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
    });
  });

  describe('move_file', () => {
    it('should move a file', async () => {
      const source = join(tempDir, 'original.txt');
      const target = join(tempDir, 'moved.txt');
      writeFileSync(source, 'content');

      const executor = skill.executors['move_file']!;
      const result = await executor(
        { source, target },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'move_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('moved');
    });

    it('should reject moving files from outside allowed directory', async () => {
      const executor = skill.executors['move_file']!;
      const result = await executor(
        { source: '/etc/passwd', target: join(tempDir, 'stolen.txt') },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'move_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
    });
  });

  describe('delete_file', () => {
    it('should delete a file', async () => {
      const testFile = join(tempDir, 'to-delete.txt');
      writeFileSync(testFile, 'delete me');

      const executor = skill.executors['delete_file']!;
      const result = await executor(
        { path: testFile },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'delete_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('deleted');
    });

    it('should reject deleting directories', async () => {
      const dir = join(tempDir, 'dir-to-delete');
      mkdirSync(dir);

      const executor = skill.executors['delete_file']!;
      const result = await executor(
        { path: dir },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'delete_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('directories');
    });

    it('should reject deleting outside allowed directory', async () => {
      const executor = skill.executors['delete_file']!;
      const result = await executor(
        { path: '/etc/passwd' },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'delete_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
    });
  });

  describe('blocked patterns', () => {
    it('should block operations on files matching blocked patterns', async () => {
      const secureSkill = createFilesystemSkill({
        allowedDirs: [tempDir],
        blockedPatterns: ['\\.secret$'],
      });

      const secretFile = join(tempDir, 'config.secret');
      writeFileSync(secretFile, 'sensitive');

      const executor = secureSkill.executors['read_file']!;
      const result = await executor(
        { path: secretFile },
        {
          sessionId: 'test',
          toolCall: { id: '1', name: 'read_file', parameters: {} },
          config: {},
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked pattern');
    });
  });
});
