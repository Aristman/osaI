/**
 * @osai/memory -- Memory System E2E Tests (T-008)
 *
 * TC-005: E2E: store -> embed -> vector upsert -> query -> search -> results
 * TC-006: E2E: remember -> recall through RAG pipeline
 * TC-007: E2E: buildContext with pruning on overflow
 * TC-008: E2E: forget deletes from SQLite + vector storage
 *
 * Uses:
 *   - InMemoryVectorStorage (deterministic cosine similarity)
 *   - In-memory SQLite (DatabaseManager with ":memory:")
 *   - Mock EmbeddingProvider (deterministic vectors)
 *   - Mock LLMProvider for FactExtractor (predictable JSON with facts)
 */

import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryService, type MemoryServiceInitOptions } from '../../memory-service.js';
import type { EmbeddingProvider, EmbeddingResult } from '../../embeddings/embedding-provider.js';
import type { VectorStorage } from '../../vector-storage/vector-storage.js';
import { InMemoryVectorStorage } from '../../vector-storage/in-memory-vector-storage.js';
import { MemoryRepository } from '../../db/memory-repository.js';
import { RAGPipeline } from '../../rag/rag-pipeline.js';
import { createRAGConfig } from '../../rag/rag-config.js';
import { MemoryManager } from '../../memory/memory-manager.js';
import type { MemoryEntry } from '../../types/memory.js';
import { MemoryCategory, MemoryTier } from '../../types/memory.js';
import { PruningPriority, type ContextEntry, type Summarizer } from '../../types/context.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '@osai/providers';
import { ProviderStatus } from '@osai/providers';
import { FactExtractor } from '../../facts/fact-extractor.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VECTOR_DIMENSIONS = 8;
const DETERMINISTIC_VECTOR = new Array(VECTOR_DIMENSIONS).fill(1.0);

/**
 * Generate a deterministic vector based on text content.
 * Different texts produce different (but deterministic) vectors.
 */
function generateVector(text: string): number[] {
  // Simple hash-based vector generation
  const vector = new Array(VECTOR_DIMENSIONS).fill(0);
  for (let i = 0; i < text.length && i < VECTOR_DIMENSIONS; i++) {
    vector[i] = (text.charCodeAt(i) % 100) / 100;
  }
  // Normalize to unit vector for cosine similarity
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] = vector[i]! / norm;
    }
  }
  return vector;
}

// ---------------------------------------------------------------------------
// Mock EmbeddingProvider
// ---------------------------------------------------------------------------

function createMockEmbeddingProvider(): EmbeddingProvider {
  return {
    name: 'mock-embedder',
    embed: vi.fn().mockImplementation(async (textOrTexts: string | string[]): Promise<EmbeddingResult | EmbeddingResult[]> => {
      if (Array.isArray(textOrTexts)) {
        return textOrTexts.map((t) => ({
          vector: generateVector(t),
          dimensions: VECTOR_DIMENSIONS,
          provider: 'ollama' as const,
          durationMs: 1,
        }));
      }
      return {
        vector: generateVector(textOrTexts),
        dimensions: VECTOR_DIMENSIONS,
        provider: 'ollama' as const,
        durationMs: 1,
      };
    }),
    isAvailable: vi.fn().mockResolvedValue(true),
    getDimensions: vi.fn().mockReturnValue(VECTOR_DIMENSIONS),
  };
}

// ---------------------------------------------------------------------------
// Mock LLMProvider (for FactExtractor)
// ---------------------------------------------------------------------------

function createMockLLMProvider(facts: Array<{ content: string; tags?: string[]; category?: string }>): LLMProvider {
  const responseContent = JSON.stringify(facts);

  return {
    id: 'mock-llm',
    name: 'Mock LLM',
    isAvailable: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockImplementation(async (_request: LLMRequest): Promise<LLMResponse> => ({
      content: responseContent,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      model: 'mock-model',
      provider: 'mock-llm',
      finishReason: 'stop',
    })),
    stream: vi.fn().mockImplementation(async function* () {
      // empty stream
    }),
    countTokens: vi.fn().mockReturnValue(10),
    getStatus: vi.fn().mockReturnValue(ProviderStatus.Available),
  };
}

// ---------------------------------------------------------------------------
// Mock Summarizer
// ---------------------------------------------------------------------------

const mockSummarizer: Summarizer = {
  summarize: vi.fn().mockResolvedValue('[Summary of previous conversation]'),
};

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

