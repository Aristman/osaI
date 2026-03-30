/**
 * @osai/skills-core -- File Sandbox Module (DOMAIN-003, T-001)
 *
 * Security module for file system access control.
 * Validates paths against allowed directories and blocked patterns.
 * Prevents symlink-based sandbox escapes.
 */

export { FileSandbox, DEFAULT_BLOCKED_PATTERNS } from './FileSandbox.js';
export { SymlinkResolver } from './SymlinkResolver.js';
export { createSandboxAwareFilesystemSkill } from './SandboxAwareFilesystemSkill.js';

export type { FileSandboxConfig, SandboxResult } from './types.js';
