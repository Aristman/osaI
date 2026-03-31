/**
 * @osai/cli -- osai status (DOMAIN-011, T-005)
 *
 * Displays the current status of the osaI system:
 * - Gateway connection status
 * - LLM providers status
 * - Memory system status
 *
 * Usage:
 *   osai status
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error
 */

import { GatewayClient } from "../ws/gateway-client.js";
import { readConfig, DEFAULT_CONFIG_PATH, OSAI_HOME } from "../utils/config.js";
import { formatKeyValueTable } from "../utils/table.js";
import fs from "node:fs";
import path from "node:path";
import pino from "pino";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusOptions {
  /** Gateway URL override */
  gatewayUrl?: string;
}

interface SystemStatus {
  config: {
    loaded: boolean;
    path: string;
    version?: string;
  };
  gateway: {
    status: "connected" | "disconnected" | "error";
    url: string;
  };
  memory: {
    dataDir: string;
    dbExists: boolean;
  };
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

/**
 * Execute the `osai status` command.
 *
 * Attempts to connect to Gateway and reports system status.
 *
 * @param options - Status options (gatewayUrl)
 */
export async function runStatus(options: StatusOptions = {}): Promise<void> {
  try {
    const status = await collectStatus(options);
    printStatus(status);
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Status collection
// ---------------------------------------------------------------------------

/**
 * Collect system status information.
 */
async function collectStatus(options: StatusOptions): Promise<SystemStatus> {
  // Config status
  let configLoaded = false;
  let configVersion: string | undefined;

  try {
    readConfig();
    configLoaded = true;
    configVersion = "3.0.0";
  } catch {
    // Config not found or invalid
  }

  // Gateway URL
  const gatewayUrl = options.gatewayUrl ?? "ws://127.0.0.1:18789";

  // Gateway connection check
  let gatewayStatus: "connected" | "disconnected" | "error" = "disconnected";

  try {
    const connected = await probeGateway(gatewayUrl);
    gatewayStatus = connected ? "connected" : "disconnected";
  } catch {
    gatewayStatus = "error";
  }

  // Memory status
  const dataDir = path.join(OSAI_HOME, "data");
  const dbPath = path.join(dataDir, "osai.db");
  const dbExists = fs.existsSync(dbPath);

  return {
    config: {
      loaded: configLoaded,
      path: DEFAULT_CONFIG_PATH,
      version: configVersion,
    },
    gateway: {
      status: gatewayStatus,
      url: gatewayUrl,
    },
    memory: {
      dataDir,
      dbExists,
    },
  };
}

/**
 * Probe Gateway connectivity with a short timeout.
 */
function probeGateway(url: string, timeoutMs = 3000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const client = new GatewayClient({
      url,
      logger: pino({ level: "silent" }),
      maxRetries: 0,
    });

    const timer = setTimeout(() => {
      client.disconnect();
      resolve(false);
    }, timeoutMs);

    client.on("connected", () => {
      clearTimeout(timer);
      client.disconnect();
      resolve(true);
    });

    client.on("failed", () => {
      clearTimeout(timer);
      resolve(false);
    });

    client.connect();
  });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printStatus(status: SystemStatus): void {
  process.stdout.write("=== osaI System Status ===\n\n");

  // Config
  process.stdout.write("Configuration:\n");
  const configPairs: [string, string | undefined][] = [
    ["Path", status.config.path],
    ["Version", status.config.version ?? "not loaded"],
    ["Status", status.config.loaded ? "loaded" : "not found"],
  ];
  process.stdout.write(formatKeyValueTable(configPairs));
  process.stdout.write("\n");

  // Gateway
  process.stdout.write("Gateway:\n");
  const statusLabel =
    status.gateway.status === "connected"
      ? "connected"
      : status.gateway.status === "error"
        ? "error"
        : "disconnected";
  const gatewayPairs: [string, string][] = [
    ["URL", status.gateway.url],
    ["Status", statusLabel],
  ];
  process.stdout.write(formatKeyValueTable(gatewayPairs));
  process.stdout.write("\n");

  // Memory
  process.stdout.write("Memory:\n");
  const memoryPairs: [string, string][] = [
    ["Data directory", status.memory.dataDir],
    ["Database", status.memory.dbExists ? "exists" : "not created"],
  ];
  process.stdout.write(formatKeyValueTable(memoryPairs));
  process.stdout.write("\n");
}
