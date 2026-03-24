/**
 * channel command -- channel management
 *
 * Usage:
 *   osai channel list [--json]
 */

import { GatewayClient } from '../lib/gateway-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelOptions {
  json?: boolean;
}

// ---------------------------------------------------------------------------
// channelCommand
// ---------------------------------------------------------------------------

export async function channelCommand(
  action: string,
  _args: string[],
  options?: ChannelOptions,
): Promise<void> {
  if (action !== 'list') {
    process.stderr.write(`Error: unknown channel action "${action}"\n`);
    process.exitCode = 2;
    return;
  }

  const client = new GatewayClient();
  try {
    await client.connect();
  } catch {
    if (options?.json) {
      process.stdout.write(JSON.stringify({ channels: [], error: 'Gateway unavailable' }) + '\n');
    } else {
      process.stderr.write('Error: Cannot connect to Gateway\n');
    }
    process.exitCode = 1;
    return;
  }

  client.sendCommand('channel.list');
  await new Promise((r) => setTimeout(r, 500));

  if (options?.json) {
    process.stdout.write(JSON.stringify({ channels: [] }) + '\n');
  } else {
    process.stdout.write('Channels:\n  (query sent to Gateway)\n');
  }

  await client.disconnect();
}
