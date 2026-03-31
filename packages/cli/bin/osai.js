#!/usr/bin/env node

/**
 * osai CLI entry point (bin/osai.js)
 *
 * Provides:
 *   osai                          Start interactive TUI chat
 *   osai --version                Print version and exit 0
 *   osai --help                   Print help and exit 0
 *   osai init [--force]           Initialize ~/.osai/ configuration
 *   osai status                   Show system status
 *   osai config [--path]          Show configuration
 *   osai session list [--limit N] List active sessions
 *   osai session resume <id>      Resume a session
 *   osai skills list              List available skills
 *   osai memory search "query"    Search long-term memory
 *   osai channel add telegram     Add Telegram channel
 *   osai chat list                List chats
 *   osai chat create [--name N]   Create a new chat
 *   osai chat switch <id>         Switch active chat
 *   osai chat delete <id>         Delete a chat
 *   osai chat archive <id>        Archive a chat
 *   osai "command"                Quick mode: send and receive response without TUI
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse args
const args = process.argv.slice(2);

// --version
if (args.includes("--version") || args.includes("-v")) {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    process.stdout.write(`${pkg.version}\n`);
  } catch {
    process.stdout.write("0.0.0\n");
  }
  process.exit(0);
}

// --help
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`osaI v3 -- AI Operating System

Usage:
  osai                            Start interactive TUI chat
  osai --version                  Print CLI version
  osai --help                     Show this help

Management Commands:
  osai init [--force]             Initialize ~/.osai/ configuration
  osai status                     Show system status
  osai config [--path]            Show current configuration

Session Commands:
  osai session list [--limit N]   List active sessions
  osai session resume <id>        Resume a session

Skill Commands:
  osai skills list                List available skills

Memory Commands:
  osai memory search "query"      Search long-term memory

Channel Commands:
  osai channel add telegram       Add Telegram userbot channel

Chat Commands:
  osai chat list                  List chats
  osai chat create [--name N]     Create a new chat
  osai chat switch <id>           Switch active chat
  osai chat delete <id>           Delete a chat
  osai chat archive <id>          Archive a chat

Quick Mode:
  osai "command"                  Send a message and print response without TUI

Options:
  -v, --version                   Print version
  -h, --help                      Show help
\n`);
  process.exit(0);
}

// Route commands
const command = args[0];

// Known commands (not quick mode)
const knownCommands = new Set([
  "start", "init", "status", "config",
  "session", "skills", "memory", "channel", "chat",
]);

// Quick mode: first arg does not start with "-" and is not a known command
if (command && !command.startsWith("-") && !knownCommands.has(command)) {
  // Join all args as the quick message
  const message = args.join(" ");
  const { runQuickCommand } = await import("../dist/commands/quick.js");
  const result = await runQuickCommand(message);
  if (result.response) {
    process.stdout.write(result.response + "\n");
  }
  if (result.error) {
    process.stderr.write(`Error: ${result.error}\n`);
  }
  process.exit(result.exitCode);
} else if (!command || command === "start") {
  // No args or "start" -> interactive TUI
  const { runChat } = await import("../dist/commands/chat.js");
  runChat();
} else if (command === "init") {
  const force = args.includes("--force");
  const { runInit } = await import("../dist/commands/init.js");
  runInit({ force });
} else if (command === "status") {
  const { runStatus } = await import("../dist/commands/status.js");
  runStatus();
} else if (command === "config") {
  const showPath = args.includes("--path");
  const { runConfig } = await import("../dist/commands/config.js");
  runConfig({ path: showPath });
} else if (command === "session") {
  const subcommand = args[1];
  if (subcommand === "list") {
    const limitIdx = args.indexOf("--limit");
    const limit = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : undefined;
    const { runSessionList } = await import("../dist/commands/session/list.js");
    runSessionList({ limit });
  } else if (subcommand === "resume") {
    const sessionId = args[2];
    const { runSessionResume } = await import("../dist/commands/session/resume.js");
    runSessionResume(sessionId);
  } else {
    process.stderr.write(`Unknown session command: ${subcommand ?? "(none)"}\n`);
    process.stderr.write("Usage: osai session list|resume\n");
    process.exit(2);
  }
} else if (command === "skills") {
  const subcommand = args[1];
  if (subcommand === "list") {
    const { runSkillsList } = await import("../dist/commands/skills/list.js");
    runSkillsList();
  } else {
    process.stderr.write(`Unknown skills command: ${subcommand ?? "(none)"}\n`);
    process.stderr.write("Usage: osai skills list\n");
    process.exit(2);
  }
} else if (command === "memory") {
  const subcommand = args[1];
  if (subcommand === "search") {
    const query = args[2];
    const limitIdx = args.indexOf("--limit");
    const limit = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : undefined;
    const { runMemorySearch } = await import("../dist/commands/memory/search.js");
    runMemorySearch(query, { limit });
  } else {
    process.stderr.write(`Unknown memory command: ${subcommand ?? "(none)"}\n`);
    process.stderr.write("Usage: osai memory search \"query\"\n");
    process.exit(2);
  }
} else if (command === "channel") {
  const subcommand = args[1];
  if (subcommand === "add" && args[2] === "telegram") {
    const { runChannelAddTelegram } = await import("../dist/commands/channel/add-telegram.js");
    runChannelAddTelegram();
  } else {
    process.stderr.write(`Unknown channel command: ${subcommand ?? "(none)"}\n`);
    process.stderr.write("Usage: osai channel add telegram\n");
    process.exit(2);
  }
} else if (command === "chat") {
  const subcommand = args[1];
  if (subcommand === "list") {
    const { runChatList } = await import("../dist/commands/chat/list.js");
    runChatList();
  } else if (subcommand === "create") {
    const nameIdx = args.indexOf("--name");
    const name = nameIdx !== -1 && args[nameIdx + 1] ? args[nameIdx + 1] : undefined;
    const { runChatCreate } = await import("../dist/commands/chat/create.js");
    runChatCreate(name);
  } else if (subcommand === "switch") {
    const chatId = args[2];
    const { runChatSwitch } = await import("../dist/commands/chat/switch.js");
    runChatSwitch(chatId);
  } else if (subcommand === "delete") {
    const chatId = args[2];
    const { runChatDelete } = await import("../dist/commands/chat/delete.js");
    runChatDelete(chatId);
  } else if (subcommand === "archive") {
    const chatId = args[2];
    const { runChatArchive } = await import("../dist/commands/chat/archive.js");
    runChatArchive(chatId);
  } else {
    process.stderr.write(`Unknown chat command: ${subcommand ?? "(none)"}\n`);
    process.stderr.write("Usage: osai chat list|create|switch|delete|archive\n");
    process.exit(2);
  }
} else {
  process.stderr.write(`Unknown command: ${command}\nRun 'osai --help' for usage.\n`);
  process.exit(1);
}
