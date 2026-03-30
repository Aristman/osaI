/**
 * Integration test helpers for Knowledge Base (T-007).
 *
 * Creates real objects (not mocks) for InMemoryVectorStorage, KnowledgeRepository,
 * ParserRegistry, and the full pipeline. Only EmbeddingProvider is mocked with
 * deterministic vectors based on character n-gram hashing.
 */
import Database from 'better-sqlite3';
import type { EmbeddingProvider, VectorStorage } from '@osai/memory';
import { KnowledgeRepository } from '../../db/repository.js';
import { ParserRegistry } from '../../parsers/parser-registry.js';
import { IngestPipeline } from '../../ingest/ingest-pipeline.js';
import { KBSearch } from '../../search/kb-search.js';
import { SourceManager } from '../../sources/source-manager.js';
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
export declare function createDeterministicEmbeddingProvider(): EmbeddingProvider;
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
export declare function createTestEnvironment(): TestEnvironment;
/**
 * Generate a text long enough to produce the specified number of chunks.
 *
 * Uses the chunker's default settings (1024 tokens, 128 overlap).
 * Roughly 4 chars per token, so each chunk is ~4000 chars.
 *
 * @param targetChunks - Minimum number of chunks to generate
 * @returns A text string that will produce at least targetChunks chunks
 */
export declare function generateLongText(targetChunks: number): string;
/**
 * Generate text that is semantically related to a topic.
 * Used to test search relevance.
 *
 * @param topic - The topic to generate text about.
 * @param length - Target character length of the generated text.
 */
export declare function generateTopicText(topic: string, length: number): string;
//# sourceMappingURL=test-helpers.d.ts.map