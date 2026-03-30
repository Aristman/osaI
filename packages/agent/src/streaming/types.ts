/**
 * @osai/agent -- Streaming Types (T-006)
 *
 * Types for the streaming response pipeline.
 * StreamChunk wraps InferenceChunk for client delivery.
 * StreamEvent represents lifecycle events (complete, error).
 * StreamCallback is the user-provided function invoked per chunk.
 */

import type { ToolCall } from '@osai/providers';

// ---------------------------------------------------------------------------
// StreamChunk
// ---------------------------------------------------------------------------

/**
 * A single chunk delivered to the streaming callback.
 * Mirrors InferenceChunk fields used for client-side rendering.
 */
export interface StreamChunk {
  /** Incremental content delta. */
  readonly content: string;
  /** Tool calls accumulated so far in the stream. */
  readonly toolCalls?: readonly ToolCall[];
  /** Whether the LLM has requested tool calls. */
  readonly hasToolCalls: boolean;
  /** Model identifier. */
  readonly model: string;
  /** Provider identifier. */
  readonly provider: string;
}

// ---------------------------------------------------------------------------
// StreamEvent
// ---------------------------------------------------------------------------

/**
 * Lifecycle event emitted by StreamManager.
 */
export interface StreamEvent {
  /** Event type discriminator. */
  readonly type: 'complete' | 'error';
  /** Full accumulated text (present on 'complete'). */
  readonly fullText: string;
  /** Model used for the final chunk. */
  readonly model: string;
  /** Provider used for the final chunk. */
  readonly provider: string;
  /** Error object (present on 'error'). */
  readonly error?: Error;
}

// ---------------------------------------------------------------------------
// StreamCallback
// ---------------------------------------------------------------------------

/**
 * Callback function invoked for each streaming chunk.
 */
export type StreamCallback = (chunk: StreamChunk) => void;
