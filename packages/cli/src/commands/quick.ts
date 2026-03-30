/**
 * @osai/cli -- Quick Command Mode (DOMAIN-011, T-006)
 *
 * Quick command mode: `osai "command"` -- отправляет запрос и получает
 * ответ без запуска TUI. Выводит текстовый ответ в stdout.
 *
 * TT-006-05: osai "какая погода?" -- quick mode, ответ в stdout
 * TT-006-06: osai "command" -- Gateway недоступен -> error, exit 1
 *
 * Exit codes:
 *   0 - Success (ответ получен и выведен)
 *   1 - Error (Gateway недоступен, таймаут, ошибка протокола)
 */

import { GatewayClient } from "../ws/gateway-client.js";
import { MessageRouter } from "../ws/message-router.js";
import { sendUserMessage } from "../ws/protocol.js";
import type { BlockStreamMessage, PermissionRequestMessage, ToolStreamMessage } from "../ws/protocol.js";
import pino from "pino";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuickCommandOptions {
  /** Gateway URL (default: ws://127.0.0.1:18789) */
  gatewayUrl?: string;
  /** Connection timeout in ms (default: 5000) */
  connectTimeoutMs?: number;
  /** Response timeout in ms (default: 30000) */
  responseTimeoutMs?: number;
  /** Session ID (default: auto-generated) */
  sessionId?: string;
  /** Chat ID */
  chatId?: string;
  /** Logger instance */
  logger?: pino.Logger;
  /** Auto-approve permission requests with risk=low */
  autoApproveLowRisk?: boolean;
}

export interface QuickCommandResult {
  /** Exit code */
  exitCode: number;
  /** Collected text response */
  response: string;
  /** Error message (if any) */
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_RESPONSE_TIMEOUT_MS = 30000;
const DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// Quick Command
// ---------------------------------------------------------------------------

/**
 * Выполняет quick command mode: подключается к Gateway, отправляет
 * сообщение, собирает текстовый ответ и возвращает результат.
 *
 * Flow:
 *   1. Connect to Gateway
 *   2. Attach message router
 *   3. Subscribe to events
 *   4. Send user message
 *   5. Wait for response (block with debounce) or timeout
 *
 * @param message - Текст запроса пользователя
 * @param options - Опции подключения и поведения
 * @returns QuickCommandResult с ответом или ошибкой
 */
export async function runQuickCommand(
  message: string,
  options: QuickCommandOptions = {},
): Promise<QuickCommandResult> {
  const logger = options.logger ?? pino({ name: "quick-command", level: "warn" });
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const responseTimeoutMs = options.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;
  const sessionId = options.sessionId ?? `quick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const autoApproveLowRisk = options.autoApproveLowRisk ?? true;

  const client = new GatewayClient({
    url: options.gatewayUrl,
    logger: logger.child({ component: "gateway-client" }),
    maxRetries: 0,
  });

  const router = new MessageRouter({
    logger: logger.child({ component: "message-router" }),
  });

  try {
    // 1. Connect with timeout
    const connected = await waitForConnection(client, connectTimeoutMs);
    if (!connected) {
      return {
        exitCode: 1,
        response: "",
        error: "Cannot connect to Gateway. Is the Gateway running? (osai start)",
      };
    }

    // 2. Attach message router
    router.attach(client);

    // 3. Subscribe to events
    try {
      sendSubscribeInternal(client, sessionId, ["tool_stream", "block", "permission_request"], options.chatId);
    } catch {
      // ignore
    }

    // 4. Send user message
    try {
      sendUserMessage(client, sessionId, message, options.chatId);
    } catch {
      return {
        exitCode: 1,
        response: "",
        error: "Failed to send message to Gateway",
      };
    }

    // 5. Wait for response
    const collectedText: string[] = [];
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const result = await new Promise<QuickCommandResult>((resolve) => {
      // Response timeout -- the safety net
      const responseTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        resolve({
          exitCode: 1,
          response: collectedText.join(""),
          error: "Gateway did not respond in time",
        });
      }, responseTimeoutMs);

      // Handle block messages (text responses)
      router.on("block", (msg: BlockStreamMessage) => {
        if (msg.block_type === "text" && msg.content !== undefined) {
          collectedText.push(msg.content);
        }

        // Debounce: wait for potential more blocks after the last one
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          clearTimeout(responseTimer);
          resolve({
            exitCode: 0,
            response: collectedText.join(""),
          });
        }, DEBOUNCE_MS);
      });

      // Handle tool_stream (progress, silently consumed in quick mode)
      router.on("tool_stream", (_msg: ToolStreamMessage) => {
        // No action needed for quick mode
      });

      // Handle permission_request (auto-approve low risk, deny others)
      router.on("permission_request", (msg: PermissionRequestMessage) => {
        const allow = msg.risk_level === "low" && autoApproveLowRisk;
        try {
          sendPermissionResponseInternal(client, sessionId, msg.request_id, allow);
        } catch {
          // Connection may have closed
        }
      });

      // Handle disconnection
      client.on("disconnected", () => {
        if (settled) return;
        if (collectedText.length > 0) {
          settled = true;
          clearTimeout(responseTimer);
          if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          resolve({
            exitCode: 0,
            response: collectedText.join(""),
          });
        }
        // If no text received, let the responseTimer handle it
      });
    });

    return result;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      response: "",
      error: errorMessage,
    };
  } finally {
    router.detach();
    client.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sendPermissionResponseInternal(
  client: GatewayClient,
  sessionId: string,
  requestId: string,
  allow: boolean,
): void {
  client.send({
    type: "permission_response",
    session_id: sessionId,
    request_id: requestId,
    payload: { allow },
  });
}

function sendSubscribeInternal(
  client: GatewayClient,
  sessionId: string,
  events: string[],
  chatId?: string,
): void {
  client.send({
    type: "subscribe",
    session_id: sessionId,
    ...(chatId !== undefined && { chat_id: chatId }),
    payload: { events },
  });
}

function waitForConnection(
  client: GatewayClient,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (client.isConnected) {
      resolve(true);
      return;
    }

    const timer = setTimeout(() => {
      client.disconnect();
      resolve(false);
    }, timeoutMs);

    client.on("connected", () => {
      clearTimeout(timer);
      resolve(true);
    });

    client.on("failed", () => {
      clearTimeout(timer);
      resolve(false);
    });

    client.connect();
  });
}
