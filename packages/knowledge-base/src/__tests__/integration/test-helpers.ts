/**
 * Integration test helpers for Knowledge Base (T-007).
 *
 * Creates real objects (not mocks) for InMemoryVectorStorage, KnowledgeRepository,
 * ParserRegistry, and the full pipeline. Only EmbeddingProvider is mocked with
 * deterministic vectors based on character n-gram hashing.
 */

import Database from 'better-sqlite3';
import { InMemoryVectorStorage } from '@osai/memory';
import type { EmbeddingProvider, EmbeddingResult, VectorStorage } from '@osai/memory';
import { KnowledgeRepository } from '../../db/repository.js';
import { ParserRegistry } from '../../parsers/parser-registry.js';
import { IngestPipeline } from '../../ingest/ingest-pipeline.js';
import { KBSearch } from '../../search/kb-search.js';
import { SourceManager } from '../../sources/source-manager.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Dimensions for mock embedding vectors. */
const MOCK_DIMENSIONS = 768;

/** Number of hash buckets for character n-gram hashing. */
const HASH_BUCKETS = MOCK_DIMENSIONS;

// ---------------------------------------------------------------------------
// Character n-gram hashing (SimHash-like)
// ---------------------------------------------------------------------------

/**
 * Simple deterministic hash for a character n-gram.
 * Uses DJB2-like hash algorithm.
 */
