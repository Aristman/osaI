// ---------------------------------------------------------------------------
// CLI Command: osai channel add telegram (T-005)
//
// Interactive CLI command for setting up Telegram userbot authentication.
// Wraps AuthFlow from @osai/gateway and provides readline-based prompts.
//
// Usage:
//   osai channel add telegram
//
// Flow:
//   1. Check for existing session
//   2. If no session: phone -> code -> (optional 2FA password)
//   3. Save session and credentials
// ---------------------------------------------------------------------------

import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import readline from "node:readline";
import pino from "pino";
import {
  AuthFlow,
  AuthFlowError,
} from "@osai/gateway";
import type {
  PromptFunction,
  SendAuthRequestFunction,
  AuthFlowResult,
} from "@osai/gateway";

// ---------------------------------------------------------------------------
// Prompt helpers (readline-based)
// ---------------------------------------------------------------------------

/**
 * Create a readline interface for interactive input.
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
}

/**
 * Prompt user for input (non-hidden).
 *
 * @param rl - Readline interface
 * @param message - Prompt message
 * @returns User input string
 */
function promptText(rl: readline.Interface, message: string): Promise<string> {
  return new Promise<string>((resolve) => {
    rl.question(message, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt user for hidden input (password).
 *
 * @param rl - Readline interface
 * @param message - Prompt message
 * @returns User input string
 */
function promptPassword(rl: readline.Interface, message: string): Promise<string> {
  return new Promise<string>((resolve) => {
    // For simplicity, use plain readline.
    // A production implementation would use ink or native readline password mode.
    process.stderr.write(message);
    rl.question("", (answer) => {
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

/**
 * Execute the `osai channel add telegram` command.
 *
 * This function:
 * 1. Prompts for Telegram API credentials (apiId, apiHash) if not in config
 * 2. Delegates to AuthFlow for interactive authentication
 * 3. Prints result summary to stderr/stdout
 *
 * Exit codes:
 *   0 - Success
 *   1 - Authentication failed
 */
export async function runChannelAddTelegram(
  configPath?: string,
): Promise<void> {
  const logger = pino({ name: "cli-channel-add-telegram" }).child({
    component: "cli",
    command: "channel-add-telegram",
  });

  // Resolve config path
  const osaiDir = path.join(os.homedir(), ".osai");
  const configFilePath = configPath ?? path.join(osaiDir, "osai.json");
  const sessionDir = path.join(osaiDir, "channels", "telegram", "session");

  const rl = createReadlineInterface();

  try {
    // Print banner
    process.stderr.write("\n");
    process.stderr.write("=== osai: Telegram Userbot Setup ===\n");
    process.stderr.write("\n");

    // Load existing config or create default
    let config: Record<string, unknown>;
    try {
      const content = fs.readFileSync(configFilePath, "utf-8");
      config = JSON.parse(content) as Record<string, unknown>;
    } catch {
      config = {};
    }

    // Get or prompt for API credentials
    const telegram = (config.channels as Record<string, unknown> | undefined)?.telegram as Record<string, unknown> | undefined;
    const userbot = telegram?.userbot as Record<string, unknown> | undefined;

    let apiId = userbot?.apiId as number | undefined;
    let apiHash = userbot?.apiHash as string | undefined;

    if (apiId === undefined || apiId === 0) {
      const apiIdStr = await promptText(rl, "Enter Telegram API ID (from my.telegram.org): ");
      apiId = parseInt(apiIdStr, 10);
      if (isNaN(apiId) || apiId <= 0) {
        process.stderr.write("Error: Invalid API ID. Must be a positive integer.\n");
        process.exit(1);
      }
    }

    if (apiHash === undefined || apiHash === "") {
      apiHash = await promptText(rl, "Enter Telegram API Hash (from my.telegram.org): ");
      if (apiHash.length === 0) {
        process.stderr.write("Error: API Hash cannot be empty.\n");
        process.exit(1);
      }
    }

    // Create prompt functions bound to readline
    const phonePrompt: PromptFunction = async (msg: string) => {
      return promptText(rl, msg);
    };

    const codePrompt: PromptFunction = async (msg: string) => {
      return promptText(rl, msg);
    };

    const passwordPrompt: PromptFunction = async (msg: string) => {
      return promptPassword(rl, msg);
    };

    // sendAuthRequest delegates to the Python Telethon microservice
    const sendAuthRequest: SendAuthRequestFunction = async (
      params: Record<string, unknown>,
    ): Promise<unknown> => {
      const { spawn } = await import("node:child_process");
      const pythonPath = process.env.PYTHON_PATH ?? "python3";
      const scriptPath = path.join(
        osaiDir,
        "packages",
        "gateway",
        "src",
        "channels",
        "telegram",
        "telethon_userbot",
        "main.py",
      );

      return new Promise<unknown>((resolve, reject) => {
        const proc = spawn(pythonPath, [scriptPath], {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            TELETHON_API_ID: String(apiId),
            TELETHON_API_HASH: apiHash ?? "",
          },
        });

        let stdoutBuffer = "";
        const timeout = setTimeout(() => {
          proc.kill();
          reject(new Error("Python process timed out"));
        }, 120000);

        proc.stdout?.on("data", (chunk: Buffer) => {
          stdoutBuffer += chunk.toString("utf-8");
        });

        proc.stderr?.on("data", (chunk: Buffer) => {
          logger.debug({ stderr: chunk.toString("utf-8") }, "Python stderr");
        });

        proc.on("close", () => {
          clearTimeout(timeout);
          // Parse the last line as JSON response
          const lines = stdoutBuffer.trim().split("\n");
          const lastLine = lines[lines.length - 1];
          if (lastLine) {
            try {
              resolve(JSON.parse(lastLine));
            } catch {
              reject(new Error(`Invalid response from Python: ${lastLine}`));
            }
          } else {
            reject(new Error("No response from Python process"));
          }
        });

        proc.on("error", (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });

        // Send the request
        const request = JSON.stringify({
          type: "auth",
          id: `cli-auth-${Date.now()}`,
          params,
        }) + "\n";

        proc.stdin?.write(request);
        // Close stdin to signal end of input
        proc.stdin?.end();
      });
    };

    const authFlow = new AuthFlow({
      bridge: {},
      sessionDir,
      configFilePath,
      apiId,
      apiHash,
      logger,
      phonePrompt,
      codePrompt,
      passwordPrompt,
      startBridge: async () => {
        logger.debug("CLI auth: bridge lifecycle managed by sendAuthRequest");
      },
      stopBridge: async () => {
        logger.debug("CLI auth: bridge lifecycle managed by sendAuthRequest");
      },
      sendAuthRequest,
    });

    process.stderr.write("Starting authentication...\n");

    const result: AuthFlowResult = await authFlow.authenticate();

    if (result.success) {
      process.stderr.write("\n");
      process.stderr.write("=== Telegram Userbot Setup Complete ===\n");
      process.stderr.write(`  User: ${result.firstName ?? ""} ${result.lastName ?? ""} (@${result.username ?? "N/A"})\n`);
      process.stderr.write(`  User ID: ${result.userId ?? "N/A"}\n`);
      process.stderr.write(`  Phone: ${result.phone}\n`);
      process.stderr.write(`  Session: ${result.reusedSession ? "reused existing" : "new session created"}\n`);
      process.stderr.write(`  Session dir: ${result.sessionDir}\n`);
      process.stderr.write(`  Config: ${configFilePath}\n`);
      process.stderr.write("\n");
      process.stderr.write("You can now enable the userbot in your osai.json config.\n");
    } else {
      process.stderr.write("Authentication failed.\n");
      process.exit(1);
    }
  } catch (err: unknown) {
    if (err instanceof AuthFlowError) {
      process.stderr.write(`\nError: ${err.message}\n`);
      logger.error({ error: err.message }, "Authentication failed");
    } else if (err instanceof Error) {
      process.stderr.write(`\nError: ${err.message}\n`);
      logger.error({ error: err.message }, "Unexpected error");
    } else {
      process.stderr.write("\nAn unexpected error occurred.\n");
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}
