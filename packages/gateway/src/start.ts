/**
 * @osai/gateway -- Start Entry Point
 *
 * Starts the gateway application with default configuration.
 * Reads config from ~/.osai/osai.json (or env overrides).
 *
 * Usage:
 *   pnpm --filter @osai/gateway start
 *   node packages/gateway/dist/start.js
 */

import { GatewayApp } from "./app.js";
import { loadConfig, getConfig, getConfigPath } from "./config.js";
import { getOsaiDir } from "./config.js";

async function main(): Promise<void> {
  // Load config — fallback to defaults if file doesn't exist
  const osaiDir = getOsaiDir();

  let configPath: string | undefined;
  try {
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
  const app = new GatewayApp(config);

  // Handle shutdown
  const shutdown = async () => {
    console.log("\n[gateway] Shutting down...");
    await app.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.start();

  console.log(`[gateway] WebSocket server running at ws://0.0.0.0:18790`);
  console.log(`[gateway] Model: ${config.agent.model}`);
  console.log(`[gateway] Config: ${osaiDir}/osai.json`);
  console.log(`[gateway] Press Ctrl+C to stop.`);
}

main().catch((err) => {
  console.error("[gateway] Fatal error:", err);
  process.exit(1);
});
