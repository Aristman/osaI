import { describe, it, expect } from 'vitest';
import {
  MemoryCategory,
  MemoryTier,
} from '../types/memory.js';
import type { MemoryEntry } from '../types/memory.js';
import {
  EMBEDDING_DEFAULTS,
} from '../types/embeddings.js';
import type { EmbeddingProviderConfig, EmbeddingResult } from '../types/embeddings.js';
import {
  RAG_DEFAULTS,
} from '../types/rag.js';
import type { RAGQuery, RAGResult } from '../types/rag.js';
import {
  PruningPriority,
  CONTEXT_DEFAULTS,
} from '../types/context.js';
import type { ContextWindowConfig, PruningResult, ContextResult, ContextEntry } from '../types/context.js';
import {
  VECTOR_STORAGE_DEFAULTS,
} from '../types/vector-storage.js';
import type { VectorStorageConfig, SearchResult, DistanceMetric } from '../types/vector-storage.js';

// ---------------------------------------------------------------------------
// MemoryCategory enum
// ---------------------------------------------------------------------------
describe('MemoryCategory', () => {
  it('has all expected enum values', () => {
    expect(MemoryCategory.Fact).toBe('fact');
    expect(MemoryCategory.Preference).toBe('preference');
    expect(MemoryCategory.Context).toBe('context');
    expect(MemoryCategory.Skill).toBe('skill');
    expect(MemoryCategory.Event).toBe('event');
    expect(MemoryCategory.General).toBe('general');
  });

  it('has exactly 6 values', () => {
    const values = Object.values(MemoryCategory);
    expect(values).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// MemoryTier enum
// ---------------------------------------------------------------------------
describe('MemoryTier', () => {
  it('has all expected enum values', () => {
    expect(MemoryTier.Chat).toBe('chat');
    expect(MemoryTier.Session).toBe('session');
    expect(MemoryTier.LongTerm).toBe('long-term');
  });

  it('has exactly 3 values', () => {
    const values = Object.values(MemoryTier);
    expect(values).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// MemoryEntry interface
// ---------------------------------------------------------------------------
describe('MemoryEntry', () => {
  it('accepts a valid memory entry with all required fields', () => {
    const entry: MemoryEntry = {
      id: 'mem-001',
      content: 'User prefers dark mode.',
      category: MemoryCategory.Preference,
      tier: MemoryTier.LongTerm,
      chatId: 'chat-001',
      sessionId: 'sess-001',
      tags: ['ui', 'preference'],
      relevanceScore: 0.92,
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-30T10:00:00.000Z',
      summary: 'Dark mode preference',
      embedding: [0.1, 0.2, 0.3],
    };

    expect(entry.id).toBe('mem-001');
    expect(entry.content).toBe('User prefers dark mode.');
    expect(entry.category).toBe(MemoryCategory.Preference);
    expect(entry.tier).toBe(MemoryTier.LongTerm);
    expect(entry.chatId).toBe('chat-001');
    expect(entry.sessionId).toBe('sess-001');
    expect(entry.tags).toEqual(['ui', 'preference']);
    expect(entry.relevanceScore).toBe(0.92);
    expect(entry.summary).toBe('Dark mode preference');
    expect(entry.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it('accepts a minimal memory entry with only required fields', () => {
    const entry: MemoryEntry = {
      id: 'mem-002',
      content: 'Fact about the project.',
      category: MemoryCategory.Fact,
      tier: MemoryTier.Chat,
      tags: [],
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-30T10:00:00.000Z',
    };

    expect(entry.id).toBe('mem-002');
    expect(entry.chatId).toBeUndefined();
    expect(entry.sessionId).toBeUndefined();
    expect(entry.relevanceScore).toBeUndefined();
    expect(entry.summary).toBeUndefined();
    expect(entry.embedding).toBeUndefined();
    expect(entry.tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// EmbeddingProviderConfig
// ---------------------------------------------------------------------------
describe('EmbeddingProviderConfig', () => {
  it('accepts a valid config with all fields', () => {
    const config: EmbeddingProviderConfig = {
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      model: 'nomic-embed-text',
      dimensions: 768,
      timeoutMs: 30_000,
    };

    expect(config.provider).toBe('ollama');
    expect(config.dimensions).toBe(768);
  });

  it('accepts a config without optional endpoint', () => {
    const config: EmbeddingProviderConfig = {
      provider: 'onnx',
      model: 'all-MiniLM-L6-v2',
      dimensions: 384,
      timeoutMs: 10_000,
    };

    expect(config.endpoint).toBeUndefined();
    expect(config.provider).toBe('onnx');
  });
});

// ---------------------------------------------------------------------------
// EmbeddingResult
// ---------------------------------------------------------------------------
describe('EmbeddingResult', () => {
  it('accepts a valid embedding result', () => {
    const result: EmbeddingResult = {
      vector: new Array(768).fill(0.1),
      dimensions: 768,
      provider: 'ollama',
      durationMs: 150,
    };

    expect(result.vector).toHaveLength(768);
    expect(result.dimensions).toBe(768);
    expect(result.provider).toBe('ollama');
  });
});

// ---------------------------------------------------------------------------
// EMBEDDING_DEFAULTS
// ---------------------------------------------------------------------------
describe('EMBEDDING_DEFAULTS', () => {
  it('has correct default values', () => {
    expect(EMBEDDING_DEFAULTS.ollamaEndpoint).toBe('http://127.0.0.1:11434');
    expect(EMBEDDING_DEFAULTS.ollamaModel).toBe('nomic-embed-text');
    expect(EMBEDDING_DEFAULTS.ollamaDimensions).toBe(768);
    expect(EMBEDDING_DEFAULTS.timeoutMs).toBe(30_000);
  });

  it('has readonly keys matching const assertion', () => {
    // as const makes properties readonly at compile time;
    // at runtime the object is deeply readonly in shape.
    expect(EMBEDDING_DEFAULTS).toHaveProperty('ollamaEndpoint');
    expect(EMBEDDING_DEFAULTS).toHaveProperty('ollamaModel');
    expect(EMBEDDING_DEFAULTS).toHaveProperty('ollamaDimensions');
    expect(EMBEDDING_DEFAULTS).toHaveProperty('timeoutMs');
  });
});

// ---------------------------------------------------------------------------
// RAGQuery
// ---------------------------------------------------------------------------
describe('RAGQuery', () => {
  it('accepts a minimal query with only text', () => {
    const query: RAGQuery = { text: 'What are user preferences?' };
    expect(query.text).toBe('What are user preferences?');
    expect(query.topK).toBeUndefined();
    expect(query.minSimilarity).toBeUndefined();
  });

  it('accepts a full query with all optional fields', () => {
    const query: RAGQuery = {
      text: 'Find relevant memories',
      chatId: 'chat-001',
      sessionId: 'sess-001',
      topK: 10,
      minSimilarity: 0.8,
      categories: ['fact', 'preference'],
      tags: ['ui'],
    };

    expect(query.topK).toBe(10);
    expect(query.minSimilarity).toBe(0.8);
    expect(query.categories).toEqual(['fact', 'preference']);
  });
});

// ---------------------------------------------------------------------------
// RAGResult
// ---------------------------------------------------------------------------
describe('RAGResult', () => {
  it('accepts a valid RAG result', () => {
    const entry: MemoryEntry = {
      id: 'mem-001',
      content: 'User prefers dark mode.',
      category: MemoryCategory.Preference,
      tier: MemoryTier.LongTerm,
      tags: ['ui'],
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-30T10:00:00.000Z',
    };

    const result: RAGResult = {
      entry,
      similarity: 0.95,
      rank: 0,
    };

    expect(result.similarity).toBe(0.95);
    expect(result.rank).toBe(0);
    expect(result.entry.id).toBe('mem-001');
  });
});

// ---------------------------------------------------------------------------
// RAG_DEFAULTS
// ---------------------------------------------------------------------------
describe('RAG_DEFAULTS', () => {
  it('has correct default values', () => {
    expect(RAG_DEFAULTS.defaultTopK).toBe(5);
    expect(RAG_DEFAULTS.defaultMinSimilarity).toBe(0.7);
    expect(RAG_DEFAULTS.includeChatMemory).toBe(true);
    expect(RAG_DEFAULTS.includeSessionMemory).toBe(true);
    expect(RAG_DEFAULTS.includeLongTermMemory).toBe(true);
  });

  it('has readonly keys matching const assertion', () => {
    expect(RAG_DEFAULTS).toHaveProperty('defaultTopK');
    expect(RAG_DEFAULTS).toHaveProperty('defaultMinSimilarity');
    expect(RAG_DEFAULTS).toHaveProperty('includeChatMemory');
    expect(RAG_DEFAULTS).toHaveProperty('includeSessionMemory');
    expect(RAG_DEFAULTS).toHaveProperty('includeLongTermMemory');
  });
});

// ---------------------------------------------------------------------------
// PruningPriority enum
// ---------------------------------------------------------------------------
describe('PruningPriority', () => {
  it('has correct priority values (lower = pruned first)', () => {
    expect(PruningPriority.LongTermRAG).toBe(1);
    expect(PruningPriority.KnowledgeBase).toBe(2);
    expect(PruningPriority.ToolCalls).toBe(3);
    expect(PruningPriority.EarlyHistory).toBe(4);
    expect(PruningPriority.SystemPrompt).toBe(5);
  });

  it('has exactly 5 named values', () => {
    // Numeric enums produce both name->value and value->name entries.
    // Filter to only string keys to count the actual enum members.
    const namedValues = Object.values(PruningPriority).filter(
      (v) => typeof v === 'number',
    );
    expect(namedValues).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// ContextWindowConfig
// ---------------------------------------------------------------------------
describe('ContextWindowConfig', () => {
  it('accepts a valid config with all fields', () => {
    const config: ContextWindowConfig = {
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
    };

    expect(config.maxTokens).toBe(128_000);
    expect(config.summarizationThreshold).toBe(0.8);
    expect(config.pruningOrder).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// PruningResult
// ---------------------------------------------------------------------------
describe('PruningResult', () => {
  it('accepts a valid pruning result', () => {
    const result: PruningResult = {
      wasPruned: true,
      tokensBefore: 140_000,
      tokensAfter: 120_000,
      tokensRemoved: 20_000,
      prunedLevels: [PruningPriority.LongTermRAG, PruningPriority.KnowledgeBase],
      description: 'Removed long-term RAG results and KB chunks',
    };

    expect(result.wasPruned).toBe(true);
    expect(result.tokensRemoved).toBe(20_000);
    expect(result.prunedLevels).toEqual([1, 2]);
  });

  it('accepts a no-op pruning result', () => {
    const result: PruningResult = {
      wasPruned: false,
      tokensBefore: 50_000,
      tokensAfter: 50_000,
      tokensRemoved: 0,
      prunedLevels: [],
      description: 'No pruning needed',
    };

    expect(result.wasPruned).toBe(false);
    expect(result.prunedLevels).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ContextResult
// ---------------------------------------------------------------------------
describe('ContextResult', () => {
  it('accepts a valid context result', () => {
    const entry: ContextEntry = {
      role: 'system',
      content: 'You are a helpful assistant.',
      priority: PruningPriority.SystemPrompt,
      tokenCount: 10,
    };

    const result: ContextResult = {
      context: [entry],
      totalTokens: 10,
      summarizationTriggered: false,
    };

    expect(result.context).toHaveLength(1);
    expect(result.totalTokens).toBe(10);
    expect(result.summarizationTriggered).toBe(false);
    expect(result.pruningResult).toBeUndefined();
  });

  it('accepts a context result with pruning and summarization', () => {
    const pruningResult: PruningResult = {
      wasPruned: true,
      tokensBefore: 140_000,
      tokensAfter: 120_000,
      tokensRemoved: 20_000,
      prunedLevels: [PruningPriority.LongTermRAG],
      description: 'Removed long-term RAG results',
    };

    const result: ContextResult = {
      context: [],
      totalTokens: 120_000,
      pruningResult,
      summarizationTriggered: true,
    };

    expect(result.pruningResult?.wasPruned).toBe(true);
    expect(result.summarizationTriggered).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ContextEntry
// ---------------------------------------------------------------------------
describe('ContextEntry', () => {
  it('accepts a valid context entry', () => {
    const entry: ContextEntry = {
      role: 'user',
      content: 'Hello, how are you?',
      priority: PruningPriority.EarlyHistory,
      tokenCount: 7,
    };

    expect(entry.role).toBe('user');
    expect(entry.priority).toBe(PruningPriority.EarlyHistory);
    expect(entry.tokenCount).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// CONTEXT_DEFAULTS
// ---------------------------------------------------------------------------
describe('CONTEXT_DEFAULTS', () => {
  it('has correct default values', () => {
    expect(CONTEXT_DEFAULTS.maxTokens).toBe(128_000);
    expect(CONTEXT_DEFAULTS.reservedForResponse).toBe(4_096);
    expect(CONTEXT_DEFAULTS.summarizationThreshold).toBe(0.8);
    expect(CONTEXT_DEFAULTS.minMessages).toBe(4);
    expect(CONTEXT_DEFAULTS.pruningOrder).toHaveLength(5);
    expect(CONTEXT_DEFAULTS.pruningOrder[0]).toBe(PruningPriority.LongTermRAG);
    expect(CONTEXT_DEFAULTS.pruningOrder[4]).toBe(PruningPriority.SystemPrompt);
  });

  it('has readonly keys matching const assertion', () => {
    expect(CONTEXT_DEFAULTS).toHaveProperty('maxTokens');
    expect(CONTEXT_DEFAULTS).toHaveProperty('reservedForResponse');
    expect(CONTEXT_DEFAULTS).toHaveProperty('summarizationThreshold');
    expect(CONTEXT_DEFAULTS).toHaveProperty('minMessages');
    expect(CONTEXT_DEFAULTS).toHaveProperty('pruningOrder');
  });
});

// ---------------------------------------------------------------------------
// VectorStorageConfig
// ---------------------------------------------------------------------------
describe('VectorStorageConfig', () => {
  it('accepts a valid config with all fields', () => {
    const config: VectorStorageConfig = {
      dbPath: '~/.osai/data/osai.db',
      tableName: 'memory_vectors',
      dimensions: 768,
      distanceMetric: 'cosine',
    };

    expect(config.dimensions).toBe(768);
    expect(config.distanceMetric).toBe('cosine');
  });

  it('accepts l2 and dot distance metrics', () => {
    const l2Config: VectorStorageConfig = {
      dbPath: ':memory:',
      tableName: 'vectors',
      dimensions: 256,
      distanceMetric: 'l2',
    };

    const dotConfig: VectorStorageConfig = {
      dbPath: ':memory:',
      tableName: 'vectors',
      dimensions: 256,
      distanceMetric: 'dot',
    };

    expect(l2Config.distanceMetric).toBe('l2');
    expect(dotConfig.distanceMetric).toBe('dot');
  });
});

// ---------------------------------------------------------------------------
// SearchResult
// ---------------------------------------------------------------------------
describe('SearchResult', () => {
  it('accepts a valid search result', () => {
    const result: SearchResult = {
      id: 'vec-001',
      score: 0.93,
      metadata: {
        chatId: 'chat-001',
        category: 'fact',
        tier: 'long-term',
      },
    };

    expect(result.id).toBe('vec-001');
    expect(result.score).toBe(0.93);
    expect(result.metadata['category']).toBe('fact');
  });

  it('accepts a search result with numeric metadata values', () => {
    const result: SearchResult = {
      id: 'vec-002',
      score: 0.85,
      metadata: {
        createdAt: 1743321600000,
        tokenCount: 42,
        isActive: true,
      },
    };

    expect(typeof result.metadata['createdAt']).toBe('number');
    expect(result.metadata['isActive']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// VECTOR_STORAGE_DEFAULTS
// ---------------------------------------------------------------------------
describe('VECTOR_STORAGE_DEFAULTS', () => {
  it('has correct default values', () => {
    expect(VECTOR_STORAGE_DEFAULTS.dbPath).toBe(':memory:');
    expect(VECTOR_STORAGE_DEFAULTS.tableName).toBe('memory_vectors');
    expect(VECTOR_STORAGE_DEFAULTS.dimensions).toBe(768);
    expect(VECTOR_STORAGE_DEFAULTS.distanceMetric).toBe('cosine');
  });

  it('has readonly keys matching const assertion', () => {
    expect(VECTOR_STORAGE_DEFAULTS).toHaveProperty('dbPath');
    expect(VECTOR_STORAGE_DEFAULTS).toHaveProperty('tableName');
    expect(VECTOR_STORAGE_DEFAULTS).toHaveProperty('dimensions');
    expect(VECTOR_STORAGE_DEFAULTS).toHaveProperty('distanceMetric');
  });
});

// ---------------------------------------------------------------------------
// DistanceMetric type
// ---------------------------------------------------------------------------
describe('DistanceMetric', () => {
  it('allows all three valid values', () => {
    const cosine: DistanceMetric = 'cosine';
    const l2: DistanceMetric = 'l2';
    const dot: DistanceMetric = 'dot';

    expect(cosine).toBe('cosine');
    expect(l2).toBe('l2');
    expect(dot).toBe('dot');
  });
});

// ---------------------------------------------------------------------------
// Barrel export (index.ts re-exports)
// ---------------------------------------------------------------------------
describe('barrel exports from src/types/index.ts', () => {
  it('re-exports all types and enums', async () => {
    const typesModule = await import('../types/index.js');

    // Enums
    expect(typesModule.MemoryCategory).toBe(MemoryCategory);
    expect(typesModule.MemoryTier).toBe(MemoryTier);
    expect(typesModule.PruningPriority).toBe(PruningPriority);

    // Default configs
    expect(typesModule.EMBEDDING_DEFAULTS).toBe(EMBEDDING_DEFAULTS);
    expect(typesModule.RAG_DEFAULTS).toBe(RAG_DEFAULTS);
    expect(typesModule.CONTEXT_DEFAULTS).toBe(CONTEXT_DEFAULTS);
    expect(typesModule.VECTOR_STORAGE_DEFAULTS).toBe(VECTOR_STORAGE_DEFAULTS);
  });
});

// ---------------------------------------------------------------------------
// Barrel export from src/index.ts
// ---------------------------------------------------------------------------
describe('barrel exports from src/index.ts', () => {
  it('re-exports all types and enums from the main entry point', async () => {
    const mainModule = await import('../index.js');

    // Enums
    expect(mainModule.MemoryCategory).toBe(MemoryCategory);
    expect(mainModule.MemoryTier).toBe(MemoryTier);
    expect(mainModule.PruningPriority).toBe(PruningPriority);

    // Default configs
    expect(mainModule.EMBEDDING_DEFAULTS).toBe(EMBEDDING_DEFAULTS);
    expect(mainModule.RAG_DEFAULTS).toBe(RAG_DEFAULTS);
    expect(mainModule.CONTEXT_DEFAULTS).toBe(CONTEXT_DEFAULTS);
    expect(mainModule.VECTOR_STORAGE_DEFAULTS).toBe(VECTOR_STORAGE_DEFAULTS);
  });
});
