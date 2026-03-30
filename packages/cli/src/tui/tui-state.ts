/**
 * @osai/cli -- TUI State Reducer (DOMAIN-011, T-003)
 *
 * Чистый reducer для управления состоянием TUI.
 * Используется в app.tsx через useReducer.
 */

import type { TUIState, TUIAction } from "./types.js";

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const initialTUIState: TUIState = {
  messages: [],
  currentToolProgress: null,
  connectionStatus: "disconnected",
  chatName: "New Chat",
  modelName: "glm-5",
  sessionId: "",
  chatId: "",
  isStreaming: false,
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Reducer для состояния TUI.
 *
 * Обрабатывает все действия по обновлению состояния чата.
 */
export function tuiReducer(state: TUIState, action: TUIAction): TUIState {
  switch (action.type) {
    case "ADD_USER_MESSAGE": {
      const message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "user" as const,
        content: action.content,
        timestamp: Date.now(),
      };
      return { ...state, messages: [...state.messages, message] };
    }

    case "ADD_ASSISTANT_BLOCK": {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage?.role === "assistant") {
        // Добавляем к существующему сообщению ассистента
        if (action.blockType === "code" && action.language !== undefined) {
          const codeBlocks = [
            ...(lastMessage.codeBlocks ?? []),
            { language: action.language, code: action.content },
          ];
          return {
            ...state,
            messages: state.messages.map((m, i) =>
              i === state.messages.length - 1 ? { ...m, codeBlocks } : m,
            ),
          };
        }
        // Для text block -- добавляем текст к существующему сообщению
        if (action.blockType === "text") {
          return {
            ...state,
            messages: state.messages.map((m, i) =>
              i === state.messages.length - 1
                ? { ...m, content: m.content + action.content }
                : m,
            ),
          };
        }
        return state;
      }

      // Создаём новое сообщение ассистента
      const newMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant" as const,
        content: action.blockType === "text" ? action.content : "",
        codeBlocks:
          action.blockType === "code" && action.language !== undefined
            ? [{ language: action.language, code: action.content }]
            : undefined,
        timestamp: Date.now(),
      };
      return { ...state, messages: [...state.messages, newMessage] };
    }

    case "APPEND_STREAMING_TEXT": {
      return {
        ...state,
        isStreaming: true,
        messages: state.messages.map((m, i) =>
          i === state.messages.length - 1 && m.role === "assistant"
            ? { ...m, content: m.content + action.content }
            : m,
        ),
      };
    }

    case "FINALIZE_STREAMING": {
      return { ...state, isStreaming: false };
    }

    case "SET_CONNECTION_STATUS":
      return { ...state, connectionStatus: action.status };

    case "SET_CHAT_NAME":
      return { ...state, chatName: action.name };

    case "SET_MODEL_NAME":
      return { ...state, modelName: action.name };

    case "SET_TOOL_PROGRESS":
      return { ...state, currentToolProgress: action.progress };

    case "CLEAR_TOOL_PROGRESS":
      return { ...state, currentToolProgress: null };

    case "SET_SESSION_ID":
      return { ...state, sessionId: action.sessionId };

    case "SET_CHAT_ID":
      return { ...state, chatId: action.chatId };

    case "SET_STREAMING":
      return { ...state, isStreaming: action.isStreaming };

    default:
      return state;
  }
}
