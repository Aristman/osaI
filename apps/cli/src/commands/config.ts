/**
 * config command -- configuration management
 *
 * Usage:
 *   osai config show [--json]
 *   osai config edit
 *   osai config path
 */

import { getConfig, getConfigPath } from '@osai/config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfigAction = 'show' | 'edit' | 'path';

export interface ConfigOptions {
  json?: boolean;
}

// ---------------------------------------------------------------------------
// Sensitive keys to redact from output
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = ['apiKey', 'api_key', 'token', 'secret', 'password'];

function redactConfig(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
      result[key] = '***REDACTED***';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactConfig(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// configCommand
// ---------------------------------------------------------------------------

export async function configCommand(
  action: ConfigAction,
  _args: string[],
  options?: ConfigOptions,
): Promise<void> {
  switch (action) {
    case 'show': {
      await configShow(options);
      break;
    }
    case 'edit': {
      await configEdit();
      break;
    }
    case 'path': {
      await configPath();
      break;
    }
    default: {
      process.stderr.write(`Error: unknown config action "${action}"\n`);
      process.exitCode = 2;
    }
  }
}

// ---------------------------------------------------------------------------
// Sub-commands
// ---------------------------------------------------------------------------

async function configShow(options?: ConfigOptions): Promise<void> {
  try {
    const cfg = await getConfig();
    const safe = redactConfig(cfg as unknown as Record<string, unknown>);

    if (options?.json) {
      process.stdout.write(JSON.stringify(safe, null, 2) + '\n');
    } else {
      process.stdout.write(JSON.stringify(safe, null, 2) + '\n');
    }
  } catch {
    process.stderr.write('Error: Configuration not found. Run "osai init" first.\n');
    process.exitCode = 1;
  }
}

async function configEdit(): Promise<void> {
  const configPath = getConfigPath();
  const editor = process.env.EDITOR ?? 'vi';

  const { execSync } = await import('node:child_process');
  try {
    execSync(`${editor} "${configPath}"`, { stdio: 'inherit' });
  } catch {
    process.stderr.write(`Error: Failed to open editor "${editor}"\n`);
    process.exitCode = 1;
  }
}

async function configPath(): Promise<void> {
  try {
    process.stdout.write(getConfigPath() + '\n');
  } catch {
    process.stderr.write('Error: Cannot determine config path\n');
    process.exitCode = 1;
  }
}
