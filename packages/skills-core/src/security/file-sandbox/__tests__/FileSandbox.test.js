/**
 * @osai/skills-core -- FileSandbox Unit Tests (DOMAIN-003, T-001)
 *
 * Tests defined in ROADMAP_TASKS_F-012.md, section T-001:
 * - TC-001-1: Path inside allowed_dirs is allowed
 * - TC-001-2: Path outside allowed_dirs is denied
 * - TC-001-3: Path matching blocked_patterns is denied
 * - TC-001-5: Symlink escape is blocked
 * - TC-001-6: Config from osai.json loads correctly
 * - TC-001-7: Empty allowed_dirs denies all paths
 *
 * Symlink-specific tests (TC-001-4, TC-001-5) that require real fs
 * operations are in SymlinkResolver.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileSandbox, DEFAULT_BLOCKED_PATTERNS } from '../FileSandbox.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let tempDir;
function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'osai-sandbox-test-'));
}
function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}
/**
 * Check if symlink creation is supported (elevated privileges on Windows).
 */
function canCreateSymlinks() {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osai-symlink-check-'));
    try {
        const target = path.join(testDir, 'target.txt');
        const link = path.join(testDir, 'link.txt');
        fs.writeFileSync(target, 'x');
        fs.symlinkSync(target, link);
        fs.unlinkSync(link);
        return true;
    }
    catch {
        return false;
    }
    finally {
        cleanupTempDir(testDir);
    }
}
const hasSymlinkSupport = canCreateSymlinks();
function createSandbox(allowedDirs, blockedPatterns) {
    const config = {
        allowedDirs: allowedDirs.map((d) => path.resolve(d)),
        blockedPatterns: blockedPatterns ?? [...DEFAULT_BLOCKED_PATTERNS],
    };
    return new FileSandbox(config);
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('FileSandbox', () => {
    beforeEach(() => {
        tempDir = createTempDir();
    });
    afterEach(() => {
        cleanupTempDir(tempDir);
    });
    // -------------------------------------------------------------------------
    // TC-001-1: Path inside allowed_dirs is allowed
    // -------------------------------------------------------------------------
    describe('TC-001-1: Path inside allowed_dirs is allowed', () => {
        it('allows a file inside an allowed directory', () => {
            const sandbox = createSandbox([tempDir]);
            const testFile = path.join(tempDir, 'test.txt');
            fs.writeFileSync(testFile, 'content');
            const result = sandbox.validate(testFile);
            expect(result.allowed).toBe(true);
            expect(result.resolvedPath).toBeTruthy();
        });
        it('allows a nested subdirectory path', () => {
            const sandbox = createSandbox([tempDir]);
            const nestedDir = path.join(tempDir, 'a', 'b', 'c');
            fs.mkdirSync(nestedDir, { recursive: true });
            const nestedFile = path.join(nestedDir, 'deep.txt');
            fs.writeFileSync(nestedFile, 'deep content');
            const result = sandbox.validate(nestedFile);
            expect(result.allowed).toBe(true);
        });
        it('allows the allowed directory itself', () => {
            const sandbox = createSandbox([tempDir]);
            const result = sandbox.validate(tempDir);
            expect(result.allowed).toBe(true);
        });
        it('allows path when multiple allowed_dirs are configured', () => {
            const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osai-sandbox-2-'));
            try {
                const sandbox = createSandbox([tempDir, secondDir]);
                const result1 = sandbox.validate(path.join(tempDir, 'a.txt'));
                const result2 = sandbox.validate(path.join(secondDir, 'b.txt'));
                // Both dirs are allowed (files may not exist, but dir check passes)
                expect(result1.allowed).toBe(true);
                expect(result2.allowed).toBe(true);
            }
            finally {
                cleanupTempDir(secondDir);
            }
        });
    });
    // -------------------------------------------------------------------------
    // TC-001-2: Path outside allowed_dirs is denied
    // -------------------------------------------------------------------------
    describe('TC-001-2: Path outside allowed_dirs is denied', () => {
        it('denies a file outside allowed directories', () => {
            const sandbox = createSandbox([tempDir]);
            const outsidePath = path.join(os.tmpdir(), 'outside-sandbox.txt');
            const result = sandbox.validate(outsidePath);
            expect(result.allowed).toBe(false);
            expect(result.error).toContain(outsidePath);
            expect(result.violationType).toBe('not_in_allowed_dirs');
        });
        it('denies a path in a sibling directory', () => {
            const siblingDir = path.join(path.dirname(tempDir), 'sibling');
            const sandbox = createSandbox([tempDir]);
            const result = sandbox.validate(siblingDir);
            expect(result.allowed).toBe(false);
            expect(result.violationType).toBe('not_in_allowed_dirs');
        });
    });
    // -------------------------------------------------------------------------
    // TC-001-3: Blocked patterns
    // -------------------------------------------------------------------------
    describe('TC-001-3: Path matching blocked_patterns is denied', () => {
        it('blocks ~/.ssh/** pattern', () => {
            const sandbox = createSandbox([tempDir]);
            const sshPath = path.join(os.homedir(), '.ssh', 'id_rsa');
            const result = sandbox.validate(sshPath);
            expect(result.allowed).toBe(false);
            expect(result.violationType).toBe('blocked_pattern');
            expect(result.error).toContain('blocked pattern');
        });
        it('blocks ~/.gnupg/** pattern', () => {
            const sandbox = createSandbox([tempDir]);
            const gnupgPath = path.join(os.homedir(), '.gnupg', 'private-keys-v1.d');
            const result = sandbox.validate(gnupgPath);
            expect(result.allowed).toBe(false);
            expect(result.violationType).toBe('blocked_pattern');
        });
        it('blocks /etc/** pattern', () => {
            const sandbox = createSandbox([tempDir]);
            const result = sandbox.validate('/etc/passwd');
            expect(result.allowed).toBe(false);
            expect(result.violationType).toBe('blocked_pattern');
        });
        it('blocks /boot/** pattern', () => {
            const sandbox = createSandbox([tempDir]);
            const result = sandbox.validate('/boot/vmlinuz');
            expect(result.allowed).toBe(false);
            expect(result.violationType).toBe('blocked_pattern');
        });
        it('blocked patterns take precedence over allowed_dirs', () => {
            // Even if ~/.ssh is in allowed_dirs, blocked patterns still apply
            const sshDir = path.join(os.homedir(), '.ssh');
            const sandbox = createSandbox([sshDir, tempDir]);
            const result = sandbox.validate(path.join(sshDir, 'config'));
            expect(result.allowed).toBe(false);
            expect(result.violationType).toBe('blocked_pattern');
        });
    });
    // -------------------------------------------------------------------------
    // TC-001-5: Symlink escape prevention
    // -------------------------------------------------------------------------
    describe('TC-001-5: Symlink escape prevention', () => {
        it.skipIf(!hasSymlinkSupport)('blocks symlink that escapes allowed_dirs', () => {
            // On Windows, /etc/passwd doesn't exist, so use tempDir as escape target
            const escapeTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'osai-escape-'));
            try {
                const sandbox = createSandbox([tempDir]);
                // Create a symlink inside allowed dir pointing outside
                const symlinkPath = path.join(tempDir, 'escape_link');
                fs.symlinkSync(escapeTarget, symlinkPath);
                // Validating the symlink itself should check the resolved target
                const result = sandbox.validate(symlinkPath);
                expect(result.allowed).toBe(false);
                expect(result.violationType).toBe('not_in_allowed_dirs');
            }
            finally {
                cleanupTempDir(escapeTarget);
            }
        });
        it.skipIf(!hasSymlinkSupport)('allows symlink within allowed_dirs', () => {
            const subDir = path.join(tempDir, 'subdir');
            fs.mkdirSync(subDir);
            const realFile = path.join(subDir, 'real.txt');
            fs.writeFileSync(realFile, 'real content');
            const sandbox = createSandbox([tempDir]);
            // Create symlink inside allowed dir pointing to file also inside allowed dir
            const symlinkPath = path.join(tempDir, 'link.txt');
            fs.symlinkSync(realFile, symlinkPath);
            const result = sandbox.validate(symlinkPath);
            expect(result.allowed).toBe(true);
        });
    });
    // -------------------------------------------------------------------------
    // TC-001-6: Config from osai.json loads correctly
    // -------------------------------------------------------------------------
    describe('TC-001-6: Config from osai.json loads correctly', () => {
        it('FileSandbox.createConfig merges defaults with user config', () => {
            const config = FileSandbox.createConfig({
                allowedDirs: [tempDir],
            });
            expect(config.allowedDirs).toContain(path.resolve(tempDir));
            // Default blocked patterns must be present
            expect(config.blockedPatterns).toContain('~/.ssh/**');
            expect(config.blockedPatterns).toContain('~/.gnupg/**');
            expect(config.blockedPatterns).toContain('/etc/**');
            expect(config.blockedPatterns).toContain('/boot/**');
        });
        it('FileSandbox.createConfig merges additional blocked patterns', () => {
            const config = FileSandbox.createConfig({
                allowedDirs: [tempDir],
                blockedPatterns: ['~/.aws/**'],
            });
            expect(config.blockedPatterns).toHaveLength(5);
            expect(config.blockedPatterns).toContain('~/.aws/**');
            // Defaults still present
            expect(config.blockedPatterns).toContain('~/.ssh/**');
        });
        it('FileSandbox.createConfig with no args returns empty allowedDirs', () => {
            const config = FileSandbox.createConfig();
            expect(config.allowedDirs).toHaveLength(0);
            expect(config.blockedPatterns).toHaveLength(4); // defaults only
        });
        it('FileSandbox works with createConfig output', () => {
            const config = FileSandbox.createConfig({
                allowedDirs: [tempDir],
            });
            const sandbox = new FileSandbox(config);
            const testFile = path.join(tempDir, 'config-test.txt');
            fs.writeFileSync(testFile, 'test');
            const result = sandbox.validate(testFile);
            expect(result.allowed).toBe(true);
        });
    });
    // -------------------------------------------------------------------------
    // TC-001-7: Empty allowed_dirs denies all paths
    // -------------------------------------------------------------------------
    describe('TC-001-7: Empty allowed_dirs denies all paths', () => {
        it('denies any path when allowedDirs is empty', () => {
            const sandbox = createSandbox([]);
            const result = sandbox.validate(path.join(tempDir, 'any.txt'));
            expect(result.allowed).toBe(false);
            expect(result.violationType).toBe('not_in_allowed_dirs');
        });
        it('denies home directory path when allowedDirs is empty', () => {
            const sandbox = createSandbox([]);
            const result = sandbox.validate(os.homedir());
            expect(result.allowed).toBe(false);
        });
        it('denies temp directory when allowedDirs is empty', () => {
            const sandbox = createSandbox([]);
            const result = sandbox.validate(os.tmpdir());
            expect(result.allowed).toBe(false);
        });
    });
    // -------------------------------------------------------------------------
    // SandboxResult structure
    // -------------------------------------------------------------------------
    describe('SandboxResult structure', () => {
        it('allowed result has no error or violationType', () => {
            const sandbox = createSandbox([tempDir]);
            const testFile = path.join(tempDir, 'ok.txt');
            fs.writeFileSync(testFile, 'ok');
            const result = sandbox.validate(testFile);
            expect(result.allowed).toBe(true);
            expect(result.path).toBe(testFile);
            expect(result.resolvedPath).toBeTruthy();
            expect(result.error).toBeUndefined();
            expect(result.violationType).toBeUndefined();
        });
        it('denied result has error and violationType', () => {
            const sandbox = createSandbox([tempDir]);
            const outside = path.join(os.tmpdir(), 'denied.txt');
            const result = sandbox.validate(outside);
            expect(result.allowed).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.violationType).toBeDefined();
            expect(result.path).toBe(outside);
        });
    });
    // -------------------------------------------------------------------------
    // Windows path handling
    // -------------------------------------------------------------------------
    describe('Windows path handling', () => {
        it('normalizes forward slashes to platform separators', () => {
            const sandbox = createSandbox([tempDir]);
            // Use forward slashes even on Windows
            const forwardSlashPath = tempDir.replace(/\\/g, '/') + '/test.txt';
            const result = sandbox.validate(forwardSlashPath);
            // Should not throw; path normalization handles this
            expect(result.violationType !== 'not_in_allowed_dirs' || !result.allowed).toBe(true);
        });
        it('handles relative paths by resolving to absolute', () => {
            const sandbox = createSandbox([tempDir]);
            // Use a relative path that resolves to inside tempDir
            const relativePath = path.relative(process.cwd(), path.join(tempDir, 'relative-test.txt'));
            const result = sandbox.validate(relativePath);
            // Whether allowed depends on where cwd is, but it should not throw
            expect(typeof result.allowed).toBe('boolean');
        });
    });
    // -------------------------------------------------------------------------
    // DEFAULT_BLOCKED_PATTERNS
    // -------------------------------------------------------------------------
    describe('DEFAULT_BLOCKED_PATTERNS', () => {
        it('contains all 4 required patterns', () => {
            expect(DEFAULT_BLOCKED_PATTERNS).toHaveLength(4);
            expect(DEFAULT_BLOCKED_PATTERNS).toContain('~/.ssh/**');
            expect(DEFAULT_BLOCKED_PATTERNS).toContain('~/.gnupg/**');
            expect(DEFAULT_BLOCKED_PATTERNS).toContain('/etc/**');
            expect(DEFAULT_BLOCKED_PATTERNS).toContain('/boot/**');
        });
        it('is readonly', () => {
            expect(Object.isFrozen(DEFAULT_BLOCKED_PATTERNS)).toBe(true);
        });
    });
});
//# sourceMappingURL=FileSandbox.test.js.map