/**
 * @osai/skills-core -- SymlinkResolver Unit Tests (DOMAIN-003, T-001)
 *
 * Tests for symlink resolution and escape detection.
 * - TC-001-4: Symlink inside allowed_dirs resolves correctly
 * - TC-001-5: Symlink escape (symlink -> outside) is blocked
 *
 * Note: Symlink creation requires elevated privileges on Windows.
 * Tests that create symlinks are skipped when privileges are unavailable.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SymlinkResolver } from '../SymlinkResolver.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let tempDir;
function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'osai-symlink-test-'));
}
function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}
/**
 * Check if symlink creation is supported (elevated privileges on Windows).
 * Returns true if symlinks can be created, false otherwise.
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
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SymlinkResolver', () => {
    let resolver;
    beforeEach(() => {
        tempDir = createTempDir();
        resolver = new SymlinkResolver();
    });
    afterEach(() => {
        cleanupTempDir(tempDir);
    });
    // -------------------------------------------------------------------------
    // resolveRealPath
    // -------------------------------------------------------------------------
    describe('resolveRealPath', () => {
        it('TC-001-4: resolves real path of a regular file', () => {
            const file = path.join(tempDir, 'real.txt');
            fs.writeFileSync(file, 'content');
            const result = resolver.resolveRealPath(file);
            // Should return the canonical absolute path
            expect(result).toBeTruthy();
            expect(path.normalize(result)).toBe(path.normalize(file));
        });
        it('TC-001-4: resolves symlink to its real target', () => {
            if (!hasSymlinkSupport)
                return;
            const targetFile = path.join(tempDir, 'target.txt');
            fs.writeFileSync(targetFile, 'target');
            const linkFile = path.join(tempDir, 'link.txt');
            fs.symlinkSync(targetFile, linkFile);
            const result = resolver.resolveRealPath(linkFile);
            // Should resolve to the real target, not the symlink
            expect(path.normalize(result)).toBe(path.normalize(targetFile));
        });
        it('resolves symlink chain (link -> link -> real)', () => {
            if (!hasSymlinkSupport)
                return;
            const realFile = path.join(tempDir, 'real.txt');
            fs.writeFileSync(realFile, 'real');
            const link1 = path.join(tempDir, 'link1.txt');
            const link2 = path.join(tempDir, 'link2.txt');
            fs.symlinkSync(realFile, link1);
            fs.symlinkSync(link1, link2);
            const result = resolver.resolveRealPath(link2);
            expect(path.normalize(result)).toBe(path.normalize(realFile));
        });
        it('resolves symlink to directory', () => {
            if (!hasSymlinkSupport)
                return;
            const realDir = path.join(tempDir, 'real-dir');
            fs.mkdirSync(realDir);
            fs.writeFileSync(path.join(realDir, 'file.txt'), 'inside');
            const linkDir = path.join(tempDir, 'link-dir');
            fs.symlinkSync(realDir, linkDir);
            const result = resolver.resolveRealPath(linkDir);
            expect(path.normalize(result)).toBe(path.normalize(realDir));
        });
        it('normalizes path with . and .. segments', () => {
            const file = path.join(tempDir, 'file.txt');
            fs.writeFileSync(file, 'content');
            const messyPath = path.join(tempDir, '.', 'subdir', '..', 'file.txt');
            const result = resolver.resolveRealPath(messyPath);
            expect(path.normalize(result)).toBe(path.normalize(file));
        });
        it('throws for non-existent path', () => {
            const nonExistent = path.join(tempDir, 'does-not-exist.txt');
            expect(() => resolver.resolveRealPath(nonExistent)).toThrow();
        });
    });
    // -------------------------------------------------------------------------
    // isWithinAllowedDirs
    // -------------------------------------------------------------------------
    describe('isWithinAllowedDirs', () => {
        it('returns true for path inside an allowed dir', () => {
            const result = resolver.isWithinAllowedDirs(path.join(tempDir, 'file.txt'), [tempDir]);
            expect(result).toBe(true);
        });
        it('returns true for deeply nested path inside allowed dir', () => {
            const nested = path.join(tempDir, 'a', 'b', 'c', 'd', 'file.txt');
            const result = resolver.isWithinAllowedDirs(nested, [tempDir]);
            expect(result).toBe(true);
        });
        it('returns true when path is exactly the allowed dir', () => {
            const result = resolver.isWithinAllowedDirs(tempDir, [tempDir]);
            expect(result).toBe(true);
        });
        it('returns false for path outside all allowed dirs', () => {
            const outside = path.join(os.tmpdir(), 'outside.txt');
            const result = resolver.isWithinAllowedDirs(outside, [tempDir]);
            expect(result).toBe(false);
        });
        it('returns false when allowedDirs is empty', () => {
            const result = resolver.isWithinAllowedDirs(tempDir, []);
            expect(result).toBe(false);
        });
        it('TC-001-5: returns false for symlink target outside allowed dir', () => {
            const escapeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osai-escape-'));
            try {
                // The symlink resolves to escapeDir, which is not in allowedDirs
                const result = resolver.isWithinAllowedDirs(escapeDir, [tempDir]);
                expect(result).toBe(false);
            }
            finally {
                cleanupTempDir(escapeDir);
            }
        });
        it('checks against multiple allowed dirs', () => {
            const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osai-second-'));
            try {
                // Path inside second allowed dir
                const result = resolver.isWithinAllowedDirs(path.join(secondDir, 'file.txt'), [tempDir, secondDir]);
                expect(result).toBe(true);
            }
            finally {
                cleanupTempDir(secondDir);
            }
        });
        it('returns false for path that is a parent prefix of allowed dir', () => {
            // tempDir/child is allowed, but tempDir itself is not allowed
            const childDir = path.join(tempDir, 'child');
            const result = resolver.isWithinAllowedDirs(tempDir, [childDir]);
            expect(result).toBe(false);
        });
    });
    // -------------------------------------------------------------------------
    // normalizeForComparison
    // -------------------------------------------------------------------------
    describe('normalizeForComparison', () => {
        it('resolves relative paths to absolute', () => {
            const result = resolver.normalizeForComparison('.');
            expect(path.isAbsolute(result)).toBe(true);
        });
        it('normalizes . and .. segments', () => {
            const result = resolver.normalizeForComparison(path.join(tempDir, 'a', '..', 'b'));
            expect(result).toBe(resolver.normalizeForComparison(path.join(tempDir, 'b')));
        });
        it('removes trailing separator', () => {
            const withTrailing = tempDir + path.sep;
            const result = resolver.normalizeForComparison(withTrailing);
            expect(result.endsWith(path.sep)).toBe(false);
        });
        it('handles mixed separators (Windows)', () => {
            // This test verifies the path is normalized regardless of separator style
            const mixedPath = tempDir.replace(/\\/g, '/') + '/subdir/file.txt';
            const result = resolver.normalizeForComparison(mixedPath);
            // Should produce a valid normalized path
            expect(result.length).toBeGreaterThan(0);
            // On Windows, normalizeForComparison uppercases -- compare uppercased
            const upperResult = result.toUpperCase();
            expect(upperResult).toContain('SUBDIR');
            expect(upperResult).toContain('FILE.TXT');
        });
        it('normalizes both paths to same form for comparison', () => {
            const forwardSlash = tempDir.replace(/\\/g, '/') + '/file.txt';
            const backslash = tempDir + '\\file.txt';
            const result1 = resolver.normalizeForComparison(forwardSlash);
            const result2 = resolver.normalizeForComparison(backslash);
            expect(result1).toBe(result2);
        });
    });
    // -------------------------------------------------------------------------
    // Integration: resolveRealPath + isWithinAllowedDirs
    // -------------------------------------------------------------------------
    describe('Integration: resolve + check', () => {
        it('TC-001-4: resolved symlink inside allowed dirs passes', () => {
            if (!hasSymlinkSupport)
                return;
            const targetDir = path.join(tempDir, 'target-dir');
            fs.mkdirSync(targetDir);
            fs.writeFileSync(path.join(targetDir, 'file.txt'), 'content');
            const linkDir = path.join(tempDir, 'link-dir');
            fs.symlinkSync(targetDir, linkDir);
            // Resolve the symlink
            const realPath = resolver.resolveRealPath(linkDir);
            // Check it's within allowed dirs
            expect(resolver.isWithinAllowedDirs(realPath, [tempDir])).toBe(true);
        });
        it('TC-001-5: resolved symlink outside allowed dirs fails', () => {
            if (!hasSymlinkSupport)
                return;
            const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osai-outside-'));
            try {
                // Create symlink inside allowed dir that points outside
                const escapeLink = path.join(tempDir, 'escape');
                fs.symlinkSync(outsideDir, escapeLink);
                const realPath = resolver.resolveRealPath(escapeLink);
                expect(resolver.isWithinAllowedDirs(realPath, [tempDir])).toBe(false);
            }
            finally {
                cleanupTempDir(outsideDir);
            }
        });
    });
});
//# sourceMappingURL=SymlinkResolver.test.js.map