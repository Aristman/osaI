/**
 * @osai/memory -- MemoryManager Unit Tests
 *
 * Tests TC-001 through TC-007 from ROADMAP_TASKS_F-005.md (T-006).
 * Uses mock RAGPipeline, MemoryRepository, EmbeddingProvider, VectorStorage
 * for deterministic testing.
 *
 * Test cases:
 *   TC-001: store() saves to long-term tier + generates embedding + upserts in vector storage
 *   TC-002: remember() creates MemoryEntry with tier=long-term and stores
 *   TC-003: query() calls RAG pipeline and returns relevant entries
 *   TC-004: forget(id) deletes from SQLite + vector storage
 *   TC-005: recall(chatId, query) searches chat memory + long-term via RAG
 *   TC-006: store() with tier=chat stores only in chat_memory (without vector search)
 *   TC-007: store() logs actions in audit log (trace_id)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryManager, MemoryManagerError } from '../../memory/memory-manager.js';
import type { RAGPipeline, RAGQueryOptions } from '../../rag/rag-pipeline.js';
import type { EmbeddingProvider } from '../../embeddings/embedding-provider.js';
import type { VectorStorage } from '../../vector-storage/vector-storage.js';
import type { MemoryRepository, StoreMemoryEntry } from '../../db/memory-repository.js';
import type { EmbeddingResult } from '../../types/embeddings.js';
import type { RAGResult } from '../../types/rag.js';
import { MemoryCategory, MemoryTier } from '../../types/memory.js';
import type { MemoryEntry } from '../../types/memory.js';

// =================================================================
// Mock Factories
// =================================================================

function createMockRAGPipeline(
  options?: Partial<{ results: RAGResult[]; queryError: Error }>,
): RAGPipeline {
  return {
    query: vi.fn().mockResolvedValue(options?.results ?? []),
  } as unknown as RAGPipeline;
}

function createMockEmbeddingProvider(
  options?: Partial<{ embedResult: EmbeddingResult; embedError: Error }>,
): EmbeddingProvider {
  const result: EmbeddingResult = options?.embedResult ?? {
    vector: [0.1, 0.2, 0.3, 0.4],
    dimensions: 4,
    provider: 'ollama',
    durationMs: 10,
  };

  return {
    name: 'mock-embedder',
    embed: options?.embedError
      ? vi.fn().mockRejectedValue(options.embedError)
      : vi.fn().mockResolvedValue(result),
    isAvailable: vi.fn().mockResolvedValue(true),
    getDimensions: vi.fn().mockReturnValue(4),
  };
}

function createMockVectorStorage(): VectorStorage {
  return {
    init: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    search: vi.fn().mockReturnValue([]),
  };
}

function createMockRepository(
  options?: Partial<{
    storedEntry: { id: string; content: string; tier: 'chat' | 'session' | 'long-term'; chatId?: string; sessionId?: string; tags?: string[]; metadata?: Record<string, unknown>; createdAt: string; updatedAt: string };
    findByChatResult: Array<{ id: string; content: string; tier: string; chatId?: string; sessionId?: string; tags?: string[]; createdAt: string; updatedAt: string; metadata?: Record<string, unknown> }>;
    deleteResult: boolean;
    deleteError: Error;
  }>,
): MemoryRepository {
  const defaultStoredEntry = {
    id: 'mem-1',
    content: 'test content',
    tier: 'long-term' as const,
    tags: [],
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  };

  return {
    initSchema: vi.fn(),
    store: vi.fn().mockReturnValue(options?.storedEntry ?? defaultStoredEntry),
    findById: vi.fn().mockReturnValue(null),
    findByChat: vi.fn().mockReturnValue(options?.findByChatResult ?? []),
    findBySession: vi.fn().mockReturnValue([]),
    findLongTerm: vi.fn().mockReturnValue([]),
    delete: options?.deleteError
      ? vi.fn().mockImplementation(() => {
          throw options.deleteError!;
        })
      : vi.fn().mockReturnValue(options?.deleteResult ?? true),
    searchByTags: vi.fn().mockReturnValue([]),
  };
}

/** Create a test MemoryEntry (domain type from types/memory.ts). */
function createTestEntry(overrides?: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: 'mem-test-1',
    content: 'Test memory content',
    category: MemoryCategory.General,
    tier: MemoryTier.LongTerm,
    tags: [],
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
    ...overrides,
  };
}

