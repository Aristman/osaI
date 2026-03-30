/**
 * @osai/memory -- RAG Pipeline Configuration
 *
 * Default configuration values for the RAG pipeline.
 * Uses RAG_DEFAULTS from types as the source of truth.
 */

import type { RAGConfig } from '../types/rag.js';
import { RAG_DEFAULTS } from '../types/rag.js';

/**
 * Create a RAG config with optional overrides.
 *
 * @param overrides  Partial config to merge with defaults.
 * @returns Complete RAGConfig.
 */
export function createRAGConfig(overrides?: Partial<RAGConfig>): RAGConfig {
  return {
    defaultTopK: overrides?.defaultTopK ?? RAG_DEFAULTS.defaultTopK,
    defaultMinSimilarity: overrides?.defaultMinSimilarity ?? RAG_DEFAULTS.defaultMinSimilarity,
    includeChatMemory: overrides?.includeChatMemory ?? RAG_DEFAULTS.includeChatMemory,
    includeSessionMemory: overrides?.includeSessionMemory ?? RAG_DEFAULTS.includeSessionMemory,
    includeLongTermMemory: overrides?.includeLongTermMemory ?? RAG_DEFAULTS.includeLongTermMemory,
  };
}
