/**
 * @osai/gateway -- Start Entry Point
 *
 * Starts the WebSocket gateway server with default configuration.
 * Reads config from ~/.osai/osai.json (or env overrides).
 *
 * Usage:
 *   pnpm --filter @osai/gateway start
 *   node packages/gateway/dist/start.js
 */

import { WsServer } from "./server/ws-server.js";
import { loadConfig, getConfig } from "./config.js";
import { getOsaiDir } from "./config.js";

async function main(): Promise<void> {
  // Load config — fallback to defaults if file doesn't exist
  const osaiDir = getOsaiDir();

  let configPath: string | undefined;
  try {
    const { getConfigPath } = await import("./config.js");
    configPath = getConfigPath();
  } catch {
    // Config module not available at runtime — use defaults
  }

  try {
    if (configPath) {
      loadConfig(configPath);
    }
  } catch {
    console.log(`[gateway] Config not found at ${configPath}, using defaults.`);
  }

  const config = getConfig();

  const server = new WsServer({
    host: "127.0.0.1",
    port: 18789,
  });

  // Handle shutdown
  const shutdown = async () => {
    console.log("\n[gateway] Shutting down...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.start();
  console.log(`[gateway] WebSocket server running at ws://127.0.0.1:18789`);
  console.log(`[gateway] Model: ${config.agent.model}`);
  console.log(`[gateway] Config: ${osaiDir}/osai.json`);
  console.log(`[gateway] Press Ctrl+C to stop.`);
}

main().catch((err) => {
  console.error("[gateway] Fatal error:", err);
  process.exit(1);
});
