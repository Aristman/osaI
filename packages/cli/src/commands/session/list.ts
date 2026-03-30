/**
 * @osai/cli -- osai session list (DOMAIN-011, T-005)
 *
 * Lists active sessions. Communicates with Gateway via command protocol.
 *
 * Usage:
 *   osai session list [--limit N]
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error (including Gateway unreachable)
 */

import { GatewayClient } from "../../ws/gateway-client.js";
import { sendCommand } from "../../ws/protocol.js";
import { formatTable } from "../../utils/table.js";
import pino from "pino";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionListOptions {
  /** Maximum number of sessions to display (default: 20) */
  limit?: number;
}

interface SessionEntry {
  id: string;
  chat: string;
  status: string;
  started: string;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

/**
 * Execute the `osai session list` command.
 *
 * Connects to Gateway, sends session_list command, and displays results as a table.
 *
 * @param options - Session list options
 */
export async function runSessionList(options: SessionListOptions = {}): Promise<void> {
  const limit = options.limit ?? 20;

  try {
    const response = await sendGatewayCommand({
      command: "session_list",
      args: { limit },
    });

    const sessions = parseSessions(response);
    printSessions(sessions);
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Gateway communication
// ---------------------------------------------------------------------------

/**
 * Send a command to Gateway and wait for a response.
 * Returns a promise that resolves when a block message is received.
 */
function sendGatewayCommand(params: {
  command: string;
  args?: Record<string, unknown>;
}): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const logger = pino({ level: "silent" });
    const client = new GatewayClient({ logger });
    const sessionId = `cli-session-${Date.now()}`;
    let resolved = false;

    const timer = setTimeout(() => {
      client.disconnect();
      if (!resolved) {
        resolved = true;
        reject(new Error("Cannot connect to Gateway. Is the gateway running?"));
      }
    }, 5000);

    client.on("connected", () => {
      try {
        sendCommand(client, sessionId, params.command, params.args);
      } catch {
        // ignore
      }
    });

    client.on("message", (data) => {
      if (resolved) return;
      try {
        const raw = typeof data === "string" ? data : data.toString("utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.type === "block" && parsed.block_type === "table") {
          clearTimeout(timer);
          client.disconnect();
          resolved = true;
          resolve(parsed.content);
        }
      } catch {
        // ignore non-JSON or parse errors
      }
    });

    client.on("failed", () => {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        reject(new Error("Cannot connect to Gateway. Is the gateway running?"));
      }
    });

    client.connect();
  });
}

// ---------------------------------------------------------------------------
// Parse & display
// ---------------------------------------------------------------------------

function parseSessions(response: unknown): SessionEntry[] {
  if (Array.isArray(response)) {
    return response.map((item) => ({
      id: String((item as Record<string, unknown>).id ?? "unknown"),
      chat: String((item as Record<string, unknown>).chat ?? "unknown"),
      status: String((item as Record<string, unknown>).status ?? "unknown"),
      started: String((item as Record<string, unknown>).started ?? "unknown"),
    }));
  }

  // Fallback: return empty list
  return [];
}

function printSessions(sessions: SessionEntry[]): void {
  if (sessions.length === 0) {
    process.stdout.write("No active sessions.\n");
    return;
  }

  const columns = [
    { header: "ID", minWidth: 12, maxWidth: 36 },
    { header: "Chat", minWidth: 20, maxWidth: 30 },
    { header: "Status", minWidth: 12 },
    { header: "Started", minWidth: 19, maxWidth: 19 },
  ];

  const rows = sessions.map((s) => ({
    cells: [s.id, s.chat, s.status, s.started],
  }));

  process.stdout.write(formatTable(columns, rows));
}
