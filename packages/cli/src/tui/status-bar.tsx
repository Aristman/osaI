/**
 * @osai/cli -- Status Bar (DOMAIN-011, T-003)
 *
 * Статус-бар TUI: отображает имя чата, модель LLM, статус подключения.
 */

import React from "react";
import { Box, Text } from "ink";
import type { ConnectionStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StatusBarProps {
  /** Имя текущего чата */
  chatName: string;
  /** Имя текущей модели LLM */
  modelName: string;
  /** Статус подключения к Gateway */
  connectionStatus: ConnectionStatus;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Цвет индикатора подключения */
function connectionColor(status: ConnectionStatus): "green" | "yellow" | "red" {
  switch (status) {
    case "connected":
      return "green";
    case "reconnecting":
      return "yellow";
    case "disconnected":
    case "failed":
      return "red";
  }
}

/** Текст статуса подключения */
function connectionLabel(status: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "connected";
    case "reconnecting":
      return "reconnecting";
    case "disconnected":
      return "disconnected";
    case "failed":
      return "failed";
  }
}

// ---------------------------------------------------------------------------
// StatusBar
// ---------------------------------------------------------------------------

/**
 * Статус-бар: chat name, model, connection status.
 *
 * TT-003-06: Статус-бар показывает: chat name, model, connected/disconnected
 */
export function StatusBar({
  chatName,
  modelName,
  connectionStatus,
}: StatusBarProps): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="white" bold>
        {chatName}
      </Text>
      <Text color="gray"> | </Text>
      <Text color="blue">{modelName}</Text>
      <Text color="gray"> | </Text>
      <Text color={connectionColor(connectionStatus)}>
        {connectionLabel(connectionStatus)}
      </Text>
    </Box>
  );
}
