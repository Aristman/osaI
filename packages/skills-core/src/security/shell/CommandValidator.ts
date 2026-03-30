/**
 * @osai/skills-core -- Command Validator (DOMAIN-003, T-003)
 *
 * Validates shell commands against a list of blocked patterns.
 * Supports sudo prefix stripping and glob-style wildcard matching.
 *
 * Matching strategy:
 * - Patterns with trailing '*' match commands that START with the pattern prefix.
 *   e.g. "mkfs.*" matches "mkfs.ext4 /dev/sda1"
 * - Patterns without '*' match the command prefix exactly.
 *   e.g. "rm -rf /" matches "rm -rf / --no-preserve-root" (prefix match)
 * - Fork bomb ":(){ :|:& };:" is matched exactly (special case).
 */

import type { AllowedResult, BlockedCommand } from './types.js';

// --- Hardcoded blocked commands (Security Layer 5) ---

const HARDCODED_BLOCKED_COMMANDS: readonly BlockedCommand[] = [
  {
    reason: 'Destructive: recursive removal of filesystem root',
    pattern: 'rm -rf /',
  },
  {
    reason: 'Destructive: filesystem format operations',
    pattern: 'mkfs.*',
  },
  {
    reason: 'Destructive: zero-fill block device (data destruction)',
    pattern: 'dd if=/dev/zero*',
  },
  {
    reason: 'Destructive: fork bomb (resource exhaustion)',
    pattern: ':(){ :|:& };:',
  },
  {
    reason: 'Destructive: recursive chmod on root filesystem',
    pattern: 'chmod -R 777 /',
  },
] as const;

// --- Helper: wildcard pattern matching ---

/**
 * Converts a glob-style pattern with '*' wildcards to a RegExp.
 * The resulting regex matches from the start of the command string.
 *
 * - '*' wildcards are converted to '.*'
 * - All other regex special chars are escaped
 * - Anchor is '^' (start), but NOT '$' (end) -- so "mkfs.*" matches "mkfs.ext4 /dev/sda1"
 *   Exception: patterns without '*' use 'start-of-string + pattern' matching
 *   (i.e. "rm -rf /" matches "rm -rf /" and anything that starts with it).
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  // Match from start of stripped command.
  // No end anchor so commands with extra arguments are caught.
  return new RegExp(`^${escaped}`);
}

// --- Helper: sudo prefix stripping ---

/**
 * Strip sudo and its flags from the beginning of a command.
 * Handles: "sudo ", "sudo -E ", "sudo -S ", "sudo -u user ", etc.
 */
function stripSudoPrefix(command: string): string {
  let result = command.trim();

  // Iteratively strip "sudo" prefixes (handles nested sudo)
  const maxIterations = 3;
  for (let i = 0; i < maxIterations; i++) {
    const match = result.match(/^sudo(?:\s+-\S+)*\s+/);
    if (match) {
      result = result.slice(match[0]!.length).trimStart();
    } else {
      break;
    }
  }

  return result;
}

// --- CommandValidator ---

/**
 * Validates shell commands against a blocked commands list.
 *
 * Features:
 * - Checks against hardcoded destructive commands (always active)
 * - Checks against user-configurable blocked commands
 * - Strips sudo prefix before matching (sudo does not bypass security)
 * - Supports both exact matching and glob-style wildcard patterns
 */
export class CommandValidator {
  private readonly blockedPatterns: ReadonlyArray<{
    regex: RegExp;
    reason: string;
  }>;

  constructor(
    userBlockedCommands: readonly BlockedCommand[] = [],
  ) {
    const allBlocked = [...HARDCODED_BLOCKED_COMMANDS, ...userBlockedCommands];
    this.blockedPatterns = allBlocked.map((cmd) => ({
      regex: patternToRegex(cmd.pattern),
      reason: cmd.reason,
    }));
  }

  /**
   * Validate a shell command against the blocked commands list.
   *
   * @param command - The raw shell command string
   * @returns AllowedResult indicating if the command is allowed or blocked
   */
  validate(command: string): AllowedResult {
    const stripped = stripSudoPrefix(command);

    for (const { regex, reason } of this.blockedPatterns) {
      if (regex.test(stripped)) {
        return { allowed: false, reason };
      }
    }

    return { allowed: true };
  }

  /**
   * Returns the list of all active blocked patterns (hardcoded + user).
   * Useful for diagnostics and configuration display.
   */
  getBlockedPatterns(): ReadonlyArray<{ pattern: string; reason: string }> {
    return this.blockedPatterns.map(({ regex, reason }) => ({
      pattern: regex.source,
      reason,
    }));
  }
}
