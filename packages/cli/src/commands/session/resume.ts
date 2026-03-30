/**
 * @osai/cli -- osai session resume (DOMAIN-011, T-005)
 *
 * Resumes a previous session by ID.
 *
 * Usage:
 *   osai session resume <session-id>
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error
 */

import { GatewayClient } from "../../ws/gateway-client.js";
import { sendCommand } from "../../ws/protocol.js";
import pino from "pino";

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

/**
 * Execute the `osai session resume` command.
 *
 * @param sessionId - Session ID to resume
 */
export async function runSessionResume(sessionId?: string): Promise<void> {
  if (!sessionId) {
    process.stderr.write("Error: session ID is required\n");
    process.stderr.write("Usage: osai session resume <session-id>\n");
    process.exit(2);
  }

  try {
    const logger = pino({ level: "silent" });
    const client = new GatewayClient({ logger });
    const cliSessionId = `cli-session-${Date.now()}`;

    const timer = setTimeout(() => {
      client.disconnect();
      process.stderr.write("Error: Gateway did not respond in time.\n");
      process.exit(1);
    }, 5000);

    let responded = false;

    client.on("connected", () => {
      try {
        sendCommand(client, cliSessionId, "session_resume", { session_id: sessionId });
      } catch {
        // ignore
      }
    });

    client.on("message", (data) => {
      if (responded) return;
      try {
        const raw = typeof data === "string" ? data : data.toString("utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.type === "block") {
          clearTimeout(timer);
          client.disconnect();
          responded = true;

          const content = String(parsed.content ?? "Session resumed.");
          process.stdout.write(`${content}\n`);
          process.exit(0);
        }
      } catch {
        // ignore
      }
    });

    client.on("failed", () => {
      clearTimeout(timer);
      if (!responded) {
        process.stderr.write("Error: Cannot connect to Gateway. Is the gateway running?\n");
        process.exit(1);
      }
    });

    client.connect();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}
