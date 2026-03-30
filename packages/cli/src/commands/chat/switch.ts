/**
 * @osai/cli -- Chat Switch Command (DOMAIN-011, T-004)
 *
 * Switches the active chat context.
 *
 * Usage:
 *   osai chat switch <chat-id>
 *
 * Test Cases:
 *   TT-004-03: switches active chat, success message, exit 0
 *   TT-004-06: Gateway unavailable -- error message on STDERR, exit 1
 */

import pino from "pino";
import { executeGatewayCommand } from "../../ws/gateway-connector.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatSwitchResponse {
  active_chat_id?: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * Execute the `osai chat switch <id>` command.
 *
 * Sends a "chat_switch" command to Gateway with the target chat ID.
 * Prints a success message with the switched chat info.
 *
 * Exit codes:
 *   0 - Success (chat switched)
 *   1 - Error (invalid ID, chat not found, Gateway unavailable)
 */
export async function runChatSwitch(
  chatId: string,
  options: { gatewayUrl?: string } = {},
): Promise<void> {
  const logger = pino({ name: "cli-chat-switch" });

  if (!chatId || chatId.trim().length === 0) {
    process.stderr.write("Error: Chat ID is required.\n");
    process.stderr.write("Usage: osai chat switch <chat-id>\n");
    process.exit(1);
  }

  const response = await executeGatewayCommand("chat_switch", { chat_id: chatId }, {
    url: options.gatewayUrl,
    logger: logger,
  });

  if (!response.success) {
    process.stderr.write(`Error: ${response.error}\n`);
    process.exit(1);
  }

  const data = response.data as ChatSwitchResponse;
  const activeId = data.active_chat_id ?? chatId;
  const chatName = data.name ?? "";

  process.stdout.write(`Switched to chat ${activeId}`);
  if (chatName) {
    process.stdout.write(` ("${chatName}")`);
  }
  process.stdout.write(`.\n`);
}