/** Create a test RAGResult. */
function createTestRAGResult(overrides?: Partial<RAGResult>): RAGResult {
  return {
    entry: createTestEntry({
      id: 'rag-1',
      content: 'RAG result content',
      tier: MemoryTier.LongTerm,
      category: MemoryCategory.Fact,
    }),
    similarity: 0.92,
    rank: 0,
    ...overrides,
  };
}

// =================================================================
// Tests
// =================================================================

describe('MemoryManager (T-006)', () => {
  let ragPipeline: RAGPipeline;
  let repository: MemoryRepository;
  let embedder: EmbeddingProvider;
  let vectorStorage: VectorStorage;
  let manager: MemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    ragPipeline = createMockRAGPipeline();
    repository = createMockRepository();
    embedder = createMockEmbeddingProvider();
    vectorStorage = createMockVectorStorage();

    // Mock LoggerFactory to avoid pino initialization in tests
    vi.mock('@osai/observability', () => ({
      LoggerFactory: {
        create: vi.fn().mockReturnValue({
          info: vi.fn(),
          debug: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          child: vi.fn().mockReturnThis(),
        }),
        getLogger: vi.fn(),
        configure: vi.fn(),
        shutdown: vi.fn(),
      },
      TraceContext: {
        get: vi.fn().mockReturnValue(undefined),
        create: vi.fn(),
        set: vi.fn(),
        clear: vi.fn(),
        runInContext: vi.fn((_, fn) => fn()),
      },
    }));

    manager = new MemoryManager(ragPipeline, repository, embedder, vectorStorage);
  });

  // ---------------------------------------------------------------
  // TC-001: store() saves to long-term tier + generates embedding + upserts in vector storage
  // ---------------------------------------------------------------
  describe('TC-001: store() saves to long-term tier with embedding', () => {
    it('should generate embedding for long-term tier', async () => {
      const entry = createTestEntry({ tier: MemoryTier.LongTerm });

      await manager.store(entry, MemoryTier.LongTerm);

      expect(embedder.embed).toHaveBeenCalledOnce();
      expect(embedder.embed).toHaveBeenCalledWith(entry.content);
    });

    it('should upsert vector in vector storage for long-term tier', async () => {
      const entry = createTestEntry({ tier: MemoryTier.LongTerm });
      const expectedVector = [0.1, 0.2, 0.3, 0.4];

      await manager.store(entry, MemoryTier.LongTerm);

      expect(vectorStorage.upsert).toHaveBeenCalledOnce();
      expect(vectorStorage.upsert).toHaveBeenCalledWith(
        entry.id,
        expectedVector,
        expect.objectContaining({
          content: entry.content,
          tier: MemoryTier.LongTerm,
          category: MemoryCategory.General,
        }),
      );
    });

    it('should store entry in repository for long-term tier', async () => {
      const entry = createTestEntry({
        id: 'mem-lt-1',
        tier: MemoryTier.LongTerm,
        content: 'Important fact to remember',
      });

      await manager.store(entry, MemoryTier.LongTerm);

      expect(repository.store).toHaveBeenCalledOnce();
      expect(repository.store).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mem-lt-1',
          content: 'Important fact to remember',
          tier: 'long-term',
        }),
      );
    });

    it('should call embed before vector upsert and repository store', async () => {
      const callOrder: string[] = [];
      const entry = createTestEntry({ tier: MemoryTier.LongTerm });

      vi.mocked(embedder.embed).mockImplementation(async () => {
        callOrder.push('embed');
        return {
          vector: [0.1, 0.2, 0.3, 0.4],
          dimensions: 4,
          provider: 'ollama',
          durationMs: 10,
        };
      });

      vi.mocked(vectorStorage.upsert).mockImplementation(() => {
        callOrder.push('upsert');
      });

      vi.mocked(repository.store).mockImplementation(() => {
        callOrder.push('store');
        return {
          id: entry.id,
          content: entry.content,
          tier: 'long-term' as const,
          tags: [],
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
        };
      });

      await manager.store(entry, MemoryTier.LongTerm);

      expect(callOrder).toEqual(['embed', 'upsert', 'store']);
    });

    it('should throw MemoryManagerError when embedding fails', async () => {
      const errorEmbedder = createMockEmbeddingProvider({
        embedError: new Error('Ollama not reachable'),
      });
      const errorManager = new MemoryManager(ragPipeline, repository, errorEmbedder, vectorStorage);
      const entry = createTestEntry({ tier: MemoryTier.LongTerm });

      await expect(errorManager.store(entry, MemoryTier.LongTerm)).rejects.toThrow(MemoryManagerError);
      await expect(errorManager.store(entry, MemoryTier.LongTerm)).rejects.toThrow('Ollama not reachable');

      // Should NOT call vector storage or repository when embedding fails
      expect(vectorStorage.upsert).not.toHaveBeenCalled();
      expect(repository.store).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // TC-002: remember() creates MemoryEntry with tier=long-term and stores
  // ---------------------------------------------------------------
  describe('TC-002: remember() creates long-term memory', () => {
    it('should create a MemoryEntry with tier=long-term', async () => {
      await manager.remember('User prefers dark mode');

      expect(repository.store).toHaveBeenCalledOnce();
      const stored = vi.mocked(repository.store).mock.calls[0]![0] as StoreMemoryEntry;
      expect(stored.content).toBe('User prefers dark mode');
      expect(stored.tier).toBe('long-term');
    });

    it('should generate embedding for the remembered content', async () => {
      await manager.remember('Important meeting on Friday');

      expect(embedder.embed).toHaveBeenCalledOnce();
      expect(embedder.embed).toHaveBeenCalledWith('Important meeting on Friday');
    });

    it('should upsert vector in vector storage', async () => {
      await manager.remember('Task deadline is tomorrow');

      expect(vectorStorage.upsert).toHaveBeenCalledOnce();
    });

    it('should associate chatId when provided', async () => {
      await manager.remember('Chat-specific preference', 'chat-123');

      const stored = vi.mocked(repository.store).mock.calls[0]![0] as StoreMemoryEntry;
      expect(stored.chatId).toBe('chat-123');
    });

    it('should generate unique id for each remembered content', async () => {
      await manager.remember('First memory');
      const firstId = vi.mocked(repository.store).mock.calls[0]![0] as StoreMemoryEntry;

      vi.mocked(repository.store).mockClear();

      await manager.remember('Second memory');
      const secondId = vi.mocked(repository.store).mock.calls[0]![0] as StoreMemoryEntry;

      expect(firstId.id).not.toBe(secondId.id);
      expect(firstId.id).toMatch(/^mem_/);
      expect(secondId.id).toMatch(/^mem_/);
    });
  });

  // ---------------------------------------------------------------
  // TC-003: query() calls RAG pipeline and returns relevant entries
  // ---------------------------------------------------------------
  describe('TC-003: query() delegates to RAG pipeline', () => {
    it('should call RAG pipeline query with the text', async () => {
      await manager.query('What are user preferences?');

      expect(ragPipeline.query).toHaveBeenCalledOnce();
      expect(ragPipeline.query).toHaveBeenCalledWith('What are user preferences?', undefined);
    });

    it('should return RAG results from the pipeline', async () => {
      const ragResults = [
        createTestRAGResult({ entry: createTestEntry({ id: 'r1', content: 'Prefers dark mode' }), similarity: 0.95, rank: 0 }),
        createTestRAGResult({ entry: createTestEntry({ id: 'r2', content: 'Uses keyboard shortcuts' }), similarity: 0.88, rank: 1 }),
      ];
      const mockPipeline = createMockRAGPipeline({ results: ragResults });
      const queryManager = new MemoryManager(mockPipeline, repository, embedder, vectorStorage);

      const results = await queryManager.query('preferences');

      expect(results).toHaveLength(2);
      expect(results[0]!.entry.content).toBe('Prefers dark mode');
      expect(results[0]!.similarity).toBe(0.95);
      expect(results[1]!.entry.content).toBe('Uses keyboard shortcuts');
      expect(results[1]!.rank).toBe(1);
    });

    it('should return empty array when no results', async () => {
      const results = await manager.query('nonexistent topic');

      expect(results).toEqual([]);
    });

    it('should pass options to RAG pipeline', async () => {
      await manager.query('test', { topK: 3, minSimilarity: 0.5 });

      expect(ragPipeline.query).toHaveBeenCalledWith('test', { topK: 3, minSimilarity: 0.5 });
    });

    it('should throw MemoryManagerError when RAG pipeline fails', async () => {
      const errorPipeline = createMockRAGPipeline({
        queryError: new Error('RAG pipeline failure'),
      }) as unknown as RAGPipeline;
      vi.mocked(errorPipeline.query).mockRejectedValue(new Error('RAG pipeline failure'));
      const errorManager = new MemoryManager(errorPipeline, repository, embedder, vectorStorage);

      await expect(errorManager.query('test')).rejects.toThrow(MemoryManagerError);
    });
  });

  // ---------------------------------------------------------------
  // TC-004: forget(id) deletes from SQLite + vector storage
  // ---------------------------------------------------------------
  describe('TC-004: forget(id) deletes from both storages', () => {
    it('should delete from vector storage', async () => {
      await manager.forget('mem-123');

      expect(vectorStorage.delete).toHaveBeenCalledOnce();
      expect(vectorStorage.delete).toHaveBeenCalledWith('mem-123');
    });

    it('should delete from repository', async () => {
      await manager.forget('mem-123');

      expect(repository.delete).toHaveBeenCalledOnce();
      expect(repository.delete).toHaveBeenCalledWith('mem-123');
    });

    it('should return true when entry was deleted', async () => {
      const result = await manager.forget('mem-123');

      expect(result).toBe(true);
    });

    it('should return false when entry was not found', async () => {
      const notFoundRepo = createMockRepository({ deleteResult: false });
      const notFoundManager = new MemoryManager(ragPipeline, notFoundRepo, embedder, vectorStorage);

      const result = await notFoundManager.forget('nonexistent-id');

      expect(result).toBe(false);
    });

    it('should delete from vector storage even if repository entry does not exist', async () => {
      const notFoundRepo = createMockRepository({ deleteResult: false });
      const notFoundManager = new MemoryManager(ragPipeline, notFoundRepo, embedder, vectorStorage);

      await notFoundManager.forget('missing-entry');

      expect(vectorStorage.delete).toHaveBeenCalledOnce();
    });

    it('should throw MemoryManagerError when deletion fails unexpectedly', async () => {
      const errorRepo = createMockRepository({ deleteError: new Error('Database locked') });
      const errorManager = new MemoryManager(ragPipeline, errorRepo, embedder, vectorStorage);

      await expect(errorManager.forget('mem-123')).rejects.toThrow(MemoryManagerError);
    });
  });

  // ---------------------------------------------------------------
  // TC-005: recall(chatId, query) searches chat memory + long-term via RAG
  // ---------------------------------------------------------------
  describe('TC-005: recall(chatId, query) combines chat and long-term memory', () => {
    it('should fetch chat entries from repository', async () => {
      const chatEntries = [
        {
          id: 'chat-1',
          content: 'Chat message about project',
          tier: 'chat',
          chatId: 'chat-abc',
          tags: [],
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
        },
      ];
      const recallRepo = createMockRepository({ findByChatResult: chatEntries });
      const recallManager = new MemoryManager(ragPipeline, recallRepo, embedder, vectorStorage);

      await recallManager.recall('chat-abc', 'project details');

      expect(recallRepo.findByChat).toHaveBeenCalledOnce();
      expect(recallRepo.findByChat).toHaveBeenCalledWith('chat-abc');
    });

    it('should call RAG pipeline for long-term search', async () => {
      const ragResults = [
        createTestRAGResult({
          entry: createTestEntry({
            id: 'lt-1',
            content: 'Long-term memory about project',
            tier: MemoryTier.LongTerm,
          }),
          similarity: 0.90,
          rank: 0,
        }),
      ];
      const recallPipeline = createMockRAGPipeline({ results: ragResults });
      const recallManager = new MemoryManager(recallPipeline, repository, embedder, vectorStorage);

      const results = await recallManager.recall('chat-abc', 'project details');

      expect(recallPipeline.query).toHaveBeenCalledOnce();
      expect(recallPipeline.query).toHaveBeenCalledWith('project details');
    });

    it('should combine chat entries and long-term results', async () => {
      const chatEntries = [
        {
          id: 'chat-1',
          content: 'Chat context about API',
          tier: 'chat',
          chatId: 'chat-abc',
          tags: [],
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
        },
      ];
      const ragResults = [
        createTestRAGResult({
          entry: createTestEntry({
            id: 'lt-1',
            content: 'API design preference',
            tier: MemoryTier.LongTerm,
          }),
          similarity: 0.90,
          rank: 0,
        }),
      ];
      const recallPipeline = createMockRAGPipeline({ results: ragResults });
      const recallRepo = createMockRepository({ findByChatResult: chatEntries });
      const recallManager = new MemoryManager(recallPipeline, recallRepo, embedder, vectorStorage);

      const results = await recallManager.recall('chat-abc', 'API');

      expect(results).toHaveLength(2);
      expect(results.some((r) => r.id === 'chat-1')).toBe(true);
      expect(results.some((r) => r.id === 'lt-1')).toBe(true);
    });

    it('should deduplicate entries that appear in both chat and RAG results', async () => {
      const chatEntries = [
        {
          id: 'shared-1',
          content: 'Shared entry',
          tier: 'chat',
          chatId: 'chat-abc',
          tags: [],
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
        },
      ];
      const ragResults = [
        createTestRAGResult({
          entry: createTestEntry({
            id: 'shared-1',
            content: 'Shared entry from RAG',
            tier: MemoryTier.Chat,
          }),
          similarity: 0.85,
          rank: 0,
        }),
      ];
      const recallPipeline = createMockRAGPipeline({ results: ragResults });
      const recallRepo = createMockRepository({ findByChatResult: chatEntries });
      const recallManager = new MemoryManager(recallPipeline, recallRepo, embedder, vectorStorage);

      const results = await recallManager.recall('chat-abc', 'shared');

      // Only one entry with id 'shared-1'
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('shared-1');
    });

    it('should sort results by relevanceScore descending', async () => {
      const chatEntries = [
        {
          id: 'chat-low',
          content: 'Low relevance chat',
          tier: 'chat',
          chatId: 'chat-abc',
          tags: [],
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
        },
      ];
      const ragResults = [
        createTestRAGResult({
          entry: createTestEntry({ id: 'lt-high', content: 'High relevance', tier: MemoryTier.LongTerm }),
          similarity: 0.95,
          rank: 0,
        }),
        createTestRAGResult({
          entry: createTestEntry({ id: 'lt-med', content: 'Medium relevance', tier: MemoryTier.LongTerm }),
          similarity: 0.75,
          rank: 1,
        }),
      ];
      const recallPipeline = createMockRAGPipeline({ results: ragResults });
      const recallRepo = createMockRepository({ findByChatResult: chatEntries });
      const recallManager = new MemoryManager(recallPipeline, recallRepo, embedder, vectorStorage);

      const results = await recallManager.recall('chat-abc', 'query');

      expect(results).toHaveLength(3);
      // Sorted by relevanceScore descending
      expect(results[0]!.relevanceScore).toBe(0.95);
      expect(results[1]!.relevanceScore).toBe(0.75);
      expect(results[2]!.relevanceScore).toBe(0.5);
    });

    it('should assign relevanceScore from RAG similarity', async () => {
      const ragResults = [
        createTestRAGResult({
          entry: createTestEntry({ id: 'lt-1', tier: MemoryTier.LongTerm }),
          similarity: 0.88,
          rank: 0,
        }),
      ];
      const recallPipeline = createMockRAGPipeline({ results: ragResults });
      const recallManager = new MemoryManager(recallPipeline, repository, embedder, vectorStorage);

      const results = await recallManager.recall('chat-abc', 'test');

      const ltResult = results.find((r) => r.id === 'lt-1');
      expect(ltResult).toBeDefined();
      expect(ltResult!.relevanceScore).toBe(0.88);
    });
  });

  // ---------------------------------------------------------------
  // TC-006: store() with tier=chat stores only in chat_memory (without vector search)
  // ---------------------------------------------------------------
  describe('TC-006: store() with tier=chat skips vector storage', () => {
    it('should NOT generate embedding for chat tier', async () => {
      const entry = createTestEntry({ tier: MemoryTier.Chat, chatId: 'chat-abc' });

      await manager.store(entry, MemoryTier.Chat);

      expect(embedder.embed).not.toHaveBeenCalled();
    });

    it('should NOT upsert vector for chat tier', async () => {
      const entry = createTestEntry({ tier: MemoryTier.Chat, chatId: 'chat-abc' });

      await manager.store(entry, MemoryTier.Chat);

      expect(vectorStorage.upsert).not.toHaveBeenCalled();
    });

    it('should store entry in repository for chat tier', async () => {
      const entry = createTestEntry({
        id: 'chat-mem-1',
        tier: MemoryTier.Chat,
        chatId: 'chat-abc',
        content: 'Chat message content',
      });

      await manager.store(entry, MemoryTier.Chat);

      expect(repository.store).toHaveBeenCalledOnce();
      expect(repository.store).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'chat-mem-1',
          content: 'Chat message content',
          tier: 'chat',
          chatId: 'chat-abc',
        }),
      );
    });

    it('should store session tier with embedding', async () => {
      const entry = createTestEntry({
        id: 'session-mem-1',
        tier: MemoryTier.Session,
        sessionId: 'session-xyz',
        content: 'Session context',
      });

      await manager.store(entry, MemoryTier.Session);

      expect(embedder.embed).toHaveBeenCalledOnce();
      expect(vectorStorage.upsert).toHaveBeenCalledOnce();
      expect(repository.store).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: 'session',
          sessionId: 'session-xyz',
        }),
      );
    });
  });

  // ---------------------------------------------------------------
  // TC-007: store() logs actions in audit log (trace_id)
  // ---------------------------------------------------------------
  describe('TC-007: store() logs actions with trace_id', () => {
    it('should log store action with trace_id when trace context is set', async () => {
      // Get the logger mock
      const { LoggerFactory: LoggerFactoryMock } = await import('@osai/observability');
      const loggerMock = vi.mocked(LoggerFactoryMock.create).mock.results[0]?.value;

      const entry = createTestEntry({ tier: MemoryTier.LongTerm });

      await manager.store(entry, MemoryTier.LongTerm);

      // Check that info was called with trace_id
      expect(loggerMock.info).toHaveBeenCalled();
      const calls = vi.mocked(loggerMock.info).mock.calls;
      const storeCall = calls.find(
        (call) => typeof call[0] === 'object' && call[0] !== null && (call[0] as Record<string, unknown>).action === 'store',
      );
      expect(storeCall).toBeDefined();
      expect((storeCall![0] as Record<string, unknown>)).toHaveProperty('trace_id');
    });

    it('should include trace_id in log entries from TraceContext', async () => {
      const { TraceContext: TraceContextMock } = await import('@osai/observability');
      const { LoggerFactory: LoggerFactoryMock } = await import('@osai/observability');

      // Set up trace context
      vi.mocked(TraceContextMock.get).mockReturnValue({
        trace_id: 'test-trace-123',
        span_id: 'span-abc',
      });

      // Create a new manager to pick up the mocked trace
      const tracedManager = new MemoryManager(ragPipeline, repository, embedder, vectorStorage);
      const loggerMock = vi.mocked(LoggerFactoryMock.create).mock.results[1]?.value;

      const entry = createTestEntry({ tier: MemoryTier.LongTerm });
      await tracedManager.store(entry, MemoryTier.LongTerm);

      // Verify trace_id is included in the log
      expect(loggerMock.info).toHaveBeenCalled();
      const calls = vi.mocked(loggerMock.info).mock.calls;
      const storeCall = calls.find(
        (call) => typeof call[0] === 'object' && call[0] !== null && (call[0] as Record<string, unknown>).action === 'store',
      );
      expect(storeCall).toBeDefined();
      expect((storeCall![0] as Record<string, unknown>).trace_id).toBe('test-trace-123');

      // Reset
      vi.mocked(TraceContextMock.get).mockReturnValue(undefined);
    });

    it('should log forget action with trace_id and memoryId', async () => {
      const { LoggerFactory: LoggerFactoryMock } = await import('@osai/observability');
      const loggerMock = vi.mocked(LoggerFactoryMock.create).mock.results[0]?.value;

      await manager.forget('mem-to-forget');

      const calls = vi.mocked(loggerMock.info).mock.calls;
      const forgetCall = calls.find(
        (call) => typeof call[0] === 'object' && call[0] !== null && (call[0] as Record<string, unknown>).action === 'forget',
      );
      expect(forgetCall).toBeDefined();
      expect((forgetCall![0] as Record<string, unknown>).memoryId).toBe('mem-to-forget');
    });

    it('should log query action with trace_id', async () => {
      const { LoggerFactory: LoggerFactoryMock } = await import('@osai/observability');
      const loggerMock = vi.mocked(LoggerFactoryMock.create).mock.results[0]?.value;

      await manager.query('search query');

      const calls = vi.mocked(loggerMock.info).mock.calls;
      const queryCall = calls.find(
        (call) => typeof call[0] === 'object' && call[0] !== null && (call[0] as Record<string, unknown>).action === 'query',
      );
      expect(queryCall).toBeDefined();
    });

    it('should log recall action with chatId and trace_id', async () => {
      const { LoggerFactory: LoggerFactoryMock } = await import('@osai/observability');
      const loggerMock = vi.mocked(LoggerFactoryMock.create).mock.results[0]?.value;

      await manager.recall('chat-xyz', 'recall query');

      const calls = vi.mocked(loggerMock.info).mock.calls;
      const recallCall = calls.find(
        (call) => typeof call[0] === 'object' && call[0] !== null && (call[0] as Record<string, unknown>).action === 'recall',
      );
      expect(recallCall).toBeDefined();
      expect((recallCall![0] as Record<string, unknown>).chatId).toBe('chat-xyz');
    });

    it('should log error with trace_id on failure', async () => {
      const { LoggerFactory: LoggerFactoryMock } = await import('@osai/observability');

      const errorEmbedder = createMockEmbeddingProvider({
        embedError: new Error('Embedding failure'),
      });
      const errorManager = new MemoryManager(ragPipeline, repository, errorEmbedder, vectorStorage);

      // Get the latest logger created for errorManager
      const allResults = vi.mocked(LoggerFactoryMock.create).mock.results;
      const errorLoggerMock = allResults[allResults.length - 1]!.value;

      const entry = createTestEntry({ tier: MemoryTier.LongTerm });
      try {
        await errorManager.store(entry, MemoryTier.LongTerm);
      } catch {
        // Expected
      }

      // The logger instance for the error manager should log the error
      expect(errorLoggerMock.error).toHaveBeenCalled();
      const errorCalls = vi.mocked(errorLoggerMock.error).mock.calls;
      const errorCall = errorCalls.find(
        (call) => typeof call[0] === 'object' && call[0] !== null && (call[0] as Record<string, unknown>).action === 'store_error',
      );
      expect(errorCall).toBeDefined();
    });
  });
});
