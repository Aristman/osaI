/**
 * registerBundledSkills integration tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '@osai/agent';
import { registerBundledSkills, registerBundledSkillsWithDefaults } from '../register.js';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('registerBundledSkills', () => {
  let registry: SkillRegistry;
  let tempDir: string;

  beforeEach(() => {
    registry = new SkillRegistry();
    tempDir = mkdtempSync(join(tmpdir(), 'register-test-'));
  });

  it('should register filesystem skill', () => {
    registerBundledSkills(registry, {
      filesystem: {
        allowedDirs: [tempDir],
      },
    });

    const skills = registry.listSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('filesystem');
  });

  it('should register shell skill', () => {
    registerBundledSkills(registry, {
      shell: {},
    });

    const skills = registry.listSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('shell');
  });

  it('should register http skill', () => {
    registerBundledSkills(registry, {
      http: {},
    });

    const skills = registry.listSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('http');
  });

  it('should register browser skill when enabled', () => {
    registerBundledSkills(registry, {
      browser: { enabled: true },
    });

    const skills = registry.listSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('browser');
  });

  it('should not register browser skill when not enabled', () => {
    registerBundledSkills(registry, {
      browser: { enabled: false },
    });

    const skills = registry.listSkills();
    const names = skills.map((s) => s.name);
    expect(names).not.toContain('browser');
  });

  it('should register all skills when fully configured', () => {
    registerBundledSkills(registry, {
      filesystem: {
        allowedDirs: [tempDir],
      },
      shell: {},
      http: {},
      browser: { enabled: true },
    });

    const skills = registry.listSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('filesystem');
    expect(names).toContain('shell');
    expect(names).toContain('http');
    expect(names).toContain('browser');
    expect(skills).toHaveLength(4);
  });

  it('should register no skills with empty config', () => {
    registerBundledSkills(registry, {});

    const skills = registry.listSkills();
    expect(skills).toHaveLength(0);
  });

  it('should provide tool executors for registered skills', () => {
    registerBundledSkills(registry, {
      filesystem: { allowedDirs: [tempDir] },
      shell: {},
      http: {},
      browser: { enabled: true },
    });

    // Filesystem executors
    expect(registry.getToolExecutor('filesystem.read_file')).toBeDefined();
    expect(registry.getToolExecutor('filesystem.write_file')).toBeDefined();
    expect(registry.getToolExecutor('filesystem.list_directory')).toBeDefined();
    expect(registry.getToolExecutor('filesystem.search_files')).toBeDefined();
    expect(registry.getToolExecutor('filesystem.move_file')).toBeDefined();
    expect(registry.getToolExecutor('filesystem.delete_file')).toBeDefined();

    // Shell executor
    expect(registry.getToolExecutor('shell.execute')).toBeDefined();

    // HTTP executors
    expect(registry.getToolExecutor('http.http_get')).toBeDefined();
    expect(registry.getToolExecutor('http.http_post')).toBeDefined();
    expect(registry.getToolExecutor('http.http_put')).toBeDefined();
    expect(registry.getToolExecutor('http.http_delete')).toBeDefined();

    // Browser executors
    expect(registry.getToolExecutor('browser.navigate')).toBeDefined();
    expect(registry.getToolExecutor('browser.click')).toBeDefined();
    expect(registry.getToolExecutor('browser.fill')).toBeDefined();
    expect(registry.getToolExecutor('browser.screenshot')).toBeDefined();
  });

  it('should provide tool schemas for all registered skills', () => {
    registerBundledSkills(registry, {
      filesystem: { allowedDirs: [tempDir] },
      shell: {},
      http: {},
      browser: { enabled: true },
    });

    const schemas = registry.getToolSchemas();
    expect(schemas.length).toBe(15); // 6 filesystem + 1 shell + 4 http + 4 browser
  });
});

describe('registerBundledSkillsWithDefaults', () => {
  it('should register all skills with default configuration', () => {
    const registry = new SkillRegistry();
    const tempDir = mkdtempSync(join(tmpdir(), 'register-defaults-'));

    registerBundledSkillsWithDefaults(registry, tempDir);

    const skills = registry.listSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('filesystem');
    expect(names).toContain('shell');
    expect(names).toContain('http');
    expect(names).toContain('browser');
    expect(skills).toHaveLength(4);
  });
});
