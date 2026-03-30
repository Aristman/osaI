/**
 * @osai/agent -- Agent Loop Types
 *
 * Configuration, input and output types for the AgentLoop.
 */

import type { ChatMessage, ToolDefinition } from '@osai/providers';

// ---------------------------------------------------------------------------
// AgentLoopConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for the AgentLoop.
 */
export interface AgentLoopConfig {
  /** Base system prompt for all conversations. */
  readonly systemPrompt: string;
  /** Optional default model override. */
  readonly defaultModel?: string;
  /** Optional default temperature (0-2). */
  readonly defaultTemperature?: number;
  /** Optional default max tokens. */
  readonly defaultMaxTokens?: number;
  /** Optional tools definitions passed to every inference call. */
  readonly tools?: readonly ToolDefinition[];
  /** Optional RAG query function injected into ContextAssembler. */
  readonly ragQuery?: import('../context/types.js').RAGQueryFn;
}

// ---------------------------------------------------------------------------
// AgentLoopInput
// ---------------------------------------------------------------------------

/**
 * Input for a single AgentLoop.run() invocation.
 */
export interface AgentLoopInput {
  /** Current user message content. */
  readonly userMessage: string;
  /** Chat history messages (already persisted). */
  readonly messages: readonly ChatMessage[];
  /** Correlation: session identifier. */
  readonly sessionId: string;
  /** Correlation: chat identifier. */
  readonly chatId: string;
  /** Correlation: trace identifier. If not provided, one will be generated. */
  readonly traceId?: string;
}

// ---------------------------------------------------------------------------
// AgentLoopOutput
// ---------------------------------------------------------------------------

/**
 * Output from a single AgentLoop.run() invocation.
 *
 * Represents the result of exactly one inference call (no tool loop -- T-005).
 */
export interface AgentLoopOutput {
  /** The generated text content from the LLM. */
  readonly content: string;
  /** Tool calls requested by the LLM (if any). */
  readonly toolCalls?: readonly import('@osai/providers').ToolCall[];
  /** Whether the LLM requested tool calls. */
  readonly hasToolCalls: boolean;
  /** Token usage statistics. */
  readonly usage: import('@osai/providers').TokenUsage;
  /** Model identifier that produced the response. */
  readonly model: string;
  /** Provider identifier. */
  readonly provider: string;
  /** Finish reason from the LLM. */
  readonly finishReason?: string;
  /** Correlation: trace identifier for this loop execution. */
  readonly traceId: string;
  /** Whether this output represents an error response. */
  readonly isError: boolean;
  /** Error message (only when isError is true). */
  readonly errorMessage?: string;
  /** Number of RAG results injected into context. */
  readonly ragResultCount: number;
}