function createTestEntry(content: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const now = new Date().toISOString();
  return {
    id: `mem_${crypto.randomUUID()}`,
    content,
    category: MemoryCategory.General,
    tier: MemoryTier.LongTerm,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// E2E Tests
// ---------------------------------------------------------------------------

describe('Memory System E2E', () => {
  let db: Database.Database;
  let repository: MemoryRepository;
  let vectorStorage: InMemoryVectorStorage;
  let embedder: EmbeddingProvider;
  let memoryManager: MemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createTestDb();
    repository = new MemoryRepository(db);
    repository.initSchema();
    vectorStorage = new InMemoryVectorStorage(VECTOR_DIMENSIONS);
    vectorStorage.init();
    embedder = createMockEmbeddingProvider();

    // Build RAG pipeline
    const ragConfig = createRAGConfig({
      defaultTopK: 5,
      defaultMinSimilarity: 0.0, // low threshold for testing
    });
    const ragPipeline = new RAGPipeline(embedder, vectorStorage, ragConfig);

    memoryManager = new MemoryManager(ragPipeline, repository, embedder, vectorStorage);
  });

  // -----------------------------------------------------------------------
  // TC-005: E2E store -> embed -> vector upsert -> query -> search -> results
  // -----------------------------------------------------------------------
  describe('TC-005: E2E store -> embed -> vector upsert -> query -> results', () => {
    it('should store a memory, generate embedding, and retrieve it via query', async () => {
      // Step 1: Store a memory entry
      const entry = createTestEntry('The user prefers working with TypeScript');
      const stored = await memoryManager.store(entry, MemoryTier.LongTerm);

      expect(stored.id).toBe(entry.id);
      expect(stored.content).toBe(entry.content);

      // Step 2: Verify the entry is in the repository
      const found = repository.findById(entry.id);
      expect(found).not.toBeNull();
      expect(found!.content).toBe('The user prefers working with TypeScript');

      // Step 3: Verify the vector is in vector storage
      expect(vectorStorage.size()).toBe(1);

      // Step 4: Query for the memory using similar text
      const results = await memoryManager.query('TypeScript preferences');

      // Should find the stored memory
      expect(results.length).toBeGreaterThanOrEqual(1);
      const match = results.find((r) => r.entry.id === entry.id);
      expect(match).toBeDefined();
      expect(match!.entry.content).toBe('The user prefers working with TypeScript');
    });

    it('should store multiple entries and retrieve the most relevant', async () => {
      // Store multiple memories
      const entry1 = createTestEntry('Python is a versatile programming language');
      const entry2 = createTestEntry('The user loves pizza with extra cheese');
      const entry3 = createTestEntry('JavaScript frameworks include React and Vue');

      await memoryManager.store(entry1, MemoryTier.LongTerm);
      await memoryManager.store(entry2, MemoryTier.LongTerm);
      await memoryManager.store(entry3, MemoryTier.LongTerm);

      // Query for programming-related content
      const results = await memoryManager.query('programming languages');

      // Should find programming-related entries
      expect(results.length).toBeGreaterThanOrEqual(1);
      const contents = results.map((r) => r.entry.content);
      expect(contents.some((c) => c.includes('programming') || c.includes('language'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // TC-006: E2E remember -> recall through RAG pipeline
  // -----------------------------------------------------------------------
  describe('TC-006: E2E remember -> recall through RAG pipeline', () => {
    it('should remember a fact and recall it via chat', async () => {
      // Step 1: Remember something
      const stored = await memoryManager.remember(
        'The user works at a tech company in Moscow',
        'chat-abc',
      );

      expect(stored.content).toBe('The user works at a tech company in Moscow');
      expect(stored.tier).toBe(MemoryTier.LongTerm);

      // Step 2: Recall using the chat ID and a query
      const recalled = await memoryManager.recall('chat-abc', 'Where does the user work?');

      expect(recalled.length).toBeGreaterThanOrEqual(1);
      const match = recalled.find((e) => e.id === stored.id);
      expect(match).toBeDefined();
      expect(match!.content).toBe('The user works at a tech company in Moscow');
    });

    it('should combine chat-scoped and long-term memories in recall', async () => {
      // Store a chat-tier memory directly
      const chatEntry = createTestEntry(
        'User asked about weather today',
        { tier: MemoryTier.Chat, chatId: 'chat-xyz' },
      );
      await memoryManager.store(chatEntry, MemoryTier.Chat);

      // Remember a long-term fact
      await memoryManager.remember('User prefers Celsius over Fahrenheit', 'chat-xyz');

      // Recall should return both
      const recalled = await memoryManager.recall('chat-xyz', 'temperature preferences');

      expect(recalled.length).toBeGreaterThanOrEqual(1);
      const contents = recalled.map((e) => e.content);
      expect(contents.some((c) => c.includes('Celsius'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // TC-007: E2E buildContext with pruning on overflow
  // -----------------------------------------------------------------------
  describe('TC-007: E2E buildContext with pruning on overflow', () => {
    it('should not prune when context fits within budget', async () => {
      const { ContextWindowManager } = await import('../../context/context-window-manager.js');

      const manager = new ContextWindowManager({
        summarizer: mockSummarizer,
        config: {
          reservedForResponse: 100,
          summarizationThreshold: 0.8,
          minMessages: 2,
        },
      });

      const messages: ContextEntry[] = [
        {
          role: 'user',
          content: 'Hello',
          priority: PruningPriority.EarlyHistory,
          tokenCount: 5,
        },
        {
          role: 'assistant',
          content: 'Hi there!',
          priority: PruningPriority.EarlyHistory,
          tokenCount: 10,
        },
      ];

      const result = manager.buildContext(messages, 'You are a helpful assistant.', 10000);

      expect(result.pruningResult).toBeUndefined();
      expect(result.summarizationTriggered).toBe(false);
      // System prompt + 2 messages = 3 entries
      expect(result.context).toHaveLength(3);
    });

    it('should prune when context exceeds budget', async () => {
      const { ContextWindowManager } = await import('../../context/context-window-manager.js');

      const manager = new ContextWindowManager({
        summarizer: mockSummarizer,
        config: {
          reservedForResponse: 10,
          summarizationThreshold: 0.8,
          minMessages: 2,
        },
      });

      // Create entries that exceed the token budget
      const messages: ContextEntry[] = [
        {
          role: 'system',
          content: '[RAG result about something]',
          priority: PruningPriority.LongTermRAG,
          tokenCount: 50,
        },
        {
          role: 'user',
          content: 'First message',
          priority: PruningPriority.EarlyHistory,
          tokenCount: 20,
        },
        {
          role: 'assistant',
          content: 'First response',
          priority: PruningPriority.EarlyHistory,
          tokenCount: 20,
        },
        {
          role: 'user',
          content: 'Second message',
          priority: PruningPriority.EarlyHistory,
          tokenCount: 20,
        },
        {
          role: 'assistant',
          content: 'Second response',
          priority: PruningPriority.EarlyHistory,
          tokenCount: 20,
        },
      ];

      // System prompt + RAG + messages = 100 + 50 + 130 = 180 tokens
      // Budget = 200 - 10 reserved = 190. Summarization at 190 * 0.8 = 152
      // Total = 100 (sys) + 50 (RAG) + 130 (msgs) = 280 > 152 => summarization triggered
      const result = manager.buildContext(messages, 'A'.repeat(400), 200);

      // Should have triggered summarization or pruning
      expect(result.summarizationTriggered || result.pruningResult?.wasPruned).toBe(true);
    });

    it('should preserve system prompt even when pruning', async () => {
      const { ContextWindowManager } = await import('../../context/context-window-manager.js');

      const manager = new ContextWindowManager({
        summarizer: mockSummarizer,
        config: {
          reservedForResponse: 10,
          summarizationThreshold: 0.99, // effectively disable summarization
          minMessages: 0,
        },
      });

      // System prompt + huge RAG + messages
      const messages: ContextEntry[] = [
        {
          role: 'system',
          content: '[RAG result]',
          priority: PruningPriority.LongTermRAG,
          tokenCount: 500,
        },
        {
          role: 'user',
          content: 'message',
          priority: PruningPriority.EarlyHistory,
          tokenCount: 500,
        },
      ];

      const result = manager.buildContext(messages, 'System prompt', 100);

      // System prompt should always be present
      const systemEntries = result.context.filter(
        (e) => e.priority === PruningPriority.SystemPrompt,
      );
      expect(systemEntries.length).toBeGreaterThanOrEqual(1);
      expect(systemEntries[0]!.content).toBe('System prompt');
    });
  });

  // -----------------------------------------------------------------------
  // TC-008: E2E forget deletes from SQLite + vector storage
  // -----------------------------------------------------------------------
  describe('TC-008: E2E forget deletes from SQLite + vector storage', () => {
    it('should remove entry from both SQLite and vector storage', async () => {
      // Store a memory
      const entry = createTestEntry('Sensitive information to be forgotten');
      await memoryManager.store(entry, MemoryTier.LongTerm);

      // Verify it exists in both storages
      expect(repository.findById(entry.id)).not.toBeNull();
      expect(vectorStorage.size()).toBe(1);

      // Forget the memory
      const deleted = await memoryManager.forget(entry.id);

      expect(deleted).toBe(true);

      // Verify it is removed from both storages
      expect(repository.findById(entry.id)).toBeNull();
      expect(vectorStorage.size()).toBe(0);
    });

    it('should return false when forgetting non-existent entry', async () => {
      const deleted = await memoryManager.forget('non-existent-id');
      expect(deleted).toBe(false);
    });

    it('should allow querying after forgetting -- no ghost results', async () => {
      // Store two memories
      const entry1 = createTestEntry('Memory to keep');
      const entry2 = createTestEntry('Memory to forget');

      await memoryManager.store(entry1, MemoryTier.LongTerm);
      await memoryManager.store(entry2, MemoryTier.LongTerm);

      expect(vectorStorage.size()).toBe(2);

      // Forget one
      await memoryManager.forget(entry2.id);

      // Query should not return the forgotten memory
      const results = await memoryManager.query('Memory');
      const ids = results.map((r) => r.entry.id);

      expect(ids).not.toContain(entry2.id);
      expect(ids).toContain(entry1.id);
    });
  });
});

// ---------------------------------------------------------------------------
// MemoryService Facade E2E Tests
// ---------------------------------------------------------------------------

describe('MemoryService Facade E2E', () => {
  let db: Database.Database;
  let vectorStorage: InMemoryVectorStorage;
  let embedder: EmbeddingProvider;
  let llm: LLMProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createTestDb();
    vectorStorage = new InMemoryVectorStorage(VECTOR_DIMENSIONS);
    vectorStorage.init();
    embedder = createMockEmbeddingProvider();
    llm = createMockLLMProvider([
      { content: 'User prefers dark mode', tags: ['preference', 'ui'], category: 'preference' },
    ]);
  });

  it('should initialize, store, query, and destroy', async () => {
    const service = new MemoryService();

    await service.init({
      embedder,
      vectorStorage,
      ragConfig: { defaultMinSimilarity: 0.0 },
      summarizer: mockSummarizer,
      llmProvider: llm,
    });

    expect(service.isInitialized()).toBe(true);

    // Store
    const entry: MemoryEntry = {
      id: 'mem_test_1',
      content: 'The user enjoys reading science fiction books',
      category: MemoryCategory.Preference,
      tier: MemoryTier.LongTerm,
      tags: ['hobby', 'reading'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const stored = await service.store(entry, MemoryTier.LongTerm);
    expect(stored.content).toBe('The user enjoys reading science fiction books');

    // Query
    const results = await service.query('reading habits');
    expect(results.length).toBeGreaterThanOrEqual(1);

    // Build context
    const context = service.buildContext(
      [{ role: 'user', content: 'Hello', priority: PruningPriority.EarlyHistory, tokenCount: 5 }],
      'System prompt',
      10000,
    );
    expect(context.context.length).toBeGreaterThanOrEqual(2);

    // Extract facts
    const facts = await service.extractFacts('The user prefers dark mode.', 'chat-1');
    expect(facts).toHaveLength(1);
    expect(facts[0]!.content).toBe('User prefers dark mode');

    // Forget
    const forgotten = await service.forget('mem_test_1');
    expect(forgotten).toBe(true);

    // Destroy
    service.destroy();
    expect(service.isInitialized()).toBe(false);
  });

  it('should throw on operations before init', async () => {
    const service = new MemoryService();

    await expect(service.query('test')).rejects.toThrow('not initialized');
    await expect(
      service.store(
        {
          id: 'x',
          content: 'test',
          category: MemoryCategory.General,
          tier: MemoryTier.LongTerm,
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        MemoryTier.LongTerm,
      ),
    ).rejects.toThrow('not initialized');
    await expect(service.forget('x')).rejects.toThrow('not initialized');
    expect(() => service.buildContext([], 'sys', 1000)).toThrow('not initialized');
    await expect(service.extractFacts('test')).rejects.toThrow('not initialized');
  });

  it('should return empty facts when no LLM provider configured', async () => {
    const service = new MemoryService();

    await service.init({
      embedder,
      vectorStorage,
      summarizer: mockSummarizer,
      // No llmProvider
    });

    const facts = await service.extractFacts('Some response');
    expect(facts).toEqual([]);

    service.destroy();
  });
});
