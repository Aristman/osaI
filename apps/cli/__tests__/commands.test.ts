/**
 * Tests for CLI commands
 *
 * T-001, T-006 unit tests: version, init, status, session, config, skills, memory, channel
 */

import { describe, it, expect, vi } from 'vitest';
import { versionCommand } from '../src/commands/version.js';
import { initCommand } from '../src/commands/init.js';
import { statusCommand } from '../src/commands/status.js';
import { sessionCommand } from '../src/commands/session.js';
import { skillsCommand } from '../src/commands/skills.js';
import { memoryCommand } from '../src/commands/memory.js';
import { channelCommand } from '../src/commands/channel.js';
import { parseArgs } from '../src/index.js';

// ---------------------------------------------------------------------------
// T001-U02: version
// ---------------------------------------------------------------------------

describe('versionCommand', () => {
  it('should print version string', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await versionCommand();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringMatching(/osai CLI v\d+\.\d+\.\d+/));
    writeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// T001-U01: help (via parseArgs)
// ---------------------------------------------------------------------------

describe('CLI argument parsing', () => {
  it('should parse --help flag', () => {
    const result = parseArgs(['node', 'osai', '--help']);
    expect(result.flags.help).toBe(true);
  });

  it('should parse --version flag', () => {
    const result = parseArgs(['node', 'osai', '--version']);
    expect(result.flags.version).toBe(true);
  });

  it('should parse --json flag', () => {
    const result = parseArgs(['node', 'osai', 'status', '--json']);
    expect(result.flags.json).toBe(true);
  });

  it('should parse command and action', () => {
    const result = parseArgs(['node', 'osai', 'session', 'list']);
    expect(result.command).toBe('session');
    expect(result.action).toBe('list');
  });

  it('should parse session action with args', () => {
    const result = parseArgs(['node', 'osai', 'session', 'resume', 'abc123']);
    expect(result.command).toBe('session');
    expect(result.action).toBe('resume');
    expect(result.args).toEqual(['abc123']);
  });

  it('should parse chat --message flag', () => {
    const result = parseArgs(['node', 'osai', 'chat', '--message', 'hello']);
    expect(result.command).toBe('chat');
    expect(result.flags.message).toBe('hello');
  });

  it('should parse chat --session flag', () => {
    const result = parseArgs(['node', 'osai', 'chat', '--session', 'sid-123']);
    expect(result.command).toBe('chat');
    expect(result.flags.session).toBe('sid-123');
  });

  it('should parse config action', () => {
    const result = parseArgs(['node', 'osai', 'config', 'show']);
    expect(result.command).toBe('config');
    expect(result.action).toBe('show');
  });

  it('should parse skills action with args', () => {
    const result = parseArgs(['node', 'osai', 'skills', 'enable', 'filesystem']);
    expect(result.command).toBe('skills');
    expect(result.action).toBe('enable');
    expect(result.args).toEqual(['filesystem']);
  });

  it('should parse memory action with args', () => {
    const result = parseArgs(['node', 'osai', 'memory', 'search', 'test query']);
    expect(result.command).toBe('memory');
    expect(result.action).toBe('search');
    expect(result.args).toEqual(['test query']);
  });

  it('should parse channel action', () => {
    const result = parseArgs(['node', 'osai', 'channel', 'list']);
    expect(result.command).toBe('channel');
    expect(result.action).toBe('list');
  });

  it('should handle empty args', () => {
    const result = parseArgs(['node', 'osai']);
    expect(result.command).toBe('');
  });
});

// ---------------------------------------------------------------------------
// T001-U03: init
// ---------------------------------------------------------------------------

describe('initCommand', () => {
  it('should initialize when directory does not exist', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await initCommand();

    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('initialized'));
    writeSpy.mockRestore();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// T006-U08: status (gateway down)
// ---------------------------------------------------------------------------

describe('statusCommand', () => {
  it('should report disconnected when gateway unavailable', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await statusCommand();
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('disconnected'));
    writeSpy.mockRestore();
  });

  it('should output JSON when --json flag is set', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await statusCommand({ json: true });
    expect(writeSpy).toHaveBeenCalledWith(expect.stringMatching(/^\{/));
    writeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// T006-U01: session list (gateway down)
// ---------------------------------------------------------------------------

describe('sessionCommand', () => {
  it('should handle list with gateway down gracefully', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await sessionCommand('list', []);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Error'));
    errSpy.mockRestore();
  });

  it('should handle list with --json when gateway down', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await sessionCommand('list', [], { json: true });
    expect(writeSpy).toHaveBeenCalledWith(expect.stringMatching(/^\{/));
    writeSpy.mockRestore();
  });

  it('should reject invalid session type for create', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await sessionCommand('create', ['invalid_type']);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('invalid session type'));
    errSpy.mockRestore();
  });

  it('should require session ID for resume', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await sessionCommand('resume', []);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('session ID required'));
    errSpy.mockRestore();
  });

  it('should reject unknown actions', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await sessionCommand('unknown' as 'list', []);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('unknown session action'));
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// T006-U04: skills (gateway down)
// ---------------------------------------------------------------------------

describe('skillsCommand', () => {
  it('should handle list with gateway down', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await skillsCommand('list', []);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Error'));
    errSpy.mockRestore();
  });

  it('should require skill name for enable', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await skillsCommand('enable', []);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('skill name required'));
    errSpy.mockRestore();
  });

  it('should require skill name for disable', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await skillsCommand('disable', []);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('skill name required'));
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// T006-U06: memory (gateway down)
// ---------------------------------------------------------------------------

describe('memoryCommand', () => {
  it('should require query for search', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await memoryCommand('search', []);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('search query required'));
    errSpy.mockRestore();
  });

  it('should handle search with gateway down', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await memoryCommand('search', ['test query']);
    // Should try to connect, then fall back to JSON error or stderr
    writeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// T006-U07: channel (gateway down)
// ---------------------------------------------------------------------------

describe('channelCommand', () => {
  it('should reject unknown channel actions', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await channelCommand('invalid', []);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('unknown channel action'));
    errSpy.mockRestore();
  });

  it('should handle list with gateway down', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await channelCommand('list', []);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Error'));
    errSpy.mockRestore();
  });

  it('should handle list with --json when gateway down', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await channelCommand('list', [], { json: true });
    expect(writeSpy).toHaveBeenCalledWith(expect.stringMatching(/^\{/));
    writeSpy.mockRestore();
  });
});
