/**
 * chat command -- interactive chat with Gateway
 *
 * Modes:
 *   - Quick: osai chat --message "text"  (send and exit)
 *   - REPL:  osai chat [--session id]    (interactive readline)
 */

import * as readline from 'node:readline';
import { GatewayClient } from '../lib/gateway-client.js';
import { SessionManager } from '../lib/session-manager.js';
import { promptPermission } from '../lib/permission-prompt.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatOptions {
  sessionId?: string;
  message?: string;
  json?: boolean;
}

// ---------------------------------------------------------------------------
// chatCommand
// ---------------------------------------------------------------------------

export async function chatCommand(options: ChatOptions): Promise<void> {
  const client = new GatewayClient();

  try {
    await client.connect();
  } catch {
    process.stderr.write('Error: Cannot connect to Gateway. Is osai running?\n');
    process.exitCode = 1;
    return;
  }

  const sessionManager = new SessionManager({
    client,
    defaultSessionId: options.sessionId,
  });

  // Set up permission request handler
  client.onPermissionRequest(async (request) => {
    const decision = await promptPermission(request);
    client.sendPermissionResponse(request.request_id, decision.approved ? 'approved' : 'denied');
  });

  // Track assistant responses
  client.onBlock((block) => {
    sessionManager.addMessage('assistant', block.content);
    if (!options.json) {
      process.stdout.write(`\n${block.content}\n`);
    }
  });

  client.onError((err) => {
    process.stderr.write(`\nError [${err.code}]: ${err.message}\n`);
  });

  // Quick mode: send single message and exit
  if (options.message) {
    sessionManager.addMessage('user', options.message);
    client.sendMessage(sessionManager.getActiveSessionId(), options.message);
    return;
  }

  // Interactive REPL mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = `osai [${sessionManager.getActiveSessionId().slice(0, 8)}]> `;

  const askQuestion = (): void => {
    rl.question(prompt, async (line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        askQuestion();
        return;
      }

      // Exit commands
      if (trimmed === '/exit' || trimmed === '/quit') {
        rl.close();
        await client.disconnect();
        return;
      }

      // Clear history
      if (trimmed === '/clear') {
        sessionManager.clearHistory();
        process.stdout.write('History cleared.\n');
        askQuestion();
        return;
      }

      sessionManager.addMessage('user', trimmed);
      client.sendMessage(sessionManager.getActiveSessionId(), trimmed);
      askQuestion();
    });
  };

  process.stdout.write('osai interactive chat. Type /exit or /quit to leave.\n');
  askQuestion();
}
