/**
 * @osai/cli -- TUI Types (DOMAIN-011, T-003)
 *
 * Общие типы для TUI компонентов.
 */

/** Сообщение в чате (от пользователя или от ассистента) */
export interface ChatMessage {
  /** Уникальный ID */
  id: string;
  /** Роль отправителя */
  role: "user" | "assistant";
  /** Текстовое содержимое (для user -- полный текст, для assistant -- накопленный текст) */
  content: string;
  /** Код-блоки (для assistant) */
  codeBlocks?: CodeBlock[];
  /** Временная метка */
  timestamp: number;
}

/** Код-блок в ответе ассистента */
export interface CodeBlock {
  /** Язык программирования */
  language: string;
  /** Содержимое кода */
  code: string;
}

/** Текущий статус подключения к Gateway */
export type ConnectionStatus = "connected" | "disconnected" | "reconnecting" | "failed";

/** Прогресс выполнения tool */
export interface ToolProgress {
  /** Имя tool */
  tool: string;
  /** Текущее действие */
  action: string;
  /** Прогресс 0..1 (если известен) */
  progress?: number;
  /** Последний полученный chunk */
  chunk?: unknown;
  /** Временная метка последнего обновления */
  timestamp: number;
}

/** Состояние TUI приложения */
export interface TUIState {
  /** Список сообщений в чате */
  messages: ChatMessage[];
  /** Текущий прогресс tool (если есть) */
  currentToolProgress: ToolProgress | null;
  /** Статус подключения */
  connectionStatus: ConnectionStatus;
  /** Имя текущего чата */
  chatName: string;
  /** Текущая модель LLM */
  modelName: string;
  /** ID текущей сессии */
  sessionId: string;
  /** ID текущего чата */
  chatId: string;
  /** Состояние streaming (набирается текст) */
  isStreaming: boolean;
}

/** Действия для обновления состояния TUI */
export type TUIAction =
  | { type: "ADD_USER_MESSAGE"; content: string }
  | { type: "ADD_ASSISTANT_BLOCK"; blockType: string; content: string; language?: string }
  | { type: "APPEND_STREAMING_TEXT"; content: string }
  | { type: "FINALIZE_STREAMING" }
  | { type: "SET_CONNECTION_STATUS"; status: ConnectionStatus }
  | { type: "SET_CHAT_NAME"; name: string }
  | { type: "SET_MODEL_NAME"; name: string }
  | { type: "SET_TOOL_PROGRESS"; progress: ToolProgress }
  | { type: "CLEAR_TOOL_PROGRESS" }
  | { type: "SET_SESSION_ID"; sessionId: string }
  | { type: "SET_CHAT_ID"; chatId: string }
  | { type: "SET_STREAMING"; isStreaming: boolean };
