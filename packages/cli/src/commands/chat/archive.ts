/**
 * @osai/cli -- Chat Archive Command (DOMAIN-011, T-004)
 *
 * Archives a chat by ID.
 *
 * Usage:
 *   osai chat archive <chat-id>
 *
 * Test Cases:
 *   TT-004-05: archives chat, success message, exit 0
 *   TT-004-06: Gateway unavailable -- error message on STDERR, exit 1
 */

import pino from "pino";
import { executeGatewayCommand } from "../../ws/gateway-connector.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatArchiveResponse {
  archived_chat_id?: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * Execute the `osai chat archive <id>` command.
 *
 * Sends a "chat_archive" command to Gateway with the target chat ID.
 * Prints a success message on completion.
 *
 * Exit codes:
 *   0 - Success (chat archived)
 *   1 - Error (invalid ID, chat not found, Gateway unavailable)
 */
export async function runChatArchive(
  chatId: string,
  options: { gatewayUrl?: string } = {},
): Promise<void> {
  const logger = pino({ name: "cli-chat-archive" });

  if (!chatId || chatId.trim().length === 0) {
    process.stderr.write("Error: Chat ID is required.\n");
    process.stderr.write("Usage: osai chat archive <chat-id>\n");
    process.exit(1);
  }

  const response = await executeGatewayCommand("chat_archive", { chat_id: chatId }, {
    url: options.gatewayUrl,
    logger: logger,
  });

  if (!response.success) {
    process.stderr.write(`Error: ${response.error}\n`);
    process.exit(1);
  }

  const data = response.data as ChatArchiveResponse;
  const archivedId = data.archived_chat_id ?? chatId;
  const chatName = data.name ?? "";

  process.stdout.write(`Chat ${archivedId}`);
  if (chatName) {
    process.stdout.write(` ("${chatName}")`);
  }
  process.stdout.write(` archived.\n`);
}
