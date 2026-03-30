/**
 * @osai/cli -- osai skills list (DOMAIN-011, T-005)
 *
 * Lists available skills and their status.
 *
 * Usage:
 *   osai skills list
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

interface SkillEntry {
  name: string;
  enabled: boolean;
  toolsCount: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

/**
 * Execute the `osai skills list` command.
 *
 * Connects to Gateway, sends skills_list command, and displays results as a table.
 */
export async function runSkillsList(): Promise<void> {
  try {
    const response = await sendGatewayCommand("skills_list");
    const skills = parseSkills(response);
    printSkills(skills);
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

function sendGatewayCommand(command: string): Promise<unknown> {
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
        sendCommand(client, sessionId, command);
      } catch {
        // ignore
      }
    });

    client.on("message", (data) => {
      if (resolved) return;
      try {
        const raw = typeof data === "string" ? data : data.toString("utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.type === "block" && parsed.block_type === "table") {
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

function parseSkills(response: unknown): SkillEntry[] {
  if (Array.isArray(response)) {
    return response.map((item) => {
      const record = item as Record<string, unknown>;
      return {
        name: String(record.name ?? "unknown"),
        enabled: Boolean(record.enabled),
        toolsCount: Number(record.toolsCount ?? 0),
        description: String(record.description ?? ""),
      };
    });
  }

  // Fallback: return empty list
  return [];
}

function printSkills(skills: SkillEntry[]): void {
  if (skills.length === 0) {
    process.stdout.write("No skills found.\n");
    return;
  }

  const columns = [
    { header: "Name", minWidth: 20, maxWidth: 40 },
    { header: "Enabled", minWidth: 8 },
    { header: "Tools", align: "right" as const, minWidth: 6 },
    { header: "Description", minWidth: 30, maxWidth: 50 },
  ];

  const rows = skills.map((s) => ({
    cells: [
      s.name,
      s.enabled ? "yes" : "no",
      s.toolsCount,
      s.description,
    ],
  }));

  process.stdout.write(formatTable(columns, rows));
}
