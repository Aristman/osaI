/**
 * @osai/cli -- TUI App (DOMAIN-011, T-003)
 *
 * Главный TUI компонент: объединяет ChatArea, InputArea, StatusBar.
 * Управляет состоянием через reducer, подключается к Gateway.
 *
 * TT-003-01: osai запускает TUI
 * TT-003-07: Ctrl+C -- корректный выход из TUI
 */

import React, { useReducer, useEffect, useCallback, useMemo } from "react";
import { Box, useApp } from "ink";
import pino from "pino";
import { ChatArea } from "./chat-area.js";
import { InputArea } from "./input-area.js";
import { StatusBar } from "./status-bar.js";
import { useGateway } from "./use-gateway.js";
import { tuiReducer, initialTUIState } from "./tui-state.js";
import type { ConnectionStatus, ToolProgress } from "./types.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TUIAppProps {
  /** Опциональный URL Gateway (default: ws://127.0.0.1:18789) */
  gatewayUrl?: string;
  /** Опциональный ID сессии (генерируется если не указан) */
  sessionId?: string;
  /** Опциональный ID чата */
  chatId?: string;
  /** Опциональный logger */
  logger?: pino.Logger;
  /** Callback при завершении (exit) */
  onExit?: (code: number) => void;
}

// ---------------------------------------------------------------------------
// TUIApp
// ---------------------------------------------------------------------------

/**
 * Главный TUI компонент.
 *
 * Обеспечивает:
 * - Подключение к Gateway при монтировании
 * - Маршрутизацию входящих сообщений
 * - Обновление UI при поступлении streaming данных
 * - Отправку пользовательских сообщений через Gateway
 * - Корректный выход по Ctrl+C
 */
export function TUIApp({
  gatewayUrl,
  sessionId: propSessionId,
  chatId: propChatId,
  logger: propLogger,
  onExit,
}: TUIAppProps): React.ReactElement {
  const { exit: inkExit } = useApp();

  const sessionId = useMemo(
    () => propSessionId ?? `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    [propSessionId],
  );

  const [state, dispatch] = useReducer(tuiReducer, {
    ...initialTUIState,
    sessionId,
    chatId: propChatId ?? "",
  });

  const logger = propLogger ?? pino({ name: "tui-app" });

  // -------------------------------------------------------------------------
  // Gateway connection via useGateway hook
  // -------------------------------------------------------------------------
  const { sendMessage } = useGateway({
    url: gatewayUrl,
    sessionId,
    chatId: propChatId,
    logger,
    onConnectionStatusChange: useCallback(
      (status: ConnectionStatus) => {
        dispatch({ type: "SET_CONNECTION_STATUS", status });
      },
      [],
    ),
    onBlock: useCallback(
      (msg: { type: "block"; block_type: string; content: string; language?: string }) => {
        dispatch({
          type: "ADD_ASSISTANT_BLOCK",
          blockType: msg.block_type,
          content: msg.content,
          language: msg.language,
        });
        if (msg.block_type === "text") {
          dispatch({ type: "SET_STREAMING", isStreaming: false });
        }
      },
      [],
    ),
    onToolStream: useCallback(
      (msg: { tool: string; action: string; chunk?: unknown; progress?: number }) => {
        const progress: ToolProgress = {
          tool: msg.tool,
          action: msg.action,
          chunk: msg.chunk,
          progress: msg.progress,
          timestamp: Date.now(),
        };
        dispatch({ type: "SET_TOOL_PROGRESS", progress });
      },
      [],
    ),
  });

  // -------------------------------------------------------------------------
  // Ctrl+C handling
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handler = () => {
      logger.info("Ctrl+C received, exiting TUI");
      onExit?.(0);
      inkExit(new Error("SIGINT"));
    };

    process.on("SIGINT", handler);

    return () => {
      process.off("SIGINT", handler);
    };
  }, [inkExit, onExit, logger]);

  // -------------------------------------------------------------------------
  // Input handler
  // -------------------------------------------------------------------------
  const handleSubmit = useCallback(
    (text: string) => {
      // Добавляем сообщение пользователя в UI
      dispatch({ type: "ADD_USER_MESSAGE", content: text });

      // Начинаем streaming режим
      dispatch({ type: "SET_STREAMING", isStreaming: true });

      // Отправляем через Gateway
      sendMessage(text);

      logger.debug({ content: text }, "User message submitted");
    },
    [sendMessage, logger],
  );

  const isInputDisabled = state.connectionStatus === "disconnected" || state.connectionStatus === "failed";

  return (
    <Box flexDirection="column" height="100%">
      {/* Статус-бар (верх) */}
      <StatusBar
        chatName={state.chatName}
        modelName={state.modelName}
        connectionStatus={state.connectionStatus}
      />

      {/* Разделитель */}
      <Box height={1} />

      {/* Область чата (центр, растягивается) */}
      <ChatArea
        messages={state.messages}
        currentToolProgress={state.currentToolProgress}
        isStreaming={state.isStreaming}
      />

      {/* Разделитель */}
      <Box height={1} />

      {/* Область ввода (низ) */}
      <InputArea
        onSubmit={handleSubmit}
        disabled={isInputDisabled}
      />
    </Box>
  );
}
