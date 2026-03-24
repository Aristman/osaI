/**
 * Tests for T-003: Directory Structure Initialization
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initializeOsaiDirectory,
  initializeOsaiDirectorySync,
  isOsaiDirectoryInitialized,
  getExpectedPaths,
  ensureDirectory,
  ensureFile,
} from '../init.js';

describe('T-003: Directory Structure Initialization', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osai-init-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // T003-UT-01: getOsaiDirectory returns correct path
  // (tested via getExpectedPaths which uses getOsaiDirectory)
  it('T003-UT-01: getExpectedPaths should return paths under ~/.osai', () => {
    const paths = getExpectedPaths();
    for (const p of paths) {
      expect(p).toMatch(/\.osai/);
    }
  });

  // T003-UT-02: Initialize creates all directories
  it('T003-UT-02: should create all directories', async () => {
    await initializeOsaiDirectory({ osaiDir: tempDir });

    const expectedDirs = ['logs', 'sessions', 'memory', 'workspace', 'workspace/skills'];
    for (const dir of expectedDirs) {
      const fullPath = path.join(tempDir, dir);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).isDirectory()).toBe(true);
    }
  });

  // T003-UT-03: Initialize creates openclaw.json
  it('T003-UT-03: should create openclaw.json with defaults', async () => {
    await initializeOsaiDirectory({ osaiDir: tempDir });

    const configPath = path.join(tempDir, 'openclaw.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.gateway).toBeDefined();
    expect(content.model).toBeDefined();
    expect(content.gateway.host).toBe('127.0.0.1');
    expect(content.gateway.port).toBe(18789);
    expect(content.model.provider).toBe('anthropic');
    expect(content.session).toBeDefined();
    expect(content.security).toBeDefined();
    expect(content.memory).toBeDefined();
    expect(content.observability).toBeDefined();
  });

  // T003-UT-04: openclaw.json has 0600 permissions
  it('T003-UT-04: openclaw.json should have 0600 permissions', async () => {
    await initializeOsaiDirectory({ osaiDir: tempDir });

    const configPath = path.join(tempDir, 'openclaw.json');
    const stat = fs.statSync(configPath);
    const mode = stat.mode & 0o777;
    // On some filesystems permissions may not be enforced
    expect(mode).toBe(0o600);
  });

  // T003-UT-05: Directories have 0700 permissions
  it('T003-UT-05: directories should have 0700 permissions', async () => {
    await initializeOsaiDirectory({ osaiDir: tempDir });

    const dirs = ['logs', 'sessions', 'memory', 'workspace'];
    for (const dir of dirs) {
      const fullPath = path.join(tempDir, dir);
      const stat = fs.statSync(fullPath);
      const mode = stat.mode & 0o777;
      expect(mode).toBe(0o700);
    }
  });

  // T003-UT-06: Idempotent operation
  it('T003-UT-06: should be idempotent (safe to call multiple times)', async () => {
    await initializeOsaiDirectory({ osaiDir: tempDir });

    // Get file content after first init
    const configPath = path.join(tempDir, 'openclaw.json');
    const firstContent = fs.readFileSync(configPath, 'utf-8');

    // Call again
    await initializeOsaiDirectory({ osaiDir: tempDir });

    // Content should be unchanged
    const secondContent = fs.readFileSync(configPath, 'utf-8');
    expect(secondContent).toBe(firstContent);
  });

  // T003-UT-07: Does not overwrite existing openclaw.json
  it('T003-UT-07: should not overwrite existing openclaw.json', async () => {
    // Create custom config
    const customConfig = { gateway: { host: '0.0.0.0', port: 9999 }, model: { provider: 'ollama', model: 'llama3' } };
    const configPath = path.join(tempDir, 'openclaw.json');
    fs.writeFileSync(configPath, JSON.stringify(customConfig, null, 2));

    await initializeOsaiDirectory({ osaiDir: tempDir });

    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(content.gateway.host).toBe('0.0.0.0');
    expect(content.gateway.port).toBe(9999);
    expect(content.model.provider).toBe('ollama');
  });

  // T003-IT-01: Full initialization on real filesystem
  it('T003-IT-01: should create complete layout on real filesystem', async () => {
    await initializeOsaiDirectory({ osaiDir: tempDir });

    const expected = getExpectedPaths(tempDir);
    for (const p of expected) {
      expect(fs.existsSync(p)).toBe(true);
    }
  });

  // isOsaiDirectoryInitialized
  describe('isOsaiDirectoryInitialized', () => {
    it('should return false for non-initialized directory', () => {
      expect(isOsaiDirectoryInitialized(tempDir)).toBe(false);
    });

    it('should return true after initialization', async () => {
      await initializeOsaiDirectory({ osaiDir: tempDir });
      expect(isOsaiDirectoryInitialized(tempDir)).toBe(true);
    });
  });

  // directoriesOnly option
  it('should create only directories when directoriesOnly is true', async () => {
    await initializeOsaiDirectory({ osaiDir: tempDir, directoriesOnly: true });

    expect(fs.existsSync(path.join(tempDir, 'logs'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'openclaw.json'))).toBe(false);
  });

  // Sync version
  describe('initializeOsaiDirectorySync', () => {
    it('should create all directories synchronously', () => {
      initializeOsaiDirectorySync({ osaiDir: tempDir });

      expect(fs.existsSync(path.join(tempDir, 'logs'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'sessions'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'openclaw.json'))).toBe(true);

      const content = JSON.parse(fs.readFileSync(path.join(tempDir, 'openclaw.json'), 'utf-8'));
      expect(content.gateway).toBeDefined();
    });
  });

  // ensureDirectory helper
  describe('ensureDirectory', () => {
    it('should create directory if not exists', () => {
      const dir = path.join(tempDir, 'test-dir');
      ensureDirectory(dir);
      expect(fs.existsSync(dir)).toBe(true);
    });

    it('should not error if directory already exists', () => {
      const dir = path.join(tempDir, 'existing-dir');
      fs.mkdirSync(dir);
      expect(() => ensureDirectory(dir)).not.toThrow();
    });
  });

  // ensureFile helper
  describe('ensureFile', () => {
    it('should create file if not exists', () => {
      const filePath = path.join(tempDir, 'test.txt');
      ensureFile(filePath, 'hello world');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world');
    });

    it('should not overwrite existing file', () => {
      const filePath = path.join(tempDir, 'existing.txt');
      fs.writeFileSync(filePath, 'original');
      ensureFile(filePath, 'new content');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('original');
    });
  });

  // T003-IT-02: Initialize from custom path
  it('T003-IT-02: should work with custom osaiDir path', async () => {
    const customDir = path.join(tempDir, 'custom-osai');
    await initializeOsaiDirectory({ osaiDir: customDir });

    expect(fs.existsSync(path.join(customDir, 'openclaw.json'))).toBe(true);
    expect(fs.existsSync(path.join(customDir, 'logs'))).toBe(true);
  });
});
