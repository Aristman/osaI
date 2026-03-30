/**
 * @osai/cli -- Chat Command (DOMAIN-011, T-003)
 *
 * Команда запуска интерактивного TUI чата: `osai`
 *
 * TT-003-01: osai запускает TUI -- Ink app рендерится, stdin активен
 * TT-003-07: Ctrl+C -- корректный выход из TUI -- exit code 0, WS disconnect
 */

import React from "react";
import { render } from "ink";
import pino from "pino";
import { TUIApp } from "../tui/app.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunChatOptions {
  /** URL Gateway (default: ws://127.0.0.1:18789) */
  gatewayUrl?: string;
  /** ID сессии */
  sessionId?: string;
  /** ID чата */
  chatId?: string;
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Запуск интерактивного TUI чата.
 *
 * Создаёт ink app и блокирует процесс до выхода.
 * Возвращает exit code (0 = нормальный выход, 1 = ошибка).
 */
export function runChat(options: RunChatOptions = {}): number {
  const logger = pino({
    name: "cli-chat",
    level: process.env.OSAI_LOG_LEVEL ?? "warn",
  });

  let exitCode = 0;

  try {
    const instance = render(
      React.createElement(TUIApp, {
        gatewayUrl: options.gatewayUrl,
        sessionId: options.sessionId,
        chatId: options.chatId,
        logger,
        onExit: (code: number) => {
          exitCode = code;
        },
      }),
    );

    // Ждём unmount ink app
    instance.waitUntilExit().then(() => {
      process.exit(exitCode);
    }).catch((err: unknown) => {
      logger.error({ error: err }, "TUI exited with error");
      process.exit(1);
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error starting TUI: ${message}\n`);
    return 1;
  }

  // ink app блокирует event loop через waitUntilExit
  return 0;
}
