/**
 * @osai/cli -- Chat Create Command (DOMAIN-011, T-004)
 *
 * Creates a new chat with an optional name.
 *
 * Usage:
 *   osai chat create
 *   osai chat create --name "My Chat"
 *
 * Test Cases:
 *   TT-004-02: creates chat, prints success message with chat_id, exit 0
 *   TT-004-06: Gateway unavailable -- error message on STDERR, exit 1
 */

import pino from "pino";
import { executeGatewayCommand } from "../../ws/gateway-connector.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatCreateResponse {
  chat_id?: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * Execute the `osai chat create` command.
 *
 * Sends a "chat_create" command to Gateway with an optional name.
 * Prints the created chat ID on success.
 *
 * Exit codes:
 *   0 - Success (chat created, ID printed)
 *   1 - Error (message printed to STDERR)
 */
export async function runChatCreate(
  options: { name?: string; gatewayUrl?: string } = {},
): Promise<void> {
  const logger = pino({ name: "cli-chat-create" });

  const args: Record<string, unknown> = {};
  if (options.name !== undefined) {
    args.name = options.name;
  }

  const response = await executeGatewayCommand("chat_create", args, {
    url: options.gatewayUrl,
    logger: logger,
  });

  if (!response.success) {
    process.stderr.write(`Error: ${response.error}\n`);
    process.exit(1);
  }

  const data = response.data as ChatCreateResponse;
  const chatId = data.chat_id ?? "unknown";
  const chatName = data.name ?? "Untitled";

  process.stdout.write(`Chat created successfully.\n`);
  process.stdout.write(`  ID:   ${chatId}\n`);
  process.stdout.write(`  Name: ${chatName}\n`);
}
