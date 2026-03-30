/**
 * @osai/agent -- Context Assembly Types
 *
 * Input / Result types for the ContextAssembler pipeline.
 */

import type { ChatMessage } from '@osai/providers';

// ---------------------------------------------------------------------------
// RAG Query Function
// ---------------------------------------------------------------------------

/** A single result from a RAG / memory query. */
export interface RAGResult {
  /** Relevant content snippet. */
  readonly content: string;
  /** Similarity score (0..1), higher is better. */
  readonly score: number;
}

/** Injectable RAG query function. */
export type RAGQueryFn = (
  query: string,
) => Promise<readonly RAGResult[]>;

// ---------------------------------------------------------------------------
// Context Assembly Input
// ---------------------------------------------------------------------------

/**
 * All data required by the ContextAssembler to build the final messages array.
 */
export interface ContextAssemblyInput {
  /** Current user message content. */
  readonly userMessage: string;
  /** Base system prompt (before RAG injection). */
  readonly systemPrompt: string;
  /** Chat history messages (already persisted). */
  readonly messages: readonly ChatMessage[];
  /** Correlation: session identifier. */
  readonly sessionId: string;
  /** Correlation: chat identifier. */
  readonly chatId: string;
  /** Correlation: trace identifier (spans the full agent loop). */
  readonly traceId: string;
}

// ---------------------------------------------------------------------------
// Context Assembly Result
// ---------------------------------------------------------------------------

/**
 * The assembled messages array ready to be sent to the LLM,
 * plus optional metadata about what was included.
 */
export interface ContextAssemblyResult {
  /**
   * Final ordered messages array:
   * [system (with RAG), ...chatHistory, ...additionalUser]
   */
  readonly messages: readonly ChatMessage[];
  /** Number of RAG results injected into the system prompt. */
  readonly ragResultCount: number;
  /** Whether RAG was available and queried. */
  readonly ragQueried: boolean;
}
