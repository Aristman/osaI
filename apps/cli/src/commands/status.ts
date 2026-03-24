/**
 * status command -- system status
 *
 * Usage:
 *   osai status [--json]
 */

import { GatewayClient } from '../lib/gateway-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusOptions {
  json?: boolean;
}

interface StatusInfo {
  gateway: {
    connected: boolean;
    host: string;
    port: number;
  };
  timestamp: string;
}

// ---------------------------------------------------------------------------
// statusCommand
// ---------------------------------------------------------------------------

export async function statusCommand(options?: StatusOptions): Promise<void> {
  const client = new GatewayClient();
  let connected = false;

  try {
    await client.connect();
    connected = true;
  } catch {
    connected = false;
  }

  const status: StatusInfo = {
    gateway: {
      connected,
      host: client.connectionState === 'connected' ? '127.0.0.1' : 'unreachable',
      port: 18789,
    },
    timestamp: new Date().toISOString(),
  };

  if (connected) {
    await client.disconnect();
  }

  if (options?.json) {
    process.stdout.write(JSON.stringify(status, null, 2) + '\n');
  } else {
    process.stdout.write(`Gateway: ${status.gateway.connected ? 'connected' : 'disconnected'}\n`);
    process.stdout.write(`Host: ${status.gateway.host}\n`);
    process.stdout.write(`Port: ${status.gateway.port}\n`);
    process.stdout.write(`Time: ${status.timestamp}\n`);
  }
}
