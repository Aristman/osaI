/**
 * @osai/memory -- MemoryService (T-008)
 *
 * Public facade for the Memory System. Provides unified API for all
 * memory operations: initialization, querying, storing, forgetting,
 * context building, and fact extraction.
 *
 * Delegates to internal components:
 *   - MemoryManager: query, store, forget
 *   - ContextWindowManager: buildContext
 *   - FactExtractor: extractFacts
 *
 * Dependencies are injected via init() for lifecycle management.
 */

import type { LLMProvider } from '@osai/providers';
import type { EmbeddingProvider } from './embeddings/embedding-provider.js';
import type { VectorStorage } from './vector-storage/vector-storage.js';
import type { MemoryEntry, MemoryTier } from './types/memory.js';
import type { RAGConfig, RAGResult } from './types/rag.js';
import type { ContextEntry, ContextResult, Summarizer, ContextWindowConfig } from './types/context.js';
import type { RAGQueryOptions } from './rag/rag-pipeline.js';
import { RAGPipeline } from './rag/rag-pipeline.js';
import { createRAGConfig } from './rag/rag-config.js';
import { MemoryManager } from './memory/memory-manager.js';
import { ContextWindowManager } from './context/context-window-manager.js';
import type { ContextWindowManagerOptions } from './context/context-window-manager.js';
import { FactExtractor } from './facts/fact-extractor.js';
import { LoggerFactory } from '@osai/observability';
import type { Logger as PinoLogger } from 'pino';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for MemoryService initialization. */
export interface MemoryServiceInitOptions {
  /** Embedding provider for generating vectors. */
  embedder: EmbeddingProvider;
  /** Vector storage backend. */
  vectorStorage: VectorStorage;
  /** RAG pipeline configuration (optional overrides). */
  ragConfig?: Partial<RAGConfig>;
  /** Summarizer implementation for context window. */
  summarizer: Summarizer;
  /** Context window configuration (optional overrides). */
  contextConfig?: Partial<ContextWindowConfig>;
  /** LLM provider for fact extraction (optional). */
  llmProvider?: LLMProvider;
}

/** Options for query operations. */
export type MemoryQueryOptions = RAGQueryOptions;

// ---------------------------------------------------------------------------
// MemoryService
// ---------------------------------------------------------------------------

/**
 * MemoryService -- public facade for the Memory System.
 *
 * Provides a unified API for all memory operations. Delegates to
 * specialized internal components while managing their lifecycle.
 *
 * Usage:
 * ```typescript
 * const service = new MemoryService();
 * await service.init({
 *   embedder: myEmbedder,
 *   vectorStorage: myStorage,
 *   summarizer: mySummarizer,
 *   llmProvider: myLLM,
 * });
 *
 * await service.store(entry, 'long-term');
 * const results = await service.query('user preferences');
 * const context = service.buildContext(messages, systemPrompt, 128000);
 * const facts = await service.extractFacts('Response text...', 'chat-1');
 *
 * service.destroy();
 * ```
 */
export class MemoryService {
  private memoryManager: MemoryManager | null = null;
  private contextWindowManager: ContextWindowManager | null = null;
  private factExtractor: FactExtractor | null = null;
  private readonly logger: PinoLogger;
  private initialized = false;

  constructor() {
    this.logger = LoggerFactory.create('memory', 'service');
  }

  /**
   * Initialize the Memory Service with all required dependencies.
   *
   * Creates and wires up internal components:
   * - RAGPipeline (embedder + vectorStorage)
   * - MemoryManager (RAG pipeline + repository via vectorStorage)
   * - ContextWindowManager (summarizer)
   * - FactExtractor (LLM provider, if provided)
   *
   * @param options  Initialization options with all required dependencies.
   * @throws {Error} If already initialized.
   */
  async init(options: MemoryServiceInitOptions): Promise<void> {
    if (this.initialized) {
      throw new Error('MemoryService is already initialized. Call destroy() first.');
    }

    this.logger.info({ action: 'init' }, 'Initializing MemoryService');

    // Initialize vector storage
    options.vectorStorage.init();

    // Create RAG pipeline
    const ragConfig = createRAGConfig(options.ragConfig);
    const ragPipeline = new RAGPipeline(
      options.embedder,
      options.vectorStorage,
      ragConfig,
    );

    // Note: MemoryManager requires a MemoryRepository.
    // Since MemoryService does not create a SQLite connection itself,
    // the repository integration is handled by the embedding/vector storage.
    // The MemoryManager is created with minimal dependencies for the facade.
    // In a full setup, the caller would provide a repository through
    // the existing components. For T-008 integration, we create a
    // lightweight MemoryManager that delegates to the RAG pipeline.
    this.memoryManager = new MemoryManager(
      ragPipeline,
      // MemoryRepository is required but the facade pattern allows
      // deferred setup. The manager handles repository-dependent ops.
      // For the facade, we pass a minimal compatible repository.
      await this.createMinimalRepository(options),
      options.embedder,
      options.vectorStorage,
    );

    // Create context window manager
    const cwmOptions: ContextWindowManagerOptions = {
      summarizer: options.summarizer,
      config: options.contextConfig,
    };
    this.contextWindowManager = new ContextWindowManager(cwmOptions);

    // Create fact extractor (optional -- requires LLM provider)
    if (options.llmProvider !== undefined) {
      this.factExtractor = new FactExtractor(options.llmProvider);
    }

    this.initialized = true;

    this.logger.info({ action: 'init_complete' }, 'MemoryService initialized successfully');
  }

