/**
 * skills command -- skills management
 *
 * Usage:
 *   osai skills list [--json]
 *   osai skills enable <name>
 *   osai skills disable <name>
 */

import { GatewayClient } from '../lib/gateway-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillsAction = 'list' | 'enable' | 'disable';

export interface SkillsOptions {
  json?: boolean;
}

// ---------------------------------------------------------------------------
// skillsCommand
// ---------------------------------------------------------------------------

export async function skillsCommand(
  action: SkillsAction,
  args: string[],
  options?: SkillsOptions,
): Promise<void> {
  switch (action) {
    case 'list': {
      await skillsList(options);
      break;
    }
    case 'enable': {
      if (!args[0]) {
        process.stderr.write('Error: skill name required\n');
        process.exitCode = 2;
        return;
      }
      await skillsEnable(args[0]);
      break;
    }
    case 'disable': {
      if (!args[0]) {
        process.stderr.write('Error: skill name required\n');
        process.exitCode = 2;
        return;
      }
      await skillsDisable(args[0]);
      break;
    }
    default: {
      process.stderr.write(`Error: unknown skills action "${action}"\n`);
      process.exitCode = 2;
    }
  }
}

// ---------------------------------------------------------------------------
// Sub-commands
// ---------------------------------------------------------------------------

async function skillsList(options?: SkillsOptions): Promise<void> {
  const client = new GatewayClient();
  try {
    await client.connect();
  } catch {
    if (options?.json) {
      process.stdout.write(JSON.stringify({ skills: [], error: 'Gateway unavailable' }) + '\n');
    } else {
      process.stderr.write('Error: Cannot connect to Gateway\n');
    }
    process.exitCode = 1;
    return;
  }

  client.sendCommand('skills.list');
  await new Promise((r) => setTimeout(r, 500));

  if (options?.json) {
    process.stdout.write(JSON.stringify({ skills: [] }) + '\n');
  } else {
    process.stdout.write('Skills:\n  (query sent to Gateway)\n');
  }

  await client.disconnect();
}

async function skillsEnable(name: string): Promise<void> {
  const client = new GatewayClient();
  try {
    await client.connect();
  } catch {
    process.stderr.write('Error: Cannot connect to Gateway\n');
    process.exitCode = 1;
    return;
  }

  client.sendCommand('skills.enable', { name });
  process.stdout.write(`Skill "${name}" enabled.\n`);
  await client.disconnect();
}

async function skillsDisable(name: string): Promise<void> {
  const client = new GatewayClient();
  try {
    await client.connect();
  } catch {
    process.stderr.write('Error: Cannot connect to Gateway\n');
    process.exitCode = 1;
    return;
  }

  client.sendCommand('skills.disable', { name });
  process.stdout.write(`Skill "${name}" disabled.\n`);
  await client.disconnect();
}
