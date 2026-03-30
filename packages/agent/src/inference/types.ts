/**
 * @osai/agent -- Inference Types
 *
 * Input/Output types for the Model Inference module (T-003).
 */

import type {
  ChatMessage,
  ToolDefinition,
  ToolCall,
  TokenUsage,
} from '@osai/providers';

// ---------------------------------------------------------------------------
// InferenceInput
// ---------------------------------------------------------------------------

/**
 * Input for an inference call.
 */
export interface InferenceInput {
  /** Ordered conversation messages to send to the LLM. */
  readonly messages: readonly ChatMessage[];
  /** Optional tools the LLM can invoke. */
  readonly tools?: readonly ToolDefinition[];
  /** Optional model override (e.g. 'glm-5'). */
  readonly model?: string;
  /** Sampling temperature (0-2). */
  readonly temperature?: number;
  /** Maximum tokens in the completion. */
  readonly maxTokens?: number;
  /** Optional stop sequences. */
  readonly stopSequences?: readonly string[];
  /** Correlation: session identifier. */
  readonly sessionId: string;
  /** Correlation: chat identifier. */
  readonly chatId: string;
  /** Correlation: trace identifier. */
  readonly traceId: string;
}

// ---------------------------------------------------------------------------
// InferenceResult
// ---------------------------------------------------------------------------

/**
 * Result of a non-streaming inference call.
 */
export interface InferenceResult {
  /** Generated text content from the LLM. */
  readonly content: string;
  /** Tool calls requested by the LLM (if any). */
  readonly toolCalls?: readonly ToolCall[];
  /** Whether the LLM requested tool calls. */
  readonly hasToolCalls: boolean;
  /** Token usage statistics. */
  readonly usage: TokenUsage;
  /** Model identifier that produced the response. */
  readonly model: string;
  /** Provider identifier. */
  readonly provider: string;
  /** Reason the generation finished. */
  readonly finishReason?: string;
}

// ---------------------------------------------------------------------------
// InferenceChunk (streaming)
// ---------------------------------------------------------------------------

/**
 * A single streaming chunk from inference.
 * Wraps LLMChunk with aggregated tool calls.
 */
export interface InferenceChunk {
  /** Incremental content delta. */
  readonly content: string;
  /** Tool calls accumulated so far in the stream. */
  readonly toolCalls?: readonly ToolCall[];
  /** Whether the LLM has requested tool calls. */
  readonly hasToolCalls: boolean;
  /** Cumulative token usage (may be absent mid-stream). */
  readonly usage?: TokenUsage;
  /** Indicates this is the final chunk. */
  readonly finishReason?: string;
  /** Model identifier. */
  readonly model: string;
  /** Provider identifier. */
  readonly provider: string;
}
