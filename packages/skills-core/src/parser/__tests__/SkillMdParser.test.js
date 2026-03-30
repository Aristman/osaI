/**
 * @osai/skills-core -- SkillMdParser Unit Tests (T-002)
 *
 * Tests TC-002-1 through TC-002-6 from ROADMAP_TASKS_F-007.md
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillMdParser } from '../SkillMdParser.js';
import { SkillMdValidator } from '../SkillMdValidator.js';
// --- Fixture helpers ---
const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');
function readFixture(name) {
    return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}
// --- Tests ---
describe('SkillMdParser', () => {
    describe('TC-002-1: parses valid SKILL.md with frontmatter', () => {
        it('should return SkillDefinition with name, tools, and permissions', () => {
            const content = readFixture('valid-skill.md');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            const result = parser.parse(content);
            expect(result.name).toBe('filesystem');
            expect(result.version).toBe('1.0.0');
            expect(result.description).toBe('Filesystem operations skill');
            expect(result.category).toBe('bundled');
            expect(result.enabled).toBe(true);
            expect(result.tools).toHaveLength(1);
            expect(result.tools[0].name).toBe('read_file');
            expect(result.tools[0].description).toBe('Reads the content of a text file from the filesystem.');
            expect(result.tools[0].parameters.type).toBe('object');
            expect(result.permissions).toEqual({ read_file: 'auto', write_file: 'confirm' });
        });
        it('should extract JSON Schema parameters from tool definition', () => {
            const content = readFixture('valid-skill.md');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            const result = parser.parse(content);
            const toolParams = result.tools[0].parameters;
            expect(toolParams.type).toBe('object');
            expect(toolParams.required).toEqual(['path']);
            expect(toolParams.properties).toBeDefined();
            expect(toolParams.properties['path']).toBeDefined();
        });
    });
    describe('TC-002-2: parses SKILL.md with multiple tools', () => {
        it('should return SkillDefinition with N tools', () => {
            const content = readFixture('multi-tool.md');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            const result = parser.parse(content);
            expect(result.tools).toHaveLength(2);
            const toolNames = result.tools.map((t) => t.name);
            expect(toolNames).toContain('exec');
            expect(toolNames).toContain('exec_sandbox');
        });
        it('should correctly parse parameters for each tool', () => {
            const content = readFixture('multi-tool.md');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            const result = parser.parse(content);
            const execTool = result.tools.find((t) => t.name === 'exec');
            expect(execTool.parameters.required).toEqual(['command']);
            expect(execTool.parameters.properties['timeout']).toBeDefined();
            const sandboxTool = result.tools.find((t) => t.name === 'exec_sandbox');
            expect(sandboxTool.parameters.required).toEqual(['command']);
            expect(sandboxTool.parameters.properties['image']).toBeDefined();
        });
    });
    describe('TC-002-3: throws when name is missing', () => {
        it('should throw an error when required field name is absent', () => {
            const content = readFixture('missing-name.md');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            expect(() => parser.parse(content)).toThrow(/name.*required/i);
        });
    });
    describe('TC-002-4: throws on invalid JSON Schema in tool', () => {
        it('should throw an error with path info on invalid JSON Schema', () => {
            const content = readFixture('invalid-schema.md');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            expect(() => parser.parse(content)).toThrow(/broken_tool/i);
        });
    });
    describe('TC-002-5: scanner finds all SKILL.md in a directory', () => {
        let tempDir;
        beforeEach(() => {
            tempDir = join(tmpdir(), `skill-md-parser-test-${Date.now()}`);
            mkdirSync(tempDir, { recursive: true });
            // Write fixture skills
            mkdirSync(join(tempDir, 'skill-a'), { recursive: true });
            writeFileSync(join(tempDir, 'skill-a', 'SKILL.md'), readFixture('valid-skill.md'));
            mkdirSync(join(tempDir, 'skill-b'), { recursive: true });
            writeFileSync(join(tempDir, 'skill-b', 'SKILL.md'), readFixture('multi-tool.md'));
        });
        afterEach(() => {
            rmSync(tempDir, { recursive: true, force: true });
        });
        it('should return array of SkillDefinition from all SKILL.md files', async () => {
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            const results = await parser.scanDirectory(tempDir);
            expect(results).toHaveLength(2);
            const names = results.map((r) => r.name);
            expect(names).toContain('filesystem');
            expect(names).toContain('shell');
        });
    });
    describe('TC-002-6: scanner ignores subdirectories without SKILL.md', () => {
        let tempDir;
        beforeEach(() => {
            tempDir = join(tmpdir(), `skill-md-parser-test-empty-${Date.now()}`);
            mkdirSync(tempDir, { recursive: true });
            // Only subdirectories with no SKILL.md
            mkdirSync(join(tempDir, 'subdir-a'), { recursive: true });
            mkdirSync(join(tempDir, 'subdir-b'), { recursive: true });
        });
        afterEach(() => {
            rmSync(tempDir, { recursive: true, force: true });
        });
        it('should return empty array for directory with no SKILL.md files', async () => {
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            const results = await parser.scanDirectory(tempDir);
            expect(results).toHaveLength(0);
        });
    });
    // --- Additional edge case tests ---
    describe('frontmatter parsing edge cases', () => {
        it('should default category to "workspace" when not specified', () => {
            const content = [
                '---',
                'name: test-skill',
                'version: 0.1.0',
                'description: Test',
                '---',
                '',
            ].join('\n');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            const result = parser.parse(content);
            expect(result.category).toBe('workspace');
        });
        it('should default version to "0.0.0" when not specified', () => {
            const content = [
                '---',
                'name: test-skill',
                'description: Test',
                '---',
                '',
            ].join('\n');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            const result = parser.parse(content);
            expect(result.version).toBe('0.0.0');
        });
        it('should handle frontmatter with extra whitespace in values', () => {
            const content = [
                '---',
                'name:   whitespace-skill  ',
                'version: 1.0.0  ',
                'description:  Trimmed description  ',
                '---',
                '',
            ].join('\n');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            const result = parser.parse(content);
            expect(result.name).toBe('whitespace-skill');
            expect(result.description).toBe('Trimmed description');
        });
    });
    describe('validation edge cases', () => {
        it('should throw when frontmatter is completely missing', () => {
            const content = '## Tool: some_tool\n\nSome description';
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            expect(() => parser.parse(content)).toThrow(/frontmatter/i);
        });
        it('should throw when description is missing', () => {
            const content = [
                '---',
                'name: test-skill',
                'version: 1.0.0',
                '---',
                '',
            ].join('\n');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            expect(() => parser.parse(content)).toThrow(/description.*required/i);
        });
        it('should throw when permission level is invalid', () => {
            const content = [
                '---',
                'name: test-skill',
                'version: 1.0.0',
                'description: Test',
                'permissions:',
                '  tool_a: invalid_level',
                '---',
                '',
            ].join('\n');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            expect(() => parser.parse(content)).toThrow(/invalid.*permission/i);
        });
        it('should throw when tool parameters type is not "object"', () => {
            const content = [
                '---',
                'name: test-skill',
                'version: 1.0.0',
                'description: Test',
                '---',
                '',
                '## Tool: bad_params',
                '',
                'A tool with wrong parameter type.',
                '',
                '### Parameters',
                '',
                '```json',
                '{"type": "string", "properties": {}}',
                '```',
                '',
            ].join('\n');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            expect(() => parser.parse(content)).toThrow(/parameters.*type.*object/i);
        });
        it('should accept skill with no tools', () => {
            const content = [
                '---',
                'name: empty-skill',
                'version: 1.0.0',
                'description: A skill with no tools',
                '---',
                '',
            ].join('\n');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            const result = parser.parse(content);
            expect(result.name).toBe('empty-skill');
            expect(result.tools).toHaveLength(0);
        });
        it('should accept skill with no permissions defined', () => {
            const content = [
                '---',
                'name: no-perm-skill',
                'version: 1.0.0',
                'description: Skill without explicit permissions',
                '---',
                '',
            ].join('\n');
            const validator = new SkillMdValidator();
            const parser = new SkillMdParser(validator);
            const result = parser.parse(content);
            expect(result.permissions).toEqual({});
        });
    });
});
//# sourceMappingURL=SkillMdParser.test.js.map