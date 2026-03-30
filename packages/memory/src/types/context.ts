/**
 * Types for the Context Window Manager.
 *
 * The context window manager controls what information is included
 * in the LLM prompt, applying priority-based pruning when the context
 * exceeds available token limits.
 */

/** Pruning priority levels. Lower numbers are pruned first. */
export enum PruningPriority {
  /** Long-term RAG results -- first to be pruned. */
  LongTermRAG = 1,
  /** Knowledge base chunks. */
  KnowledgeBase = 2,
  /** Tool call results. */
  ToolCalls = 3,
  /** Early conversation history. */
  EarlyHistory = 4,
  /** System prompt -- never pruned (protected). */
  SystemPrompt = 5,
}

/** Result of a context pruning operation. */
export interface PruningResult {
  /** Whether pruning was applied. */
  wasPruned: boolean;
  /** Number of tokens before pruning. */
  tokensBefore: number;
  /** Number of tokens after pruning. */
  tokensAfter: number;
  /** Number of tokens removed. */
  tokensRemoved: number;
  /** Which priority levels were pruned. */
  prunedLevels: PruningPriority[];
  /** Human-readable description of what was removed. */
  description: string;
  /** The pruned context entries after pruning. */
  context: ContextEntry[];
}

/** Configuration for the context window manager. */
export interface ContextWindowConfig {
  /** Maximum token limit for the context window. */
  maxTokens: number;
  /** Tokens to reserve for the LLM response. */
  reservedForResponse: number;
  /** Fraction (0-1) at which summarization is triggered (e.g., 0.8 = 80%). */
  summarizationThreshold: number;
  /** Minimum number of messages to keep regardless of pruning. */
  minMessages: number;
  /** Pruning priority order (lowest priority pruned first). */
  pruningOrder: PruningPriority[];
}

/** The assembled context ready for LLM inference. */
export interface ContextResult {
  /** Assembled context messages and content. */
  context: ContextEntry[];
  /** Total token count of the assembled context. */
  totalTokens: number;
  /** Pruning result if pruning was applied. */
  pruningResult?: PruningResult;
  /** Whether summarization was triggered. */
  summarizationTriggered: boolean;
}

/** A single entry in the assembled context. */
export interface ContextEntry {
  /** Role of the context entry (system, user, assistant, tool, rag, etc.). */
  role: string;
  /** Content text of the entry. */
  content: string;
  /** Pruning priority for this entry. */
  priority: PruningPriority;
  /** Estimated token count. */
  tokenCount: number;
}

/** Injectable summarizer for context condensation. */
export interface Summarizer {
  /**
   * Summarize a list of context entries into a condensed representation.
   *
   * @param messages - Context entries to summarize.
   * @returns A concise text summary.
   */
  summarize(messages: readonly ContextEntry[]): Promise<string>;
}

/** Default context window configuration values. */
export const CONTEXT_DEFAULTS: ContextWindowConfig = {
  maxTokens: 128_000,
  reservedForResponse: 4_096,
  summarizationThreshold: 0.8,
  minMessages: 4,
  pruningOrder: [
    PruningPriority.LongTermRAG,
    PruningPriority.KnowledgeBase,
    PruningPriority.ToolCalls,
    PruningPriority.EarlyHistory,
    PruningPriority.SystemPrompt,
  ],
} as const;
