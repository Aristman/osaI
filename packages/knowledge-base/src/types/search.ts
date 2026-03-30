/**
 * Search types for Knowledge Base (DOMAIN-005)
 */

/** Default search configuration values (aligned with RAG pipeline F-005) */
const KB_SEARCH_DEFAULTS = {
  /** Maximum number of results to return */
  topK: 5,
  /** Minimum cosine similarity threshold */
  minSimilarity: 0.7,
} as const;

/** Search configuration for Knowledge Base queries */
export interface KBSearchConfig {
  /** Maximum number of results to return (default: 5) */
  readonly topK?: number;
  /** Minimum cosine similarity threshold (default: 0.7) */
  readonly minSimilarity?: number;
  /** Optional tag filter -- only search within documents with these tags */
  readonly tags?: readonly string[];
}

/** Resolved search config with defaults applied */
export interface ResolvedKBSearchConfig {
  readonly topK: number;
  readonly minSimilarity: number;
  readonly tags: readonly string[];
}

/** Query for semantic search in the Knowledge Base */
export interface KBSearchQuery {
  /** Natural language search query */
  readonly query: string;
  /** Optional search configuration overrides */
  readonly config?: KBSearchConfig;
}

/** A single search result from the Knowledge Base */
export interface KBSearchResult {
  /** The matching chunk */
  readonly chunk: {
    readonly id: string;
    readonly content: string;
    readonly chunkIndex: number;
  };
  /** Source document information */
  readonly source: {
    readonly documentId: string;
    readonly title: string;
    readonly path: string;
    readonly tags: readonly string[];
  };
  /** Cosine similarity score (0..1) */
  readonly similarity: number;
}

/** Resolve search config by applying defaults */
export function resolveKBSearchConfig(config?: KBSearchConfig): ResolvedKBSearchConfig {
  return {
    topK: config?.topK ?? KB_SEARCH_DEFAULTS.topK,
    minSimilarity: config?.minSimilarity ?? KB_SEARCH_DEFAULTS.minSimilarity,
    tags: config?.tags ?? [],
  };
}

/** Exported defaults for external reference */
export const KB_SEARCH_DEFAULTS_EXPORT = KB_SEARCH_DEFAULTS;
