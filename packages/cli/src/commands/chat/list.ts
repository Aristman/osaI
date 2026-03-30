/**
 * @osai/cli -- Chat List Command (DOMAIN-011, T-004)
 *
 * Lists all chats as a formatted table.
 *
 * Usage:
 *   osai chat list
 *
 * Output: Table with columns: ID, Name, Status, Last Activity
 *
 * Test Cases:
 *   TT-004-01: outputs table with id, name, status, last activity
 *   TT-004-06: Gateway unavailable -- error message on STDERR, exit 1
 */

import pino from "pino";
import { executeGatewayCommand } from "../../ws/gateway-connector.js";
import { formatTable } from "../../utils/table.js";
import type { TableColumn, TableRow } from "../../utils/table.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatEntry {
  id: string;
  name: string;
  status: string;
  last_activity: string;
}

interface ChatListResponse {
  chats?: ChatEntry[];
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * Execute the `osai chat list` command.
 *
 * Sends a "chat_list" command to Gateway and formats the response as a table.
 *
 * Exit codes:
 *   0 - Success (table printed to STDOUT)
 *   1 - Error (message printed to STDERR)
 */
export async function runChatList(
  options: { gatewayUrl?: string } = {},
): Promise<void> {
  const logger = pino({ name: "cli-chat-list" });

  const response = await executeGatewayCommand("chat_list", undefined, {
    url: options.gatewayUrl,
    logger: logger,
  });

  if (!response.success) {
    process.stderr.write(`Error: ${response.error}\n`);
    process.exit(1);
  }

  const data = response.data as ChatListResponse;
  const chats = data.chats ?? [];

  if (chats.length === 0) {
    process.stdout.write("No chats found.\n");
    return;
  }

  const columns: TableColumn[] = [
    { header: "ID", minWidth: 10 },
    { header: "Name", minWidth: 20 },
    { header: "Status", minWidth: 10 },
    { header: "Last Activity", minWidth: 20 },
  ];

  const rows: TableRow[] = chats.map((chat) => ({
    cells: [chat.id, chat.name, chat.status, chat.last_activity],
  }));

  const table = formatTable(columns, rows);

  process.stdout.write(table);
}
