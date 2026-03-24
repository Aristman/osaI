/**
 * memory command -- memory operations
 *
 * Usage:
 *   osai memory search <query> [--json]
 *   osai memory stats [--json]
 */

import { GatewayClient } from '../lib/gateway-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryAction = 'search' | 'stats';

export interface MemoryOptions {
  json?: boolean;
}

// ---------------------------------------------------------------------------
// memoryCommand
// ---------------------------------------------------------------------------

export async function memoryCommand(
  action: MemoryAction,
  args: string[],
  options?: MemoryOptions,
): Promise<void> {
  switch (action) {
    case 'search': {
      if (!args[0]) {
        process.stderr.write('Error: search query required\n');
        process.exitCode = 2;
        return;
      }
      await memorySearch(args[0], options);
      break;
    }
    case 'stats': {
      await memoryStats(options);
      break;
    }
    default: {
      process.stderr.write(`Error: unknown memory action "${action}"\n`);
      process.exitCode = 2;
    }
  }
}

// ---------------------------------------------------------------------------
// Sub-commands
// ---------------------------------------------------------------------------

async function memorySearch(query: string, options?: MemoryOptions): Promise<void> {
  const client = new GatewayClient();
  try {
    await client.connect();
  } catch {
    if (options?.json) {
      process.stdout.write(JSON.stringify({ results: [], error: 'Gateway unavailable' }) + '\n');
    } else {
      process.stderr.write('Error: Cannot connect to Gateway\n');
    }
    process.exitCode = 1;
    return;
  }

  client.sendCommand('memory.search', { query });
  await new Promise((r) => setTimeout(r, 500));

  if (options?.json) {
    process.stdout.write(JSON.stringify({ query, results: [] }) + '\n');
  } else {
    process.stdout.write(`Searching memory for: "${query}"\n`);
    process.stdout.write('(query sent to Gateway)\n');
  }

  await client.disconnect();
}

async function memoryStats(options?: MemoryOptions): Promise<void> {
  const client = new GatewayClient();
  try {
    await client.connect();
  } catch {
    if (options?.json) {
      process.stdout.write(JSON.stringify({ error: 'Gateway unavailable' }) + '\n');
    } else {
      process.stderr.write('Error: Cannot connect to Gateway\n');
    }
    process.exitCode = 1;
    return;
  }

  client.sendCommand('memory.stats');
  await new Promise((r) => setTimeout(r, 500));

  if (options?.json) {
    process.stdout.write(JSON.stringify({ stats: {} }) + '\n');
  } else {
    process.stdout.write('Memory statistics: (query sent to Gateway)\n');
  }

  await client.disconnect();
}
