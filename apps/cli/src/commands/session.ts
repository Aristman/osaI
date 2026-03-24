/**
 * session command -- session management
 *
 * Usage:
 *   osai session list [--json]
 *   osai session create [type]
 *   osai session resume <id>
 *   osai session delete <id>
 */

import { GatewayClient } from '../lib/gateway-client.js';
import { SessionManager } from '../lib/session-manager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionAction = 'list' | 'create' | 'resume' | 'delete';

export interface SessionOptions {
  json?: boolean;
}

// ---------------------------------------------------------------------------
// sessionCommand
// ---------------------------------------------------------------------------

export async function sessionCommand(
  action: SessionAction,
  args: string[],
  options?: SessionOptions,
): Promise<void> {
  switch (action) {
    case 'list': {
      await sessionList(options);
      break;
    }
    case 'create': {
      await sessionCreate(args[0]);
      break;
    }
    case 'resume': {
      if (!args[0]) {
        process.stderr.write('Error: session ID required for resume\n');
        process.exitCode = 2;
        return;
      }
      await sessionResume(args[0]);
      break;
    }
    case 'delete': {
      if (!args[0]) {
        process.stderr.write('Error: session ID required for delete\n');
        process.exitCode = 2;
        return;
      }
      await sessionDelete(args[0]);
      break;
    }
    default: {
      process.stderr.write(`Error: unknown session action "${action}"\n`);
      process.exitCode = 2;
    }
  }
}

// ---------------------------------------------------------------------------
// Sub-commands
// ---------------------------------------------------------------------------

async function sessionList(options?: SessionOptions): Promise<void> {
  const client = new GatewayClient();
  try {
    await client.connect();
  } catch {
    if (options?.json) {
      process.stdout.write(JSON.stringify({ sessions: [], error: 'Gateway unavailable' }) + '\n');
    } else {
      process.stderr.write('Error: Cannot connect to Gateway\n');
    }
    process.exitCode = 1;
    return;
  }

  const manager = new SessionManager({ client });
  manager.startListening();

  // Send a command to list sessions
  client.sendCommand('session.list');

  // Wait briefly for response, then list what we have
  await new Promise((r) => setTimeout(r, 500));

  const sessions = manager.getAllSessions();
  client.disconnect();

  if (options?.json) {
    process.stdout.write(JSON.stringify({ sessions }, null, 2) + '\n');
  } else {
    if (sessions.length === 0) {
      process.stdout.write('No active sessions.\n');
    } else {
      for (const s of sessions) {
        process.stdout.write(`  ${s.sessionId.slice(0, 8)}  ${s.state}\n`);
      }
    }
  }
}

async function sessionCreate(type?: string): Promise<void> {
  const sessionType = type ?? 'main';
  if (sessionType !== 'main' && sessionType !== 'group' && sessionType !== 'isolated') {
    process.stderr.write(`Error: invalid session type "${sessionType}". Use main, group, or isolated.\n`);
    process.exitCode = 2;
    return;
  }

  const client = new GatewayClient();
  try {
    await client.connect();
  } catch {
    process.stderr.write('Error: Cannot connect to Gateway\n');
    process.exitCode = 1;
    return;
  }

  client.sendCommand('session.create', { type: sessionType });
  process.stdout.write(`Session created with type "${sessionType}".\n`);
  await client.disconnect();
}

async function sessionResume(id: string): Promise<void> {
  const client = new GatewayClient();
  try {
    await client.connect();
  } catch {
    process.stderr.write('Error: Cannot connect to Gateway\n');
    process.exitCode = 1;
    return;
  }

  client.sendCommand('session.resume', { session_id: id });
  process.stdout.write(`Resuming session ${id.slice(0, 8)}...\n`);
  await client.disconnect();
}

async function sessionDelete(id: string): Promise<void> {
  const client = new GatewayClient();
  try {
    await client.connect();
  } catch {
    process.stderr.write('Error: Cannot connect to Gateway\n');
    process.exitCode = 1;
    return;
  }

  client.sendCommand('session.delete', { session_id: id });
  process.stdout.write(`Session ${id.slice(0, 8)} deleted.\n`);
  await client.disconnect();
}
