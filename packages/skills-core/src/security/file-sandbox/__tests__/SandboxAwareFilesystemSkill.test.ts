/**
 * @osai/skills-core -- SandboxAwareFilesystemSkill Unit Tests (DOMAIN-003, T-002)
 *
 * Tests defined in ROADMAP_TASKS_F-012.md, section T-002:
 * - TC-002-1: read_file inside allowed_dirs -- OK (ToolResult.success = true)
 * - TC-002-2: write_file outside allowed_dirs -- BLOCKED (ToolResult.success = false)
 * - TC-002-3: delete_file matches blocked_pattern -- BLOCKED (ToolResult.success = false)
 * - TC-002-4: list_dir inside allowed_dirs -- OK (ToolResult.success = true)
 * - TC-002-5: symlink escape via move_file -- BLOCKED
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSandboxAwareFilesystemSkill } from '../SandboxAwareFilesystemSkill.js';
import { FileSandbox } from '../FileSandbox.js';
import type { SkillDefinition, ToolResult } from '../../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;
let allowedDir: string;

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'osai-sandbox-skill-test-'));
}

function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Check if symlink creation is supported (elevated privileges on Windows).
 */
function canCreateSymlinks(): boolean {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osai-symlink-skill-check-'));
  try {
    const target = path.join(testDir, 'target.txt');
    const link = path.join(testDir, 'link.txt');
    fs.writeFileSync(target, 'x');
    fs.symlinkSync(target, link);
    fs.unlinkSync(link);
    return true;
  } catch {
    return false;
  } finally {
    cleanupTempDir(testDir);
  }
}

const hasSymlinkSupport = canCreateSymlinks();