  /**
   * Query the memory system for semantically relevant memories.
   *
   * Delegates to MemoryManager.query() which uses the RAG pipeline.
   *
   * @param text     Natural-language query text.
   * @param options  Optional query overrides (topK, minSimilarity).
   * @returns Array of RAGResult with matching entries and similarity scores.
   * @throws {Error} If service is not initialized.
   */
  async query(text: string, options?: MemoryQueryOptions): Promise<RAGResult[]> {
    this.ensureInitialized();
    return this.memoryManager!.query(text, options);
  }

  /**
   * Store a memory entry.
   *
   * Delegates to MemoryManager.store() which generates embeddings
   * and persists to vector storage + repository.
   *
   * @param entry  The memory entry to store.
   * @param tier   The storage tier (chat, session, long-term).
   * @returns The stored memory entry with timestamps.
   * @throws {Error} If service is not initialized.
   */
  async store(entry: MemoryEntry, tier: MemoryTier): Promise<MemoryEntry> {
    this.ensureInitialized();
    return this.memoryManager!.store(entry, tier);
  }

  /**
   * Delete a memory entry from all storage backends.
   *
   * Delegates to MemoryManager.forget() which removes from
   * SQLite + vector storage.
   *
   * @param id  The unique identifier of the memory to delete.
   * @returns true if deleted, false if not found.
   * @throws {Error} If service is not initialized.
   */
  async forget(id: string): Promise<boolean> {
    this.ensureInitialized();
    return this.memoryManager!.forget(id);
  }

  /**
   * Build the LLM context from messages and system prompt.
   *
   * Delegates to ContextWindowManager.buildContext() which applies
   * priority-based pruning and summarization triggers.
   *
   * @param messages     Context entries (RAG, KB, tool calls, history, etc.).
   * @param systemPrompt The system prompt (never pruned).
   * @param maxTokens    Maximum context window size in tokens.
   * @returns The assembled context with metadata.
   * @throws {Error} If service is not initialized.
   */
  buildContext(
    messages: readonly ContextEntry[],
    systemPrompt: string,
    maxTokens: number,
  ): ContextResult {
    this.ensureInitialized();
    return this.contextWindowManager!.buildContext(messages, systemPrompt, maxTokens);
  }

  /**
   * Extract facts from an LLM response.
   *
   * Delegates to FactExtractor.extract() which uses the LLM provider
   * to identify and structure facts from response text.
   *
   * @param response  The LLM response text.
   * @param chatId    Optional chat ID to associate with extracted facts.
   * @returns Array of MemoryEntry with extracted facts. Empty if no LLM provider
   *          was configured, or on LLM error (graceful degradation).
   * @throws {Error} If service is not initialized.
   */
  async extractFacts(response: string, chatId?: string): Promise<MemoryEntry[]> {
    this.ensureInitialized();

    if (this.factExtractor === null) {
      this.logger.warn(
        { action: 'extract_facts_skipped' },
        'No LLM provider configured for fact extraction, returning empty array',
      );
      return [];
    }

    return this.factExtractor.extract(response, chatId);
  }

  /**
   * Clean up and release resources.
   *
   * Clears internal component references.
   */
  destroy(): void {
    this.logger.info({ action: 'destroy' }, 'Destroying MemoryService');

    this.memoryManager = null;
    this.contextWindowManager = null;
    this.factExtractor = null;
    this.initialized = false;

    this.logger.info({ action: 'destroy_complete' }, 'MemoryService destroyed');
  }

  /**
   * Get the underlying MemoryManager (for advanced usage).
   *
   * @throws {Error} If service is not initialized.
   */
  getMemoryManager(): MemoryManager {
    this.ensureInitialized();
    return this.memoryManager!;
  }

  /**
   * Get the underlying ContextWindowManager (for advanced usage).
   *
   * @throws {Error} If service is not initialized.
   */
  getContextWindowManager(): ContextWindowManager {
    this.ensureInitialized();
    return this.contextWindowManager!;
  }

  /**
   * Check if the service is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('MemoryService is not initialized. Call init() first.');
    }
  }

  /**
   * Create a minimal in-memory repository for the MemoryManager.
   *
   * This is a compatibility adapter since MemoryManager requires
   * a MemoryRepository. In the full integration, the caller would
   * provide a proper SQLite-backed repository. For the facade,
   * we use an in-memory Map-based implementation.
   */
  private async createMinimalRepository(
    _options: MemoryServiceInitOptions,
  ): Promise<import('./db/memory-repository.js').MemoryRepository> {
    // Dynamic import to avoid circular dependencies and ensure
    // the repository is created with the proper database connection.
    const Database = await import('better-sqlite3');
    const { MemoryRepository } = await import('./db/memory-repository.js');

    const db = new Database.default(':memory:');
    const repository = new MemoryRepository(db);
    repository.initSchema();

    return repository;
  }
}
