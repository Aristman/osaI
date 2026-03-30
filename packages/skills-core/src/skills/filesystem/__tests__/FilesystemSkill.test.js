/**
 * @osai/skills-core -- FilesystemSkill Tests (DOMAIN-003)
 *
 * TC-004-1 through TC-004-10: All filesystem skill tests.
 * Uses temp directory fixtures (beforeEach/afterEach).
 *
 * Handlers return raw data (registry.execute wraps into ToolResult).
 * Handlers throw Error on failure (registry.execute catches into ToolResult).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFilesystemSkill } from '../FilesystemSkill.js';
import { SkillRegistry } from '../../../registry/SkillRegistry.js';
describe('FilesystemSkill', () => {
    let skill;
    let tempDir;
    let registry;
    beforeEach(() => {
        skill = createFilesystemSkill();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osai-fs-test-'));
        registry = new SkillRegistry();
    });
    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    // --- Skill Definition Tests ---
    describe('skill definition', () => {
        it('should create a valid SkillDefinition', () => {
            expect(skill.name).toBe('filesystem');
            expect(skill.version).toBe('1.0.0');
            expect(skill.category).toBe('bundled');
            expect(skill.enabled).toBe(true);
        });
        it('should have 7 tools', () => {
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
        it('should have correct permission mapping', () => {
            expect(skill.permissions['read_file']).toBe('auto');
            expect(skill.permissions['list_dir']).toBe('auto');
            expect(skill.permissions['search_files']).toBe('auto');
            expect(skill.permissions['get_file_info']).toBe('auto');
            expect(skill.permissions['write_file']).toBe('confirm');
            expect(skill.permissions['move_file']).toBe('confirm');
            expect(skill.permissions['delete_file']).toBe('confirm');
        });
        it('should register in SkillRegistry', () => {
            registry.register(skill);
            const registered = registry.getSkill('filesystem');
            expect(registered).toBeDefined();
            expect(registered.name).toBe('filesystem');
        });
    });
    // --- TC-004-1: read_file reads an existing file ---
    describe('read_file', () => {
        it('TC-004-1: should read an existing file', async () => {
            const filePath = path.join(tempDir, 'hello.txt');
            fs.writeFileSync(filePath, 'Hello, world!', 'utf-8');
            const handler = skill.tools.find((t) => t.name === 'read_file').handler;
            const result = await handler({ path: filePath });
            expect(result).toBe('Hello, world!');
        });
        it('TC-004-2: should throw error for non-existent file', async () => {
            const filePath = path.join(tempDir, 'nonexistent.txt');
            const handler = skill.tools.find((t) => t.name === 'read_file').handler;
            await expect(handler({ path: filePath })).rejects.toThrow();
        });
    });
    // --- TC-004-3/TC-004-4: write_file ---
    describe('write_file', () => {
        it('TC-004-3: should create a new file', async () => {
            const filePath = path.join(tempDir, 'new-file.txt');
            const handler = skill.tools.find((t) => t.name === 'write_file').handler;
            const result = await handler({ path: filePath, content: 'new content' });
            expect(result).toEqual({ path: expect.any(String) });
            expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
        });
        it('TC-004-4: should overwrite an existing file', async () => {
            const filePath = path.join(tempDir, 'overwrite.txt');
            fs.writeFileSync(filePath, 'old content', 'utf-8');
            const handler = skill.tools.find((t) => t.name === 'write_file').handler;
            const result = await handler({ path: filePath, content: 'new content' });
            expect(result).toEqual({ path: expect.any(String) });
            expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
        });
    });
    // --- TC-004-5/TC-004-6: list_dir ---
    describe('list_dir', () => {
        it('TC-004-5: should list files in a directory', async () => {
            fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a');
            fs.writeFileSync(path.join(tempDir, 'b.txt'), 'b');
            fs.mkdirSync(path.join(tempDir, 'subdir'));
            const handler = skill.tools.find((t) => t.name === 'list_dir').handler;
            const result = await handler({ path: tempDir });
            expect(Array.isArray(result)).toBe(true);
            const entries = result;
            expect(entries).toHaveLength(3);
            const names = entries.map((e) => e.name).sort();
            expect(names).toEqual(['a.txt', 'b.txt', 'subdir']);
            const subdir = entries.find((e) => e.name === 'subdir');
            expect(subdir.type).toBe('dir');
            const file = entries.find((e) => e.name === 'a.txt');
            expect(file.type).toBe('file');
        });
        it('TC-004-6: should return empty array for empty directory', async () => {
            const handler = skill.tools.find((t) => t.name === 'list_dir').handler;
            const result = await handler({ path: tempDir });
            expect(result).toEqual([]);
        });
    });
    // --- TC-004-7: search_files ---
    describe('search_files', () => {
        it('TC-004-7: should find files matching a glob pattern', async () => {
            fs.writeFileSync(path.join(tempDir, 'a.ts'), '');
            fs.writeFileSync(path.join(tempDir, 'b.ts'), '');
            fs.writeFileSync(path.join(tempDir, 'c.txt'), '');
            fs.mkdirSync(path.join(tempDir, 'nested'));
            fs.writeFileSync(path.join(tempDir, 'nested', 'd.ts'), '');
            const handler = skill.tools.find((t) => t.name === 'search_files').handler;
            const result = await handler({ pattern: '**/*.ts', directory: tempDir });
            expect(Array.isArray(result)).toBe(true);
            const files = result;
            expect(files).toHaveLength(3);
            expect(files.every((f) => f.endsWith('.ts'))).toBe(true);
        });
    });
    // --- TC-004-8: move_file ---
    describe('move_file', () => {
        it('TC-004-8: should move a file', async () => {
            const source = path.join(tempDir, 'original.txt');
            const dest = path.join(tempDir, 'moved.txt');
            fs.writeFileSync(source, 'content', 'utf-8');
            const handler = skill.tools.find((t) => t.name === 'move_file').handler;
            const result = await handler({ source, destination: dest });
            expect(result).toEqual({ from: expect.any(String), to: expect.any(String) });
            expect(fs.existsSync(source)).toBe(false);
            expect(fs.existsSync(dest)).toBe(true);
            expect(fs.readFileSync(dest, 'utf-8')).toBe('content');
        });
    });
    // --- TC-004-9: delete_file ---
    describe('delete_file', () => {
        it('TC-004-9: should delete a file', async () => {
            const filePath = path.join(tempDir, 'delete-me.txt');
            fs.writeFileSync(filePath, 'content', 'utf-8');
            const handler = skill.tools.find((t) => t.name === 'delete_file').handler;
            const result = await handler({ path: filePath });
            expect(result).toEqual({ path: expect.any(String) });
            expect(fs.existsSync(filePath)).toBe(false);
        });
    });
    // --- TC-004-10: get_file_info ---
    describe('get_file_info', () => {
        it('TC-004-10: should return file metadata', async () => {
            const filePath = path.join(tempDir, 'info.txt');
            fs.writeFileSync(filePath, 'some content for testing', 'utf-8');
            const handler = skill.tools.find((t) => t.name === 'get_file_info').handler;
            const result = await handler({ path: filePath });
            expect(result).toEqual({
                size: expect.any(Number),
                mtime: expect.any(String),
                type: 'file',
            });
            const data = result;
            expect(data.size).toBeGreaterThan(0);
            expect(data.type).toBe('file');
        });
        it('should return type "dir" for a directory', async () => {
            const dirPath = path.join(tempDir, 'subdir');
            fs.mkdirSync(dirPath);
            const handler = skill.tools.find((t) => t.name === 'get_file_info').handler;
            const result = await handler({ path: dirPath });
            expect(result).toEqual({
                size: expect.any(Number),
                mtime: expect.any(String),
                type: 'dir',
            });
        });
    });
    // --- Registry Integration Tests ---
    describe('registry integration', () => {
        it('should execute tools through SkillRegistry (wraps into ToolResult)', async () => {
            registry.register(skill);
            const filePath = path.join(tempDir, 'registry-test.txt');
            fs.writeFileSync(filePath, 'registry content', 'utf-8');
            const result = await registry.execute('read_file', { path: filePath });
            expect(result).toEqual({ success: true, data: 'registry content' });
        });
        it('should return error ToolResult when handler throws via registry', async () => {
            registry.register(skill);
            const result = await registry.execute('read_file', {
                path: path.join(tempDir, 'nonexistent.txt'),
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('no such file');
        });
        it('should expose all 7 tools via getTools()', () => {
            registry.register(skill);
            const tools = registry.getTools();
            expect(tools).toHaveLength(7);
            const names = tools.map((t) => t.name);
            expect(names).toContain('read_file');
            expect(names).toContain('write_file');
            expect(names).toContain('list_dir');
            expect(names).toContain('search_files');
            expect(names).toContain('move_file');
            expect(names).toContain('delete_file');
            expect(names).toContain('get_file_info');
        });
        it('should respect enable/disable', () => {
            registry.register(skill);
            registry.disable('filesystem');
            const tools = registry.getTools();
            expect(tools).toHaveLength(0);
            registry.enable('filesystem');
            const toolsEnabled = registry.getTools();
            expect(toolsEnabled).toHaveLength(7);
        });
    });
    // --- search_files edge cases ---
    describe('search_files edge cases', () => {
        it('should find files with simple *.ext pattern', async () => {
            fs.writeFileSync(path.join(tempDir, 'a.log'), '');
            fs.writeFileSync(path.join(tempDir, 'b.log'), '');
            fs.writeFileSync(path.join(tempDir, 'c.txt'), '');
            const handler = skill.tools.find((t) => t.name === 'search_files').handler;
            const result = await handler({ pattern: '*.log', directory: tempDir });
            const files = result;
            expect(files).toHaveLength(2);
        });
        it('should return empty array when no files match', async () => {
            fs.writeFileSync(path.join(tempDir, 'a.txt'), '');
            const handler = skill.tools.find((t) => t.name === 'search_files').handler;
            const result = await handler({ pattern: '*.log', directory: tempDir });
            const files = result;
            expect(files).toHaveLength(0);
        });
    });
    // --- Error handling ---
    describe('error handling', () => {
        it('should throw when read_file path is missing', async () => {
            const handler = skill.tools.find((t) => t.name === 'read_file').handler;
            await expect(handler({})).rejects.toThrow('Parameter "path" is required');
        });
        it('should throw when write_file path is missing', async () => {
            const handler = skill.tools.find((t) => t.name === 'write_file').handler;
            await expect(handler({ content: 'test' })).rejects.toThrow('Parameter "path" is required');
        });
        it('should throw when move_file source is missing', async () => {
            const handler = skill.tools.find((t) => t.name === 'move_file').handler;
            await expect(handler({ destination: '/tmp/dest' })).rejects.toThrow('Parameters "source" and "destination" are required');
        });
    });
});
//# sourceMappingURL=FilesystemSkill.test.js.map