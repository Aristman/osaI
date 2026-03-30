/**
 * @osai/cli -- Chat Area (DOMAIN-011, T-003)
 *
 * Область отображения сообщений чата: текст и код-блоки.
 * Поддерживает streaming display для text ответов.
 */

import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage, ToolProgress } from "./types.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatAreaProps {
  /** Список сообщений в чате */
  messages: ChatMessage[];
  /** Текущий прогресс tool (отображается как индикатор) */
  currentToolProgress: ToolProgress | null;
  /** Статус streaming (показывает курсор) */
  isStreaming: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Блок сообщения пользователя */
function UserMessage({ content }: { content: string }): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan">{"> "}</Text>
      <Text color="white" wrap="wrap">
        {content}
      </Text>
    </Box>
  );
}

/** Блок сообщения ассистента (текст) */
function AssistantTextMessage({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="green" wrap="wrap">
        {content}
        {isStreaming ? <Text color="yellow">|</Text> : ""}
      </Text>
    </Box>
  );
}

/** Код-блок с language label */
function CodeBlockView({
  language,
  code,
}: {
  language: string;
  code: string;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="round" paddingLeft={1} paddingRight={1}>
      <Text color="yellow" dimColor>
        {language}
      </Text>
      <Text wrap="wrap">{code}</Text>
    </Box>
  );
}

/** Прогресс выполнения tool */
function ToolProgressView({
  progress,
}: {
  progress: ToolProgress;
}): React.ReactElement {
  const progressPercent = progress.progress !== undefined
    ? `${Math.round(progress.progress * 100)}%`
    : "...";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="magenta" dimColor>
        [{progress.tool}] {progress.action} {progressPercent}
      </Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ChatArea
// ---------------------------------------------------------------------------

/**
 * Область чата: отображает все сообщения и текущий прогресс tool.
 *
 * TT-003-03: block (text) ответ отображается в chat area
 * TT-003-04: block (code) ответ отображается с подсветкой
 * TT-003-05: tool_stream обновляет progress
 */
export function ChatArea({
  messages,
  currentToolProgress,
  isStreaming,
}: ChatAreaProps): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} overflowY="hidden" paddingX={1}>
      {messages.map((msg) => (
        <Box key={msg.id} flexDirection="column" marginBottom={msg.role === "assistant" ? 0 : 1}>
          {msg.role === "user" ? (
            <UserMessage content={msg.content} />
          ) : (
            <Box flexDirection="column">
              {msg.content !== "" && (
                <AssistantTextMessage
                  content={msg.content}
                  isStreaming={isStreaming && msg === messages[messages.length - 1]}
                />
              )}
              {msg.codeBlocks?.map((block, i) => (
                <CodeBlockView
                  key={`${msg.id}-code-${i}`}
                  language={block.language}
                  code={block.code}
                />
              ))}
            </Box>
          )}
        </Box>
      ))}

      {/* Прогресс выполнения tool */}
      {currentToolProgress !== null && (
        <ToolProgressView progress={currentToolProgress} />
      )}
    </Box>
  );
}
