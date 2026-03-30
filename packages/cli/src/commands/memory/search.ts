/**
 * @osai/cli -- osai memory search (DOMAIN-011, T-005)
 *
 * Searches the long-term memory for entries matching a query.
 *
 * Usage:
 *   osai memory search "query" [--limit N]
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error
 */

import { GatewayClient } from "../../ws/gateway-client.js";
import { sendCommand } from "../../ws/protocol.js";
import { formatTable } from "../../utils/table.js";
import pino from "pino";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemorySearchOptions {
  /** Maximum results (default: 10) */
  limit?: number;
}

interface MemoryEntry {
  id: string;
  content: string;
  score: number;
  category: string;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

/**
 * Execute the `osai memory search` command.
 *
 * @param query - Search query string
 * @param options - Search options (limit)
 */
export async function runMemorySearch(
  query?: string,
  options: MemorySearchOptions = {},
): Promise<void> {
  if (!query) {
    process.stderr.write("Error: search query is required\n");
    process.stderr.write("Usage: osai memory search \"query\"\n");
    process.exit(2);
  }

  const limit = options.limit ?? 10;

  try {
    const response = await sendGatewayCommand("memory_search", {
      query,
      limit,
    });
    const entries = parseMemoryEntries(response);
    printMemoryEntries(entries, query);
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Gateway communication
// ---------------------------------------------------------------------------

function sendGatewayCommand(
  command: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const logger = pino({ level: "silent" });
    const client = new GatewayClient({ logger });
    const sessionId = `cli-session-${Date.now()}`;
    let resolved = false;

    const timer = setTimeout(() => {
      client.disconnect();
      if (!resolved) {
        resolved = true;
        reject(new Error("Cannot connect to Gateway. Is the gateway running?"));
      }
    }, 5000);

    client.on("connected", () => {
      try {
        sendCommand(client, sessionId, command, args);
      } catch {
        // ignore
      }
    });

    client.on("message", (data) => {
      if (resolved) return;
      try {
        const raw = typeof data === "string" ? data : data.toString("utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.type === "block") {
          clearTimeout(timer);
          client.disconnect();
          resolved = true;
          resolve(parsed.content);
        }
      } catch {
        // ignore
      }
    });

    client.on("failed", () => {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        reject(new Error("Cannot connect to Gateway. Is the gateway running?"));
      }
    });

    client.connect();
  });
}

// ---------------------------------------------------------------------------
// Parse & display
// ---------------------------------------------------------------------------

function parseMemoryEntries(response: unknown): MemoryEntry[] {
  if (Array.isArray(response)) {
    return response.map((item) => {
      const record = item as Record<string, unknown>;
      return {
        id: String(record.id ?? "unknown"),
        content: String(record.content ?? ""),
        score: Number(record.score ?? 0),
        category: String(record.category ?? "general"),
      };
    });
  }

  return [];
}

function printMemoryEntries(entries: MemoryEntry[], query: string): void {
  process.stdout.write(`Memory search results for: "${query}"\n\n`);

  if (entries.length === 0) {
    process.stdout.write("No matching entries found.\n");
    return;
  }

  const columns = [
    { header: "ID", minWidth: 12, maxWidth: 36 },
    { header: "Score", align: "right" as const, minWidth: 6 },
    { header: "Category", minWidth: 12, maxWidth: 20 },
    { header: "Content", minWidth: 40, maxWidth: 60 },
  ];

  const rows = entries.map((e) => ({
    cells: [e.id, e.score.toFixed(2), e.category, e.content],
  }));

  process.stdout.write(formatTable(columns, rows));
  process.stdout.write(`\n${entries.length} result(s) found.\n`);
}
