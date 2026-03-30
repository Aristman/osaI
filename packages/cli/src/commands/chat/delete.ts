/**
 * @osai/cli -- Chat Delete Command (DOMAIN-011, T-004)
 *
 * Deletes a chat by ID with confirmation prompt.
 *
 * Usage:
 *   osai chat delete <chat-id>
 *
 * Flow:
 *   1. Prompt user for confirmation (y/N)
 *   2. Send "chat_delete" command to Gateway
 *   3. Print success/error message
 *
 * Test Cases:
 *   TT-004-04: confirmation prompt, success/error output
 *   TT-004-06: Gateway unavailable -- error message on STDERR, exit 1
 */

import readline from "node:readline";
import pino from "pino";
import { executeGatewayCommand } from "../../ws/gateway-connector.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatDeleteResponse {
  deleted_chat_id?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Prompt user for confirmation.
 *
 * @param rl - Readline interface
 * @param message - Prompt message
 * @returns true if user confirmed (y/Y), false otherwise
 */
function promptConfirmation(rl: readline.Interface, message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    rl.question(message, (answer) => {
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * Execute the `osai chat delete <id>` command.
 *
 * Prompts for confirmation before sending the delete command.
 *
 * Exit codes:
 *   0 - Success (chat deleted)
 *   1 - Error (cancelled, invalid ID, Gateway unavailable)
 */
export async function runChatDelete(
  chatId: string,
  options: { gatewayUrl?: string; yes?: boolean } = {},
): Promise<void> {
  const logger = pino({ name: "cli-chat-delete" });

  if (!chatId || chatId.trim().length === 0) {
    process.stderr.write("Error: Chat ID is required.\n");
    process.stderr.write("Usage: osai chat delete <chat-id>\n");
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  try {
    // Confirmation prompt (skip if --yes flag)
    let confirmed = options.yes ?? false;
    if (!confirmed) {
      confirmed = await promptConfirmation(
        rl,
        `Are you sure you want to delete chat "${chatId}"? [y/N] `,
      );
    }

    if (!confirmed) {
      process.stderr.write("Cancelled.\n");
      process.exit(1);
    }

    const response = await executeGatewayCommand("chat_delete", { chat_id: chatId }, {
      url: options.gatewayUrl,
      logger: logger,
    });

    if (!response.success) {
      process.stderr.write(`Error: ${response.error}\n`);
      process.exit(1);
    }

    const data = response.data as ChatDeleteResponse;
    const deletedId = data.deleted_chat_id ?? chatId;

    process.stdout.write(`Chat ${deletedId} deleted.\n`);
  } finally {
    rl.close();
  }
}
