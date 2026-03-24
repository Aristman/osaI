/**
 * @osai/memory -- Public types
 *
 * Shared type definitions for the Memory System.
 */

// ---------------------------------------------------------------------------
// Short-term Memory
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  category: 'message' | 'tool_result' | 'system' | 'metadata';
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

// ---------------------------------------------------------------------------
// Long-term Memory
// ---------------------------------------------------------------------------

export interface Fact {
  id: string;
  content: string;
  category: 'fact' | 'preference' | 'knowledge' | 'error' | 'pattern';
  source: string;
  confidence: number;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  embedding?: number[];
  tags?: string[];
}

// ---------------------------------------------------------------------------
// RAG Pipeline
// ---------------------------------------------------------------------------

export interface RagQuery {
  query: string;
  sessionId?: string;
  maxResults?: number;
  minConfidence?: number;
}

export interface RagResult {
  facts: Fact[];
  context: string;
  totalFacts: number;
  queryTokens: number;
}

// ---------------------------------------------------------------------------
// Embedding Provider
// ---------------------------------------------------------------------------

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getDimension(): number;
}