function charNgramHash(ngram: string): number {
  let hash = 5381;
  for (let i = 0; i < ngram.length; i++) {
    hash = ((hash << 5) + hash + ngram.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

/**
 * Generate a deterministic embedding vector from text using character n-gram hashing.
 *
 * Strategy (SimHash-inspired):
 * 1. Slide a 3-character window over the text
 * 2. For each n-gram, hash it to a bucket in [0, HASH_BUCKETS)
 * 3. Increment that bucket's value
 * 4. Normalize the resulting vector to unit length
 *
 * This ensures:
 * - Identical text -> identical vector (deterministic)
 * - Texts sharing common n-grams -> high cosine similarity
 * - Unrelated texts -> lower cosine similarity
 */
function textToEmbedding(text: string): EmbeddingResult {
  // Initialize vector with zeros
  const vector = new Float64Array(MOCK_DIMENSIONS);

  // Slide 3-char window over the text
  const ngramSize = 3;
  for (let i = 0; i <= text.length - ngramSize; i++) {
    const ngram = text.slice(i, i + ngramSize);
    const bucket = charNgramHash(ngram) % HASH_BUCKETS;
    const current = vector[bucket];
    vector[bucket] = (current ?? 0) + 1;
  }

  // Convert to regular array
  const result: number[] = Array.from(vector);

  // Normalize to unit vector
  const norm = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < result.length; i++) {
      result[i] = result[i]! / norm;
    }
  }

  return {
    vector: result,
    dimensions: MOCK_DIMENSIONS,
    provider: 'ollama' as const,
    durationMs: 1,
  };
}

// ---------------------------------------------------------------------------
// Mock EmbeddingProvider with deterministic vectors
// ---------------------------------------------------------------------------

/**
 * Create a mock EmbeddingProvider that returns deterministic vectors
 * based on character n-gram hashing.
 *
 * Properties:
 * - Same text always produces same vector (deterministic)
 * - Similar texts (sharing words/n-grams) produce similar vectors (high cosine similarity)
 * - Different texts produce different vectors (low cosine similarity)
 * - All vectors have exactly MOCK_DIMENSIONS dimensions
 */
export function createDeterministicEmbeddingProvider(): EmbeddingProvider {
  return {
    name: 'deterministic-test-provider',

    embed: (async (textOrTexts: string | string[]): Promise<EmbeddingResult | EmbeddingResult[]> => {
      const inputs = Array.isArray(textOrTexts) ? textOrTexts : [textOrTexts];
      const results = inputs.map(input => textToEmbedding(input));
      return Array.isArray(textOrTexts) ? results : results[0]!;
    }) as EmbeddingProvider['embed'],

    isAvailable: async () => true,

    getDimensions: () => MOCK_DIMENSIONS,
  };
}

// ---------------------------------------------------------------------------
// Test environment factory
// ---------------------------------------------------------------------------

/** Complete test environment with real objects (except EmbeddingProvider). */
export interface TestEnvironment {
  db: Database.Database;
  repository: KnowledgeRepository;
  parserRegistry: ParserRegistry;
  embeddingProvider: EmbeddingProvider;
  vectorStorage: VectorStorage;
  ingestPipeline: IngestPipeline;
  kbSearch: KBSearch;
  sourceManager: SourceManager;
}

/**
 * Create a complete test environment with real objects.
 *
 * - InMemoryVectorStorage from @osai/memory (real cosine similarity)
 * - In-memory SQLite via better-sqlite3 (real DB operations)
 * - Real ParserRegistry (with TxtParser + MdParser)
 * - Real KnowledgeRepository (real SQLite queries)
 * - Real IngestPipeline, KBSearch, SourceManager
 * - Only EmbeddingProvider is mocked (deterministic vectors)
 */
export function createTestEnvironment(): TestEnvironment {
  // Real in-memory SQLite database
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Real repository with schema initialization
  const repository = new KnowledgeRepository(db);
  repository.initSchema();

  // Real parser registry (txt + md parsers)
  const parserRegistry = new ParserRegistry();

  // Mock embedding provider (deterministic)
  const embeddingProvider = createDeterministicEmbeddingProvider();

  // Real in-memory vector storage from @osai/memory
  const vectorStorage = new InMemoryVectorStorage(MOCK_DIMENSIONS);
  vectorStorage.init();

  // Real ingest pipeline
  const ingestPipeline = new IngestPipeline(
    repository,
    parserRegistry,
    embeddingProvider,
    vectorStorage,
    db,
  );

  // Real KB search
  const kbSearch = new KBSearch(embeddingProvider, vectorStorage, repository);

  // Real source manager
  const sourceManager = new SourceManager(
    ingestPipeline,
    repository,
    vectorStorage,
  );

  return {
    db,
    repository,
    parserRegistry,
    embeddingProvider,
    vectorStorage,
    ingestPipeline,
    kbSearch,
    sourceManager,
  };
}

/**
 * Generate a text long enough to produce the specified number of chunks.
 *
 * Uses the chunker's default settings (1024 tokens, 128 overlap).
 * Roughly 4 chars per token, so each chunk is ~4000 chars.
 *
 * @param targetChunks - Minimum number of chunks to generate
 * @returns A text string that will produce at least targetChunks chunks
 */
export function generateLongText(targetChunks: number): string {
  // Each chunk needs ~4000 chars of ASCII text (4 chars/token * 1024 tokens)
  const charsPerChunk = 5000; // generous margin
  const totalChars = targetChunks * charsPerChunk;

  // Generate meaningful text about a fictional knowledge base system
  const sentences = [
    'The knowledge base system provides semantic search across ingested documents.',
    'Documents are parsed into chunks and embedded using a vector embedding model.',
    'Each chunk is stored with its embedding in a vector storage backend.',
    'Search queries are embedded and compared against stored vectors.',
    'Cosine similarity is used to rank results by relevance.',
    'The system supports multiple document formats including plain text and markdown.',
    'Source attribution ensures every result can be traced back to its origin document.',
    'The ingest pipeline handles parsing, chunking, embedding, and storage atomically.',
    'Error handling includes rollback mechanisms for partial failures.',
    'Tags can be assigned to documents for categorical filtering.',
    'The knowledge base integrates with the memory system for context window management.',
    'Vector storage uses brute-force cosine similarity for small datasets.',
    'The embedding provider generates fixed-dimensional vectors for each text chunk.',
    'Document parsing follows a strategy pattern for extensibility.',
    'Chunking respects token boundaries to preserve semantic coherence.',
  ];

  let text = '';
  let sentenceIndex = 0;

  while (text.length < totalChars) {
    text += sentences[sentenceIndex % sentences.length] + ' ';
    sentenceIndex++;

    // Add section markers for realism
    if (sentenceIndex % 20 === 0) {
      text += '\n\n';
    }
  }

  return text.trim();
}

/**
 * Generate text that is semantically related to a topic.
 * Used to test search relevance.
 *
 * @param topic - The topic to generate text about.
 * @param length - Target character length of the generated text.
 */
export function generateTopicText(topic: string, length: number): string {
  const text: string[] = [];

  while (text.join(' ').length < length) {
    text.push(
      `${topic} involves various design patterns and best practices. ` +
      `Understanding ${topic} requires knowledge of system architecture. ` +
      `The implementation of ${topic} follows established conventions. ` +
      `${topic} provides essential capabilities for modern software systems. ` +
      `Developers working with ${topic} should understand the core principles. `
    );
  }

  return text.join('\n');
}