function createSandboxAndSkill(allowedDirs: string[]): SkillDefinition {
  const sandbox = new FileSandbox({
    allowedDirs: allowedDirs.map((d) => path.resolve(d)),
    blockedPatterns: ['~/.ssh/**', '~/.gnupg/**', '/etc/**', '/boot/**'],
  });
  return createSandboxAwareFilesystemSkill(sandbox);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SandboxAwareFilesystemSkill', () => {
  beforeEach(() => {
    tempDir = createTempDir();
    allowedDir = path.join(tempDir, 'allowed');
    fs.mkdirSync(allowedDir, { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  // -------------------------------------------------------------------------
  // Skill definition integrity
  // -------------------------------------------------------------------------

  describe('skill definition', () => {
    it('should create a valid SkillDefinition with 7 tools', () => {
      const skill = createSandboxAndSkill([allowedDir]);

      expect(skill.name).toBe('filesystem');
      expect(skill.version).toBe('1.0.0');
      expect(skill.category).toBe('bundled');
      expect(skill.enabled).toBe(true);
      expect(skill.tools).toHaveLength(7);

      const toolNames = skill.tools.map((t) => t.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('write_file');
      expect(toolNames).toContain('list_dir');
      expect(toolNames).toContain('search_files');
      expect(toolNames).toContain('move_file');
      expect(toolNames).toContain('delete_file');
      expect(toolNames).toContain('get_file_info');
    });

    it('should preserve original permission mapping', () => {
      const skill = createSandboxAndSkill([allowedDir]);

      expect(skill.permissions['read_file']).toBe('auto');
      expect(skill.permissions['list_dir']).toBe('auto');
      expect(skill.permissions['search_files']).toBe('auto');
      expect(skill.permissions['get_file_info']).toBe('auto');
      expect(skill.permissions['write_file']).toBe('confirm');
      expect(skill.permissions['move_file']).toBe('confirm');
      expect(skill.permissions['delete_file']).toBe('confirm');
    });
  });

  // -------------------------------------------------------------------------
  // TC-002-1: read_file inside allowed_dirs -- OK
  // -------------------------------------------------------------------------

  describe('TC-002-1: read_file inside allowed_dirs -- OK', () => {
    it('should return ToolResult with success=true for read inside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const testFile = path.join(allowedDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello, sandbox!', 'utf-8');

      const handler = skill.tools.find((t) => t.name === 'read_file')!.handler;
      const result = (await handler({ path: testFile })) as ToolResult;

      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello, sandbox!');
    });

    it('should return ToolResult with success=true for nested read inside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const nestedDir = path.join(allowedDir, 'a', 'b', 'c');
      fs.mkdirSync(nestedDir, { recursive: true });
      const nestedFile = path.join(nestedDir, 'deep.txt');
      fs.writeFileSync(nestedFile, 'deep content', 'utf-8');

      const handler = skill.tools.find((t) => t.name === 'read_file')!.handler;
      const result = (await handler({ path: nestedFile })) as ToolResult;

      expect(result.success).toBe(true);
      expect(result.data).toBe('deep content');
    });
  });

  // -------------------------------------------------------------------------
  // TC-002-2: write_file outside allowed_dirs -- BLOCKED
  // -------------------------------------------------------------------------

  describe('TC-002-2: write_file outside allowed_dirs -- BLOCKED', () => {
    it('should return ToolResult with success=false and sandbox violation error', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const outsidePath = path.join(tempDir, 'outside-dir', 'blocked.txt');

      const handler = skill.tools.find((t) => t.name === 'write_file')!.handler;
      const result = (await handler({ path: outsidePath, content: 'should not write' })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('sandbox violation');
      expect(result.data).toBeUndefined();

      // Verify the file was NOT actually created
      expect(fs.existsSync(outsidePath)).toBe(false);
    });

    it('should block write_file to /etc/passwd (blocked pattern)', async () => {
      const skill = createSandboxAndSkill([allowedDir]);

      const handler = skill.tools.find((t) => t.name === 'write_file')!.handler;
      const result = (await handler({ path: '/etc/passwd', content: 'hacked' })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('sandbox violation');
    });
  });

  // -------------------------------------------------------------------------
  // TC-002-3: delete_file matches blocked_pattern -- BLOCKED
  // -------------------------------------------------------------------------

  describe('TC-002-3: delete_file matches blocked_pattern -- BLOCKED', () => {
    it('should return ToolResult with success=false for delete matching blocked_pattern', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const sshPath = path.join(os.homedir(), '.ssh', 'id_rsa');

      const handler = skill.tools.find((t) => t.name === 'delete_file')!.handler;
      const result = (await handler({ path: sshPath })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('sandbox violation');
    });

    it('should return ToolResult with success=false for delete matching ~/.gnupg/**', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const gnupgPath = path.join(os.homedir(), '.gnupg', 'private-keys-v1.d');

      const handler = skill.tools.find((t) => t.name === 'delete_file')!.handler;
      const result = (await handler({ path: gnupgPath })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('sandbox violation');
    });
  });

  // -------------------------------------------------------------------------
  // TC-002-4: list_dir inside allowed_dirs -- OK
  // -------------------------------------------------------------------------

  describe('TC-002-4: list_dir inside allowed_dirs -- OK', () => {
    it('should return ToolResult with success=true for list_dir inside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      fs.writeFileSync(path.join(allowedDir, 'a.txt'), 'a');
      fs.writeFileSync(path.join(allowedDir, 'b.txt'), 'b');
      fs.mkdirSync(path.join(allowedDir, 'subdir'));

      const handler = skill.tools.find((t) => t.name === 'list_dir')!.handler;
      const result = (await handler({ path: allowedDir })) as ToolResult;

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      const entries = result.data as Array<{ name: string; type: string }>;
      expect(entries).toHaveLength(3);
    });

    it('should return ToolResult with success=false for list_dir outside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const outsideDir = path.join(tempDir, 'outside-list');

      const handler = skill.tools.find((t) => t.name === 'list_dir')!.handler;
      const result = (await handler({ path: outsideDir })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('sandbox violation');
    });
  });

  // -------------------------------------------------------------------------
  // TC-002-5: symlink escape via move_file -- BLOCKED
  // -------------------------------------------------------------------------

  describe('TC-002-5: symlink escape via move_file -- BLOCKED', () => {
    it.skipIf(!hasSymlinkSupport)(
      'should block move_file when destination is outside allowed_dirs',
      async () => {
        const skill = createSandboxAndSkill([allowedDir]);
        const sourceFile = path.join(allowedDir, 'move-source.txt');
        fs.writeFileSync(sourceFile, 'source content', 'utf-8');

        const escapeDir = path.join(tempDir, 'escaped');
        fs.mkdirSync(escapeDir);
        const escapeDest = path.join(escapeDir, 'escaped-file.txt');

        const handler = skill.tools.find((t) => t.name === 'move_file')!.handler;
        const result = (await handler({
          source: sourceFile,
          destination: escapeDest,
        })) as ToolResult;

        expect(result.success).toBe(false);
        expect(result.error).toContain('sandbox violation');

        // Verify source file still exists (move was not performed)
        expect(fs.existsSync(sourceFile)).toBe(true);
      },
    );

    it.skipIf(!hasSymlinkSupport)(
      'should block move_file when source is a symlink escaping allowed_dirs',
      async () => {
        const skill = createSandboxAndSkill([allowedDir]);

        // Create a real file outside allowed_dirs
        const outsideFile = path.join(tempDir, 'outside-real.txt');
        fs.writeFileSync(outsideFile, 'outside content', 'utf-8');

        // Create a symlink inside allowed_dir pointing to the outside file
        const symlinkInAllowed = path.join(allowedDir, 'escape-link.txt');
        fs.symlinkSync(outsideFile, symlinkInAllowed);

        const destInAllowed = path.join(allowedDir, 'moved.txt');

        const handler = skill.tools.find((t) => t.name === 'move_file')!.handler;
        const result = (await handler({
          source: symlinkInAllowed,
          destination: destInAllowed,
        })) as ToolResult;

        // The source symlink resolves to outside -- sandbox violation
        expect(result.success).toBe(false);
        expect(result.error).toContain('sandbox violation');
      },
    );
  });

  // -------------------------------------------------------------------------
  // All 7 tools -- sandbox validation coverage
  // -------------------------------------------------------------------------

  describe('all 7 tools pass through FileSandbox.validate()', () => {
    it('search_files: should block when directory is outside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const outsideDir = path.join(tempDir, 'outside-search');

      const handler = skill.tools.find((t) => t.name === 'search_files')!.handler;
      const result = (await handler({
        pattern: '*.ts',
        directory: outsideDir,
      })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('sandbox violation');
    });

    it('search_files: should succeed when directory is inside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      fs.writeFileSync(path.join(allowedDir, 'a.ts'), '');
      fs.writeFileSync(path.join(allowedDir, 'b.txt'), '');

      const handler = skill.tools.find((t) => t.name === 'search_files')!.handler;
      const result = (await handler({
        pattern: '*.ts',
        directory: allowedDir,
      })) as ToolResult;

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('get_file_info: should block when path is outside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const outsideFile = path.join(tempDir, 'outside-info.txt');
      fs.writeFileSync(outsideFile, 'info');

      const handler = skill.tools.find((t) => t.name === 'get_file_info')!.handler;
      const result = (await handler({ path: outsideFile })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('sandbox violation');
    });

    it('get_file_info: should succeed when path is inside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const testFile = path.join(allowedDir, 'info-test.txt');
      fs.writeFileSync(testFile, 'info content', 'utf-8');

      const handler = skill.tools.find((t) => t.name === 'get_file_info')!.handler;
      const result = (await handler({ path: testFile })) as ToolResult;

      expect(result.success).toBe(true);
      const data = result.data as { size: number; type: string };
      expect(data.size).toBeGreaterThan(0);
      expect(data.type).toBe('file');
    });

    it('move_file: should succeed when both source and destination are inside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const source = path.join(allowedDir, 'move-ok.txt');
      const dest = path.join(allowedDir, 'moved-ok.txt');
      fs.writeFileSync(source, 'content', 'utf-8');

      const handler = skill.tools.find((t) => t.name === 'move_file')!.handler;
      const result = (await handler({
        source,
        destination: dest,
      })) as ToolResult;

      expect(result.success).toBe(true);
      expect(fs.existsSync(source)).toBe(false);
      expect(fs.existsSync(dest)).toBe(true);
    });

    it('move_file: should block when source is outside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const outsideSource = path.join(tempDir, 'outside-move.txt');
      fs.writeFileSync(outsideSource, 'content');
      const dest = path.join(allowedDir, 'dest.txt');

      const handler = skill.tools.find((t) => t.name === 'move_file')!.handler;
      const result = (await handler({
        source: outsideSource,
        destination: dest,
      })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('sandbox violation');
    });

    it('delete_file: should block when path is outside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const outsideFile = path.join(tempDir, 'outside-delete.txt');
      fs.writeFileSync(outsideFile, 'should not delete');

      const handler = skill.tools.find((t) => t.name === 'delete_file')!.handler;
      const result = (await handler({ path: outsideFile })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('sandbox violation');
      // Verify file still exists
      expect(fs.existsSync(outsideFile)).toBe(true);
    });

    it('delete_file: should succeed when path is inside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const testFile = path.join(allowedDir, 'delete-me.txt');
      fs.writeFileSync(testFile, 'delete this', 'utf-8');

      const handler = skill.tools.find((t) => t.name === 'delete_file')!.handler;
      const result = (await handler({ path: testFile })) as ToolResult;

      expect(result.success).toBe(true);
      expect(fs.existsSync(testFile)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // ToolResult structure on sandbox violation
  // -------------------------------------------------------------------------

  describe('ToolResult structure on sandbox violation', () => {
    it('should include error message with "sandbox violation" text', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const outside = path.join(tempDir, 'violation.txt');

      const handler = skill.tools.find((t) => t.name === 'read_file')!.handler;
      const result = (await handler({ path: outside })) as ToolResult;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('sandbox violation');
      expect(result.data).toBeUndefined();
    });

    it('should preserve ToolResult format consistent with SkillRegistry.execute()', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const outside = path.join(tempDir, 'format.txt');

      const handler = skill.tools.find((t) => t.name === 'write_file')!.handler;
      const result = (await handler({ path: outside, content: 'x' })) as ToolResult;

      // Must have exactly { success, error } with correct types
      expect('success' in result).toBe(true);
      expect('error' in result).toBe(true);
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.error).toBe('string');
    });
  });

  // -------------------------------------------------------------------------
  // Multiple allowed_dirs
  // -------------------------------------------------------------------------

  describe('multiple allowed_dirs', () => {
    it('should allow operations in any of the allowed directories', async () => {
      const secondDir = path.join(tempDir, 'allowed2');
      fs.mkdirSync(secondDir, { recursive: true });

      const skill = createSandboxAndSkill([allowedDir, secondDir]);

      // Write and read in first dir
      const handler = skill.tools.find((t) => t.name === 'write_file')!.handler;
      const file1 = path.join(allowedDir, 'first.txt');
      const result1 = (await handler({ path: file1, content: 'first' })) as ToolResult;
      expect(result1.success).toBe(true);

      // Write and read in second dir
      const file2 = path.join(secondDir, 'second.txt');
      const result2 = (await handler({ path: file2, content: 'second' })) as ToolResult;
      expect(result2.success).toBe(true);

      // Block outside both
      const outside = path.join(tempDir, 'outside.txt');
      const result3 = (await handler({ path: outside, content: 'blocked' })) as ToolResult;
      expect(result3.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Handler error forwarding (non-sandbox errors)
  // -------------------------------------------------------------------------

  describe('handler error forwarding', () => {
    it('should return ToolResult with success=false for non-existent file inside allowed_dirs', async () => {
      const skill = createSandboxAndSkill([allowedDir]);
      const missingFile = path.join(allowedDir, 'does-not-exist.txt');

      const handler = skill.tools.find((t) => t.name === 'read_file')!.handler;
      const result = (await handler({ path: missingFile })) as ToolResult;

      // File is in allowed dir, so sandbox passes, but handler fails
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
