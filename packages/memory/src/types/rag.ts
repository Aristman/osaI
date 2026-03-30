/**
 * Types for the Retrieval-Augmented Generation (RAG) pipeline.
 *
 * RAG combines vector search with memory retrieval to provide
 * semantically relevant context for LLM inference.
 */

import type { MemoryEntry } from './memory.js';

/** A query to the RAG pipeline. */
export interface RAGQuery {
  /** The natural language query text. */
  text: string;
  /** Optional chat ID to scope the search. */
  chatId?: string;
  /** Optional session ID to scope the search. */
  sessionId?: string;
  /** Maximum number of results to return. */
  topK?: number;
  /** Minimum similarity threshold (0 to 1). Results below this are excluded. */
  minSimilarity?: number;
  /** Optional memory categories to filter by. */
  categories?: string[];
  /** Optional tags to filter by. */
  tags?: string[];
}

/** A single result from the RAG pipeline. */
export interface RAGResult {
  /** The memory entry that matched. */
  entry: MemoryEntry;
  /** Cosine similarity score (0 to 1). */
  similarity: number;
  /** Position in the ranked result list (0-based). */
  rank: number;
}

/** Configuration for the RAG pipeline. */
export interface RAGConfig {
  /** Default maximum number of results. */
  defaultTopK: number;
  /** Default minimum similarity threshold. */
  defaultMinSimilarity: number;
  /** Whether to include chat-scoped memories in RAG results. */
  includeChatMemory: boolean;
  /** Whether to include session-scoped memories in RAG results. */
  includeSessionMemory: boolean;
  /** Whether to include long-term memories in RAG results. */
  includeLongTermMemory: boolean;
}

/** Default RAG configuration values. */
export const RAG_DEFAULTS: RAGConfig = {
  defaultTopK: 5,
  defaultMinSimilarity: 0.7,
  includeChatMemory: true,
  includeSessionMemory: true,
  includeLongTermMemory: true,
} as const;
