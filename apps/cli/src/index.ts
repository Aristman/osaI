#!/usr/bin/env node
/**
 * osai CLI -- entry point
 *
 * Simple CLI parser (no oclif dependency).
 *
 * Usage:
 *   osai chat [--session id] [--message "text"]
 *   osai session list|create|resume|delete [args]
 *   osai config show|edit|path
 *   osai init
 *   osai status [--json]
 *   osai version
 *   osai skills list|enable|disable [args]
 *   osai memory search|stats [args]
 *   osai channel list
 *   osai --help
 */

import { chatCommand } from './commands/chat.js';
import { sessionCommand } from './commands/session.js';
import { configCommand } from './commands/config.js';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { versionCommand } from './commands/version.js';
import { skillsCommand } from './commands/skills.js';
import { memoryCommand } from './commands/memory.js';
import { channelCommand } from './commands/channel.js';

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP_TEXT = `
osaI -- AI Operating System CLI

USAGE:
  osai <command> [action] [options]

COMMANDS:
  chat           Interactive chat session
  session        Session management (list, create, resume, delete)
  config         Configuration management (show, edit, path)
  init           Initialize ~/.osai/ directory
  status         System status
  version        Show CLI version
  skills         Skills management (list, enable, disable)
  memory         Memory operations (search, stats)
  channel        Channel management (list)

OPTIONS:
  --json         Machine-readable JSON output
  --help, -h     Show help
  --version, -v  Show version

EXAMPLES:
  osai init
  osai chat --message "Hello"
  osai session list --json
  osai config show
  osai status
`.trimStart();

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): { command: string; action?: string; args: string[]; flags: Record<string, boolean | string> } {
  const rawArgs = argv.slice(2); // remove node and script

  // Handle global flags in first position (e.g. --help, --version)
  if (rawArgs[0] === '--help' || rawArgs[0] === '-h') {
    return { command: '', args: [], flags: { help: true } };
  }
  if (rawArgs[0] === '--version' || rawArgs[0] === '-v') {
    return { command: '', args: [], flags: { version: true } };
  }

  const command = rawArgs[0] ?? '';
  const rest = rawArgs.slice(1);
  const positional: string[] = [];
  const flags: Record<string, boolean | string> = {};

  let action: string | undefined;
  let foundAction = false;

  // For commands that have sub-actions (session, config, skills, memory, channel),
  // the first positional argument is the action.
  const subCommandActions = ['session', 'config', 'skills', 'memory', 'channel'];

  for (const arg of rest) {
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--version' || arg === '-v') {
      flags.version = true;
    } else if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--message' || arg === '-m') {
      flags._nextIsMessage = true;
    } else if (arg === '--session' || arg === '-s') {
      flags._nextIsSession = true;
    } else if (flags._nextIsMessage === true) {
      flags.message = arg;
      delete flags._nextIsMessage;
    } else if (flags._nextIsSession === true) {
      flags.session = arg;
      delete flags._nextIsSession;
    } else if (arg.startsWith('--')) {
      flags[arg.slice(2)] = true;
    } else if (!foundAction && subCommandActions.includes(command)) {
      action = arg;
      foundAction = true;
    } else {
      positional.push(arg);
    }
  }

  return { command, action, args: positional, flags };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { command, action, args, flags } = parseArgs(process.argv);

  // Global flags
  if (flags.help || command === 'help' || command === '') {
    process.stdout.write(HELP_TEXT + '\n');
    return;
  }

  if (flags.version) {
    await versionCommand();
    return;
  }

  // Route to commands
  switch (command) {
    case 'chat': {
      await chatCommand({
        sessionId: typeof flags.session === 'string' ? flags.session : undefined,
        message: typeof flags.message === 'string' ? flags.message : undefined,
        json: flags.json === true,
      });
      break;
    }

    case 'session': {
      if (!action) {
        process.stderr.write('Error: session requires an action (list, create, resume, delete)\n');
        process.exitCode = 2;
        return;
      }
      await sessionCommand(
        action as 'list' | 'create' | 'resume' | 'delete',
        args,
        { json: flags.json === true },
      );
      break;
    }

    case 'config': {
      if (!action) {
        process.stderr.write('Error: config requires an action (show, edit, path)\n');
        process.exitCode = 2;
        return;
      }
      await configCommand(
        action as 'show' | 'edit' | 'path',
        args,
        { json: flags.json === true },
      );
      break;
    }

    case 'init': {
      await initCommand();
      break;
    }

    case 'status': {
      await statusCommand({ json: flags.json === true });
      break;
    }

    case 'version': {
      await versionCommand();
      break;
    }

    case 'skills': {
      if (!action) {
        process.stderr.write('Error: skills requires an action (list, enable, disable)\n');
        process.exitCode = 2;
        return;
      }
      await skillsCommand(
        action as 'list' | 'enable' | 'disable',
        args,
        { json: flags.json === true },
      );
      break;
    }

    case 'memory': {
      if (!action) {
        process.stderr.write('Error: memory requires an action (search, stats)\n');
        process.exitCode = 2;
        return;
      }
      await memoryCommand(
        action as 'search' | 'stats',
        args,
        { json: flags.json === true },
      );
      break;
    }

    case 'channel': {
      if (!action) {
        process.stderr.write('Error: channel requires an action (list)\n');
        process.exitCode = 2;
        return;
      }
      await channelCommand(action, args, { json: flags.json === true });
      break;
    }

    default: {
      process.stderr.write(`Error: unknown command "${command}"\n`);
      process.stdout.write(HELP_TEXT + '\n');
      process.exitCode = 2;
    }
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
