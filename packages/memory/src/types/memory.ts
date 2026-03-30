/**
 * Core memory types for the three-tier memory system.
 *
 * Tiers: Chat (per-conversation), Session (agent session), Long-term (persistent across sessions).
 */

/** Memory category for semantic classification. */
export enum MemoryCategory {
  /** Factual knowledge extracted from conversations. */
  Fact = 'fact',
  /** User preferences and settings. */
  Preference = 'preference',
  /** Contextual information about the current conversation. */
  Context = 'context',
  /** Skill or capability learned during interaction. */
  Skill = 'skill',
  /** Temporal event or occurrence. */
  Event = 'event',
  /** Generic uncategorized memory. */
  General = 'general',
}

/** Memory tier determines storage lifetime and sharing scope. */
export enum MemoryTier {
  /** Chat-level memory: scoped to a single conversation. */
  Chat = 'chat',
  /** Session-level memory: persists across messages within an agent session. */
  Session = 'session',
  /** Long-term memory: persists across all chats and sessions. */
  LongTerm = 'long-term',
}

/** A single memory entry stored in the system. */
export interface MemoryEntry {
  /** Unique identifier. */
  id: string;
  /** The memory content text. */
  content: string;
  /** Semantic category for classification. */
  category: MemoryCategory;
  /** Storage tier determining lifetime and scope. */
  tier: MemoryTier;
  /** Optional chat ID for chat-scoped memory. */
  chatId?: string;
  /** Optional session ID for session-scoped memory. */
  sessionId?: string;
  /** Tags for search and filtering. */
  tags: string[];
  /** Relevance score from 0 to 1 (set during RAG retrieval). */
  relevanceScore?: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
  /** Optional summary of the memory content. */
  summary?: string;
  /** Embedding vector (populated during RAG operations). */
  embedding?: number[];
}
