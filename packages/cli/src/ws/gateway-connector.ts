/**
 * @osai/cli -- Gateway Connector (DOMAIN-011, T-004)
 *
 * Helper for establishing a short-lived Gateway connection
 * used by CLI commands that send a single command and collect
 * the response.
 *
 * The connector:
 *   1. Creates a GatewayClient
 *   2. Connects to Gateway
 *   3. Sends a command via sendCommand()
 *   4. Waits for a response message
 *   5. Disconnects
 *   6. Returns the response
 */

import { GatewayClient } from "./gateway-client.js";
import { sendCommand } from "./protocol.js";
import pino from "pino";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GatewayConnectorOptions {
  /** Gateway WebSocket URL (default: ws://127.0.0.1:18789) */
  url?: string;
  /** Connection timeout in ms (default: 5000) */
  connectTimeoutMs?: number;
  /** Response timeout in ms (default: 10000) */
  responseTimeoutMs?: number;
  /** Logger instance (optional) */
  logger?: pino.Logger;
}

export interface CommandResponse {
  /** Whether the command succeeded */
  success: boolean;
  /** Response data from Gateway */
  data: unknown;
  /** Human-readable error message (if failed) */
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_RESPONSE_TIMEOUT_MS = 10000;
const SESSION_ID = "cli-command";

// ---------------------------------------------------------------------------
// GatewayConnector
// ---------------------------------------------------------------------------

/**
 * Execute a Gateway command and return the response.
 *
 * This is a convenience wrapper for CLI commands that need to:
 *   - Connect to Gateway
 *   - Send a single command
 *   - Wait for the response
 *   - Disconnect
 *
 * @param command - Command name (e.g. "chat_list", "chat_create")
 * @param args - Optional command arguments
 * @param options - Connector options
 * @returns CommandResponse with the result
 */
export async function executeGatewayCommand(
  command: string,
  args?: Record<string, unknown>,
  options: GatewayConnectorOptions = {},
): Promise<CommandResponse> {
  const logger = options.logger ?? pino({ name: "gateway-connector" });
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const responseTimeoutMs = options.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;

  const client = new GatewayClient({
    url: options.url,
    logger: logger,
    maxRetries: 0, // No retries for CLI commands -- fail fast
  });

  try {
    // Connect with timeout
    const connected = await waitForConnection(client, connectTimeoutMs);
    if (!connected) {
      return {
        success: false,
        data: null,
        error: "Cannot connect to Gateway. Is the Gateway running? (osai start)",
      };
    }

    // Send command
    sendCommand(client, SESSION_ID, command, args);

    // Wait for response with timeout
    const responseData = await waitForResponse(client, responseTimeoutMs);

    return {
      success: true,
      data: responseData,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: null,
      error: message,
    };
  } finally {
    client.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Wait for GatewayClient to connect within timeout.
 */
function waitForConnection(
  client: GatewayClient,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (client.isConnected) {
      resolve(true);
      return;
    }

    const timer = setTimeout(() => {
      client.disconnect();
      resolve(false);
    }, timeoutMs);

    client.on("connected", () => {
      clearTimeout(timer);
      resolve(true);
    });

    client.on("failed", () => {
      clearTimeout(timer);
      resolve(false);
    });

    client.connect();
  });
}

/**
 * Wait for a response message from Gateway.
 *
 * Expects a message with `type: "command_response"` or falls back
 * to the first received message.
 */
function waitForResponse(
  client: GatewayClient,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Gateway did not respond in time"));
    }, timeoutMs);

    client.on("message", (data) => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
        resolve(parsed);
      } catch {
        resolve(data.toString());
      }
    });

    client.on("disconnected", () => {
      clearTimeout(timer);
      reject(new Error("Connection lost while waiting for response"));
    });
  });
}
