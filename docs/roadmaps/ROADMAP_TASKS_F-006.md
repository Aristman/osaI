# Task Roadmap: Memory System — Short-term + Long-term + RAG

**Version:** v1.0
**Generated:** 2026-03-24
**Feature ID:** F-006
**Git branch:** feature/memory-system

---

## 1. Feature Overview

- **Feature ID:** F-006
- **Feature Name:** Memory System — Short-term + Long-term + RAG
- **Feature Description:** Двухуровневая система памяти. Short-term: session messages + tool results в SQLite (WAL mode). Long-term: SQLite (metadata) + Qdrant (vectors) для facts, preferences, knowledge, errors, patterns. RAG pipeline: query -> embed -> Qdrant search -> inject into prompt. Embedding provider с fallback chain: OpenAI -> Ollama -> ONNX. Fact extraction из ответов агента. Knowledge base ingestion: document -> chunking -> embedding -> store.
- **Domain:** memory
- **Related Requirements:** FR-029-FR-037, NFR-001, NFR-003, NFR-005
- **Dependencies:** F-004 (Agent Runtime)
- **Priority:** Should Have (V1)

### Related Requirements Summary

| Req ID | Description |
|--------|-------------|
| FR-029 | Short-term memory (session messages в SQLite) |
| FR-030 | Long-term memory (SQLite + Qdrant vectors) |
| FR-031 | Memory categories: FACT, PREFERENCE, KNOWLEDGE, ERROR, PATTERN |
| FR-032 | RAG pipeline (query -> embed -> search -> inject) |
| FR-033 | Embedding provider fallback chain |
| FR-034 | Fact extraction из agent responses |
| FR-035 | Knowledge base ingestion |
| FR-036 | Memory CRUD API (remember, recall, forget) |
| FR-037 | Session summarization |
| NFR-001 | RAG query latency < 200ms |
| NFR-003 | CPU-bound tasks в worker threads |
| NFR-005 | Cold start embedding < 5s |

---

## 2. Dependencies

### 2.1 Feature Dependencies

- **F-004: Agent Runtime** (blocking)
  - Требуется для hook интеграции (`before_memory_query`, `after_memory_extract`)
  - Требуется для получения agent responses для fact extraction
  - Требуется для context assembly интеграции

### 2.2 Task Dependencies

```
T-001 (SQLite Schema)
    └── T-002 (Qdrant Integration)
           ├── T-003 (Embedding Provider)
           │      └── T-004 (RAG Pipeline)
           │             ├── T-005 (Fact Extraction)
           │             └── T-006 (Knowledge Base Ingestion)
           └── T-004 (RAG Pipeline)
T-001 (SQLite Schema)
    └── T-005 (Fact Extraction) [через metadata storage]

Independent: T-007 (Integration Tests) — зависит от T-001..T-006
```

### 2.3 Development Order

**Phase 1 (Sequential):**
1. T-001 SQLite Schema — база для всех остальных задач

**Phase 2 (Parallel up to 2):**
2. T-002 Qdrant Integration
3. T-003 Embedding Provider (может начинаться параллельно)

**Phase 3 (Sequential after Phase 2):**
4. T-004 RAG Pipeline (требует T-002 + T-003)

**Phase 4 (Parallel after Phase 3):**
5. T-005 Fact Extraction
6. T-006 Knowledge Base Ingestion

**Phase 5 (Final):**
7. T-007 Integration Tests

---

## 3. Task Breakdown

---

### Task T-001: SQLite Schema — Memory Tables

**Description:**
Создание схемы базы данных SQLite для short-term и long-term памяти: таблицы sessions, messages, memory_entries, knowledge_base_metadata. Настройка WAL mode для производительности.

**Estimated Time:** 2-3 hours

**Dependencies:** None

**Scope:**
- **In scope:**
  - Создание таблиц: `sessions`, `messages`, `memory_entries`, `knowledge_sources`, `knowledge_chunks`
  - Индексы для оптимизации запросов
  - Включение WAL mode
  - Миграции (schema versioning)
  - Базовый DatabaseManager класс

- **Out scope:**
  - Qdrant schema (T-002)
  - Embedding generation (T-003)
  - RAG pipeline (T-004)
  - CRUD операции (высокоуровневые методы)

---

### Task T-002: Qdrant Integration — Vector Database Client

**Description:**
Интеграция с Qdrant через REST client: создание коллекций, управление точками (upsert, delete, search), health check, auto-start Docker контейнера.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001 (для метаданных о knowledge sources)

**Scope:**
- **In scope:**
  - QdrantClient класс с REST API методами
  - Collection management (create, delete, exists check)
  - Point operations (upsert, delete, batch upsert)
  - Vector search (similarity search с filters)
  - Docker container auto-start (через dockerode или child_process)
  - Health check и reconnect логика

- **Out scope:**
  - Embedding generation (T-003)
  - RAG pipeline (T-004)
  - Конкретные операции memory (remember/recall)

---

### Task T-003: Embedding Provider — Fallback Chain

**Description:**
Реализация embedding provider с fallback chain: OpenAI -> Ollama -> ONNX (Xenova/Transformers.js). Worker threads для CPU-bound операций. Cold start optimization.

**Estimated Time:** 3-4 hours

**Dependencies:** None (но используется с T-002 для векторизации)

**Scope:**
- **In scope:**
  - EmbeddingProvider интерфейс
  - OpenAI embedder (text-embedding-3-small)
  - Ollama embedder (nomic-embed-text или all-minilm)
  - ONNX embedder (@xenova/transformers, all-MiniLM-L6-v2)
  - Fallback chain логика с error handling
  - Worker thread pool для ONNX (CPU-bound)
  - Cold start caching (< 5s requirement)
  - Batch embedding support

- **Out scope:**
  - Интеграция с RAG pipeline (T-004)
  - Qdrant operations (T-002)

---

### Task T-004: RAG Pipeline — Query, Embed, Search, Inject

**Description:**
Реализация RAG pipeline: query embedding -> Qdrant search -> format context -> inject into prompt. Latency optimization (< 200ms). Context formatting для LLM.

**Estimated Time:** 3-4 hours

**Dependencies:** T-002 (Qdrant), T-003 (Embeddings)

**Scope:**
- **In scope:**
  - RagPipeline класс
  - Query preprocessing
  - Embedding generation для query
  - Qdrant similarity search
  - Result ranking и filtering (similarity threshold)
  - Context formatting для prompt injection
  - Latency tracking (NFR-001: < 200ms)
  - Integration с Agent Runtime hooks (before_prompt_build)

- **Out scope:**
  - Fact extraction (T-005)
  - Knowledge base ingestion (T-006)
  - LLM inference

---

### Task T-005: Fact Extraction — Automatic Memory Creation

**Description:**
Автоматическое извлечение фактов из agent responses и tool results. Pattern matching + LLM-based extraction. Hook интеграция (after_tool_call, agent_end).

**Estimated Time:** 2-3 hours

**Dependencies:** T-001 (SQLite), T-003 (Embeddings), T-004 (RAG для storage)

**Scope:**
- **In scope:**
  - FactExtractor класс
  - Pattern-based fact detection (regex patterns)
  - LLM-based fact extraction (prompt для Claude/GPT)
  - Category classification (FACT, PREFERENCE, KNOWLEDGE, ERROR, PATTERN)
  - Deduplication (проверка существующих фактов)
  - Hook registration (after_tool_call, agent_end)
  - Configurable extraction rules

- **Out scope:**
  - Knowledge base ingestion (T-006)
  - Session summarization (отдельная задача если > 4 часов)

---

### Task T-006: Knowledge Base Ingestion — Document Processing

**Description:**
Ingestion pipeline для knowledge base: document read -> chunking -> embed -> store. Поддержка txt, md, json форматов. Chunking strategies (fixed, semantic).

**Estimated Time:** 3-4 hours

**Dependencies:** T-002 (Qdrant), T-003 (Embeddings), T-004 (RAG)

**Scope:**
- **In scope:**
  - KnowledgeBaseIngestor класс
  - Document readers (txt, md, json, html)
  - Chunking strategies:
    - Fixed-size chunking (512 tokens с overlap)
    - Sentence-based chunking
  - Metadata extraction (title, source, timestamps)
  - Batch embedding для chunks
  - Qdrant point creation с metadata
  - SQLite metadata storage (knowledge_sources, knowledge_chunks)
  - Incremental ingestion (проверка изменений)

- **Out scope:**
  - PDF parsing (V2)
  - Advanced semantic chunking (V2)
  - Re-ranking (V2)

---

### Task T-007: Integration Tests — Memory System E2E

**Description:**
Комплексные integration тесты для всей memory system: CRUD operations, RAG accuracy, embedding fallback, fact extraction quality, knowledge base ingestion.

**Estimated Time:** 3-4 hours

**Dependencies:** T-001, T-002, T-003, T-004, T-005, T-006

**Scope:**
- **In scope:**
  - Memory CRUD tests (remember, recall, forget)
  - RAG pipeline tests (query accuracy, latency)
  - Embedding fallback chain tests
  - Fact extraction tests
  - Knowledge base ingestion tests
  - Qdrant integration tests
  - Hook integration tests
  - Performance benchmarks

- **Out scope:**
  - Unit tests (реализуются в рамках каждой задачи)
  - E2E тесты с реальным LLM (отдельная задача)

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit Tests | Integration Tests | Build & Run |
|------|------------|-------------------|-------------|
| T-001 SQLite Schema | Да (schema validation, migrations) | Да (CRUD basics) | Обязательно |
| T-002 Qdrant Integration | Да (client methods) | Да (с Qdrant container) | Обязательно |
| T-003 Embedding Provider | Да (fallback logic) | Да (real API calls - mocked) | Обязательно |
| T-004 RAG Pipeline | Да (pipeline steps) | Да (end-to-end RAG) | Обязательно |
| T-005 Fact Extraction | Да (patterns, classification) | Да (с mock LLM) | Обязательно |
| T-006 Knowledge Base Ingestion | Да (chunking, metadata) | Да (full ingestion) | Обязательно |
| T-007 Integration Tests | — | Да (все scenarios) | Обязательно |

### 4.2 Build and Run Verification

#### Build Verification

**Command:**
```bash
cd /home/aristman/projects/osai
pnpm --filter @osai/memory build
```

**Expected Result:**
- Build completes without errors
- Output: `dist/index.js`, `dist/index.d.ts`
- TypeScript compilation successful

**Success Criteria:**
- Exit code 0
- No TypeScript errors
- No missing dependencies

#### Run Verification

**Command:**
```bash
cd /home/aristman/projects/osai
pnpm --filter @osai/memory test --run
```

**Expected Result:**
- All unit tests pass
- Test coverage >= 70% for new code

**Success Criteria:**
- Exit code 0
- All tests pass
- Coverage threshold met

#### Docker Verification (Qdrant)

**Command:**
```bash
docker ps | grep qdrant || echo "Qdrant not running"
```

**Expected Result:**
- Qdrant container running on port 6333
- Health check returns 200

### 4.3 Test Cases per Task

---

#### Task T-001: SQLite Schema — Test Cases

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T001-UT-01 | Database initialization creates all tables | Fresh SQLite file | Tables: sessions, messages, memory_entries, knowledge_sources, knowledge_chunks exist | Tables created, schema valid |
| T001-UT-02 | WAL mode enabled | Database initialized | PRAGMA journal_mode returns 'wal' | WAL mode active |
| T001-UT-03 | Schema migration applies correctly | Existing DB with old schema | Migration runs, new columns/tables added | No data loss, schema updated |
| T001-UT-04 | Indexes created for performance | Database initialized | Indexes on session_id, created_at, category exist | Query plan uses indexes |
| T001-IT-01 | CRUD operations on sessions table | Database initialized | Insert/Update/Select/Delete works | All operations successful |
| T001-IT-02 | CRUD operations on memory_entries | Database initialized | Insert with all fields works | Record created, readable |

---

#### Task T-002: Qdrant Integration — Test Cases

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T002-UT-01 | QdrantClient creates collection | Mock HTTP client | POST /collections/{name} called | Collection created |
| T002-UT-02 | QdrantClient upserts points | Mock HTTP client | PUT /collections/{name}/points called with vectors | Points stored |
| T002-UT-03 | QdrantClient searches vectors | Mock HTTP client with mock results | POST /collections/{name}/search called | Search results returned |
| T002-IT-01 | Docker container auto-start | Docker available, Qdrant not running | Container started, health check passes | Qdrant accessible on 6333 |
| T002-IT-02 | Full CRUD cycle with real Qdrant | Qdrant running | Create -> Upsert -> Search -> Delete works | All operations successful |
| T002-IT-03 | Reconnection after Qdrant restart | Qdrant running, then stopped | Client reconnects, operations resume | Graceful recovery |

---

#### Task T-003: Embedding Provider — Test Cases

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T003-UT-01 | Fallback chain order correct | All providers available | OpenAI tried first | getActiveProvider() returns 'openai' |
| T003-UT-02 | Fallback to Ollama on OpenAI failure | OpenAI fails, Ollama available | Ollama used | getActiveProvider() returns 'ollama' |
| T003-UT-03 | Fallback to ONNX on Ollama failure | Ollama fails, ONNX available | ONNX used | getActiveProvider() returns 'onnx' |
| T003-UT-04 | All providers fail returns error | All providers unavailable | Error thrown with details | Error message includes all failures |
| T003-IT-01 | OpenAI embedding returns valid vector | OpenAI API key set | Vector length = 1536 | Valid float array returned |
| T003-IT-02 | ONNX embedding in worker thread | ONNX model loaded | Worker thread used | Cold start < 5s |
| T003-IT-03 | Batch embedding performance | Multiple texts | Batch faster than sequential | Speedup >= 2x |

---

#### Task T-004: RAG Pipeline — Test Cases

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T004-UT-01 | Query preprocessing normalizes text | Query with special chars | Clean query string | Normalized text |
| T004-UT-02 | Search results filtered by threshold | Mock results with scores | Only results >= 0.7 returned | Filtered list |
| T004-UT-03 | Context formatting for prompt | Memory entries returned | Formatted string with markers | LLM-readable format |
| T004-IT-01 | End-to-end RAG query | Qdrant with test data, embeddings working | Relevant results returned | Results match query intent |
| T004-IT-02 | Latency under 200ms | Full pipeline with cache | Query completes < 200ms | Performance metric logged |
| T004-IT-03 | Hook integration with Agent Runtime | Agent Runtime initialized | Hook registered, callback works | Context injected |

---

#### Task T-005: Fact Extraction — Test Cases

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T005-UT-01 | Pattern-based extraction detects facts | Text with known patterns | Facts extracted | Correct pattern matches |
| T005-UT-02 | Category classification correct | Text samples | Correct category assigned | FACT/PREFERENCE/etc |
| T005-UT-03 | Deduplication prevents duplicates | Existing fact in memory | No duplicate created | Existing fact returned |
| T005-IT-01 | LLM-based extraction works | Mock LLM response | Facts parsed correctly | Structured output |
| T005-IT-02 | Hook triggers extraction | Agent response received | Extraction runs | Memory entry created |
| T005-IT-03 | Tool result extraction | Tool result with useful info | Fact extracted | Relevant data captured |

---

#### Task T-006: Knowledge Base Ingestion — Test Cases

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T006-UT-01 | Fixed-size chunking correct size | Document > 512 tokens | Chunks ~= 512 tokens | Chunk sizes valid |
| T006-UT-02 | Chunk overlap maintained | Document chunked | Adjacent chunks share content | Overlap verified |
| T006-UT-03 | Metadata extracted correctly | Markdown with title | Title, source captured | Metadata fields set |
| T006-IT-01 | Full ingestion pipeline | Test document, Qdrant running | Chunks stored in Qdrant | Searchable |
| T006-IT-02 | Incremental ingestion skips unchanged | Document already ingested | No duplicate chunks | Existing ID returned |
| T006-IT-03 | Multiple formats supported | .txt, .md, .json files | All processed | Chunks created |

---

#### Task T-007: Integration Tests — Test Cases

| Test ID | Description | Preconditions | Expected Result | Pass/Fail |
|---------|-------------|---------------|-----------------|-----------|
| T007-IT-01 | Memory CRUD cycle | Full system running | Remember -> Recall -> Forget works | All operations successful |
| T007-IT-02 | RAG accuracy test | Known documents ingested | Relevant results for queries | Precision >= 0.8 |
| T007-IT-03 | Embedding fallback stress test | OpenAI rate limited | Fallback chain activates | System continues working |
| T007-IT-04 | Fact extraction quality | Conversation with facts | Relevant facts captured | Recall >= 0.7 |
| T007-IT-05 | Knowledge base end-to-end | Document folder | Ingest -> Query -> Results | Full pipeline works |
| T007-IT-06 | Hook integration full flow | Agent Runtime + Memory | before_prompt_build gets context | Memory context present |

---

## 5. Implementation Plan per Task

---

### Task T-001: SQLite Schema — Implementation Steps

1. **Create packages/memory directory structure**
   - `src/db/schema.sql`
   - `src/db/migrations/`
   - `src/db/DatabaseManager.ts`

2. **Define schema tables:**
   ```sql
   -- sessions: session metadata
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,
     type TEXT NOT NULL, -- 'main' | 'group' | 'isolated'
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     metadata TEXT -- JSON
   );

   -- messages: short-term memory
   CREATE TABLE messages (
     id TEXT PRIMARY KEY,
     session_id TEXT NOT NULL REFERENCES sessions(id),
     role TEXT NOT NULL, -- 'user' | 'assistant' | 'tool' | 'system'
     content TEXT NOT NULL,
     tokens INTEGER,
     created_at TEXT NOT NULL,
     metadata TEXT -- JSON
   );

   -- memory_entries: long-term memory metadata
   CREATE TABLE memory_entries (
     id TEXT PRIMARY KEY,
     category TEXT NOT NULL, -- 'FACT' | 'PREFERENCE' | 'KNOWLEDGE' | 'ERROR' | 'PATTERN'
     content TEXT NOT NULL,
     vector_id TEXT, -- Qdrant point ID
     source_session TEXT REFERENCES sessions(id),
     tags TEXT, -- JSON array
     access_count INTEGER DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     metadata TEXT -- JSON
   );

   -- knowledge_sources: ingested documents
   CREATE TABLE knowledge_sources (
     id TEXT PRIMARY KEY,
     title TEXT,
     path TEXT NOT NULL,
     file_hash TEXT NOT NULL,
     chunks_count INTEGER DEFAULT 0,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     metadata TEXT -- JSON
   );

   -- knowledge_chunks: document chunks
   CREATE TABLE knowledge_chunks (
     id TEXT PRIMARY KEY,
     source_id TEXT NOT NULL REFERENCES knowledge_sources(id),
     vector_id TEXT, -- Qdrant point ID
     content TEXT NOT NULL,
     chunk_index INTEGER NOT NULL,
     tokens INTEGER,
     created_at TEXT NOT NULL
   );

   -- schema_version: migration tracking
   CREATE TABLE schema_version (
     version INTEGER PRIMARY KEY,
     applied_at TEXT NOT NULL
   );
   ```

3. **Create indexes:**
   ```sql
   CREATE INDEX idx_messages_session ON messages(session_id);
   CREATE INDEX idx_messages_created ON messages(created_at);
   CREATE INDEX idx_memory_category ON memory_entries(category);
   CREATE INDEX idx_memory_session ON memory_entries(source_session);
   CREATE INDEX idx_chunks_source ON knowledge_chunks(source_id);
   ```

4. **Implement DatabaseManager:**
   - `initialize()`: create tables, enable WAL
   - `runMigration(version, sql)`: versioned migrations
   - `transaction(fn)`: transaction wrapper

5. **Constraints from architecture:**
   - better-sqlite3 (synchronous API)
   - WAL mode for concurrency
   - File path: `~/.osai/memory.db`

---

### Task T-002: Qdrant Integration — Implementation Steps

1. **Create QdrantClient class:**
   ```typescript
   // src/qdrant/QdrantClient.ts
   class QdrantClient {
     constructor(config: QdrantConfig);
     async healthCheck(): Promise<boolean>;
     async createCollection(name: string, vectorSize: number): Promise<void>;
     async collectionExists(name: string): Promise<boolean>;
     async upsertPoints(collection: string, points: Point[]): Promise<void>;
     async deletePoints(collection: string, ids: string[]): Promise<void>;
     async search(collection: string, vector: number[], options: SearchOptions): Promise<SearchResult[]>;
     async deleteCollection(name: string): Promise<void>;
   }
   ```

2. **Implement Docker auto-start:**
   ```typescript
   // src/qdrant/DockerManager.ts
   class DockerManager {
     async isRunning(): Promise<boolean>;
     async startContainer(): Promise<void>;
     async stopContainer(): Promise<void>;
     async getContainerStatus(): Promise<ContainerStatus>;
   }
   ```

3. **Collection management:**
   - Collections: `memory`, `knowledge`
   - Vector size: 1536 (OpenAI) or 384 (ONNX)
   - Distance: Cosine

4. **Constraints from architecture:**
   - REST API client (`@qdrant/js-client-rest` or fetch)
   - Default endpoint: `http://localhost:6333`
   - Reconnect logic with exponential backoff

---

### Task T-003: Embedding Provider — Implementation Steps

1. **Create EmbeddingProvider interface:**
   ```typescript
   // src/embedding/types.ts
   interface Embedder {
     name: string;
     embed(text: string): Promise<number[]>;
     embedBatch(texts: string[]): Promise<number[][]>;
     isAvailable(): Promise<boolean>;
     getDimension(): number;
   }
   ```

2. **Implement providers:**
   ```typescript
   // src/embedding/OpenAIEmbedder.ts
   class OpenAIEmbedder implements Embedder {
     // text-embedding-3-small, dimension: 1536
   }

   // src/embedding/OllamaEmbedder.ts
   class OllamaEmbedder implements Embedder {
     // nomic-embed-text, dimension: 768
   }

   // src/embedding/OnnxEmbedder.ts
   class OnnxEmbedder implements Embedder {
     // all-MiniLM-L6-v2, dimension: 384
     // Uses worker_threads
   }
   ```

3. **Implement fallback chain:**
   ```typescript
   // src/embedding/EmbeddingProvider.ts
   class EmbeddingProvider {
     private providers: Embedder[];
     private activeProvider: Embedder | null;

     async embed(text: string): Promise<EmbedResult>;
     async embedBatch(texts: string[]): Promise<EmbedResult[]>;
     getActiveProvider(): string;
   }
   ```

4. **Worker thread implementation:**
   ```typescript
   // src/embedding/workers/onnxWorker.ts
   // Worker script for ONNX inference
   ```

5. **Constraints from architecture:**
   - NFR-003: CPU-bound in worker threads
   - NFR-005: Cold start < 5s (model caching)
   - Configurable fallback chain

---

### Task T-004: RAG Pipeline — Implementation Steps

1. **Create RagPipeline class:**
   ```typescript
   // src/rag/RagPipeline.ts
   class RagPipeline {
     constructor(
       private embeddingProvider: EmbeddingProvider,
       private qdrantClient: QdrantClient,
       private config: RagConfig
     );

     async query(queryText: string, options?: RagOptions): Promise<RagResult>;
     formatContext(results: MemoryEntry[]): string;
   }
   ```

2. **Query pipeline steps:**
   - Preprocess query (normalize, clean)
   - Generate embedding
   - Search Qdrant with filters
   - Filter by threshold
   - Rank by relevance
   - Format for prompt

3. **Context formatting:**
   ```typescript
   // Format for LLM prompt injection
   formatContext(entries: MemoryEntry[]): string {
     // Returns formatted string like:
     // [RELEVANT MEMORY]
     // - Fact: User prefers TypeScript over JavaScript
     // - Preference: Dark mode enabled
     // [END MEMORY]
   }
   ```

4. **Hook integration:**
   ```typescript
   // Register with Agent Runtime
   agentRuntime.registerHook('before_prompt_build', async (ctx) => {
     const memory = await ragPipeline.query(ctx.message);
     ctx.prompt.memoryContext = ragPipeline.formatContext(memory);
     return ctx;
   });
   ```

5. **Constraints from architecture:**
   - NFR-001: Latency < 200ms
   - Integration point: Agent Runtime hooks

---

### Task T-005: Fact Extraction — Implementation Steps

1. **Create FactExtractor class:**
   ```typescript
   // src/extraction/FactExtractor.ts
   class FactExtractor {
     constructor(
       private config: ExtractionConfig,
       private memoryManager: MemoryManager
     );

     async extract(text: string, sessionId: string): Promise<MemoryEntry[]>;
     classifyCategory(fact: string): MemoryCategory;
     async deduplicate(fact: string): Promise<boolean>;
   }
   ```

2. **Pattern-based extraction:**
   ```typescript
   // src/extraction/patterns.ts
   const PATTERNS = {
     preference: /I (prefer|like|want|don't like|hate) /gi,
     fact: /(?:always|never|usually|typically) /gi,
     error: /error|failed|exception|bug/gi,
     // ...
   };
   ```

3. **LLM-based extraction prompt:**
   ```typescript
   const EXTRACTION_PROMPT = `
   Extract facts, preferences, and important information from the following text.
   Return JSON array with: { content, category, confidence }
   Categories: FACT, PREFERENCE, KNOWLEDGE, ERROR, PATTERN

   Text: {input}
   `;
   ```

4. **Hook registration:**
   ```typescript
   // Register hooks
   agentRuntime.registerHook('after_tool_call', async (ctx) => {
     const facts = await factExtractor.extract(ctx.toolResult.data, ctx.sessionId);
     for (const fact of facts) {
       await memoryManager.store(fact);
     }
     return ctx;
   });
   ```

5. **Constraints from architecture:**
   - Configurable (auto-extract on/off)
   - Deduplication to avoid memory bloat

---

### Task T-006: Knowledge Base Ingestion — Implementation Steps

1. **Create KnowledgeBaseIngestor class:**
   ```typescript
   // src/knowledge/Ingestor.ts
   class KnowledgeBaseIngestor {
     constructor(
       private db: DatabaseManager,
       private qdrant: QdrantClient,
       private embedding: EmbeddingProvider,
       private config: IngestConfig
     );

     async ingestDocument(path: string, options?: IngestOptions): Promise<IngestResult>;
     async ingestDirectory(dir: string): Promise<IngestResult[]>;
     async removeSource(documentId: string): Promise<void>;
   }
   ```

2. **Document readers:**
   ```typescript
   // src/knowledge/readers.ts
   class TxtReader { read(path: string): Promise<string>; }
   class MdReader { read(path: string): Promise<{ content: string; title?: string }>; }
   class JsonReader { read(path: string): Promise<string>; }
   ```

3. **Chunking strategies:**
   ```typescript
   // src/knowledge/chunking.ts
   class FixedSizeChunker {
     chunk(text: string, size: number, overlap: number): Chunk[];
   }

   class SentenceChunker {
     chunk(text: string, maxTokens: number): Chunk[];
   }
   ```

4. **Ingestion pipeline:**
   ```
   Read file -> Extract metadata -> Chunk -> Embed chunks -> Store in Qdrant -> Store metadata in SQLite
   ```

5. **Constraints from architecture:**
   - Default chunk size: 512 tokens
   - Default overlap: 50 tokens
   - Support: .txt, .md, .json initially

---

### Task T-007: Integration Tests — Implementation Steps

1. **Create test directory structure:**
   ```
   packages/memory/tests/
   ├── integration/
   │   ├── memory-crud.test.ts
   │   ├── rag-pipeline.test.ts
   │   ├── embedding-fallback.test.ts
   │   ├── fact-extraction.test.ts
   │   ├── knowledge-base.test.ts
   │   └── hooks-integration.test.ts
   └── fixtures/
       ├── sample-docs/
       └── test-data.ts
   ```

2. **Test utilities:**
   ```typescript
   // tests/utils/test-helpers.ts
   async function setupTestQdrant(): Promise<QdrantClient>;
   async function setupTestDb(): Promise<DatabaseManager>;
   async function teardown(): Promise<void>;
   ```

3. **Mock configurations:**
   - Mock OpenAI/Ollama for consistent tests
   - Use real Qdrant (Docker) for integration tests
   - Use in-memory SQLite for speed

4. **Performance benchmarks:**
   ```typescript
   // tests/benchmarks/rag-latency.test.ts
   test('RAG query latency < 200ms', async () => {
     const start = Date.now();
     await ragPipeline.query('test query');
     const duration = Date.now() - start;
     expect(duration).toBeLessThan(200);
   });
   ```

---

## 6. Acceptance Criteria per Task

---

### Task T-001: SQLite Schema

- [ ] Все таблицы созданы: sessions, messages, memory_entries, knowledge_sources, knowledge_chunks
- [ ] WAL mode включен и подтвержден pragma
- [ ] Индексы созданы и используются в query plan
- [ ] Schema migration система работает
- [ ] Unit tests pass (coverage >= 80%)
- [ ] Build successful
- [ ] DatabaseManager API документирован

---

### Task T-002: Qdrant Integration

- [ ] QdrantClient реализует все CRUD операции
- [ ] Docker auto-start работает (контейнер запускается автоматически)
- [ ] Health check реализован
- [ ] Reconnect logic работает при падении Qdrant
- [ ] Collection management работает (create, delete, exists)
- [ ] Unit tests pass (mocked HTTP)
- [ ] Integration tests pass (real Qdrant)
- [ ] Build successful

---

### Task T-003: Embedding Provider

- [ ] OpenAI embedder работает с API key
- [ ] Ollama embedder работает с локальным Ollama
- [ ] ONNX embedder работает в worker thread
- [ ] Fallback chain работает: OpenAI -> Ollama -> ONNX
- [ ] Cold start < 5s (кэширование модели)
- [ ] Batch embedding поддерживается
- [ ] Unit tests pass
- [ ] Integration tests pass (с mock/real APIs)
- [ ] Build successful

---

### Task T-004: RAG Pipeline

- [ ] Query preprocessing работает
- [ ] Embedding generation интегрирован
- [ ] Qdrant search работает с фильтрами
- [ ] Threshold filtering реализован
- [ ] Context formatting для LLM готов
- [ ] Latency < 200ms (измерено в тестах)
- [ ] Hook интеграция с Agent Runtime работает
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Build successful

---

### Task T-005: Fact Extraction

- [ ] Pattern-based extraction работает для базовых паттернов
- [ ] LLM-based extraction интегрирован (с prompt)
- [ ] Category classification работает (FACT, PREFERENCE, etc.)
- [ ] Deduplication предотвращает дубликаты
- [ ] Hook registration работает (after_tool_call, agent_end)
- [ ] Configurable extraction rules
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Build successful

---

### Task T-006: Knowledge Base Ingestion

- [ ] Document readers работают (.txt, .md, .json)
- [ ] Fixed-size chunking реализован
- [ ] Sentence-based chunking реализован
- [ ] Metadata extraction работает
- [ ] Batch embedding для chunks
- [ ] Qdrant storage работает
- [ ] SQLite metadata storage работает
- [ ] Incremental ingestion работает (проверка file hash)
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Build successful

---

### Task T-007: Integration Tests

- [ ] Memory CRUD cycle tests pass
- [ ] RAG accuracy tests pass (precision >= 0.8)
- [ ] Embedding fallback tests pass
- [ ] Fact extraction quality tests pass (recall >= 0.7)
- [ ] Knowledge base e2e tests pass
- [ ] Hook integration tests pass
- [ ] Performance benchmarks pass (latency requirements met)
- [ ] All tests run in CI
- [ ] Coverage >= 70% overall

---

## 7. Quality Expectations

### Coverage Requirements

| Task | Unit Test Coverage | Integration Coverage |
|------|-------------------|---------------------|
| T-001 SQLite Schema | >= 80% | >= 60% |
| T-002 Qdrant Integration | >= 80% | >= 70% |
| T-003 Embedding Provider | >= 85% | >= 60% |
| T-004 RAG Pipeline | >= 80% | >= 70% |
| T-005 Fact Extraction | >= 75% | >= 60% |
| T-006 Knowledge Base Ingestion | >= 75% | >= 65% |
| **Overall Package** | **>= 75%** | **>= 65%** |

### Performance Targets

| Metric | Target | NFR Reference |
|--------|--------|---------------|
| RAG query latency | < 200ms | NFR-001 |
| Cold start embedding | < 5s | NFR-005 |
| Embedding batch speedup | >= 2x vs sequential | — |
| Qdrant search latency | < 100ms | — |

### Task Completion Time

- T-001: 2-3 hours
- T-002: 3-4 hours
- T-003: 3-4 hours
- T-004: 3-4 hours
- T-005: 2-3 hours
- T-006: 3-4 hours
- T-007: 3-4 hours

**Total Estimated:** 19-26 hours

---

## 8. Risks and Edge Cases

### Known Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Qdrant Docker container fails to start | Medium | High | Fallback error message, manual start instructions, health check retry |
| OpenAI API rate limits | High | Medium | Fallback chain to Ollama/ONNX, caching, request throttling |
| ONNX model download slow | Medium | Low | Pre-download on first install, cache in ~/.osai/models/ |
| Embedding dimension mismatch between providers | Medium | High | Standardize on one dimension, or separate Qdrant collections per provider |
| Fact extraction produces noise | High | Medium | Confidence threshold, deduplication, user review capability |
| Memory bloat over time | Medium | Medium | Access count tracking, TTL for old memories, cleanup job |

### Edge Cases

1. **Empty query to RAG pipeline**
   - Return empty context, no error

2. **Very long document for ingestion**
   - Chunk into multiple pieces, track chunks count

3. **Duplicate document ingestion**
   - Check file hash, skip if unchanged

4. **Qdrant unavailable during query**
   - Return short-term memory only, log error

5. **All embedding providers fail**
   - Throw descriptive error, suggest configuration check

6. **Fact extraction from non-text content**
   - Skip extraction, log warning

7. **Concurrent access to SQLite**
   - WAL mode handles readers, writers serialize

---

## 9. Notes

### Configuration Integration

Memory system configuration in `openclaw.json`:

```json
{
  "memory": {
    "embeddingProvider": "auto",
    "openaiApiKey": "${OPENAI_API_KEY}",
    "ollamaEndpoint": "http://localhost:11434",
    "qdrantEndpoint": "http://localhost:6333",
    "ragTopK": 5,
    "similarityThreshold": 0.7,
    "chunkSize": 512,
    "chunkOverlap": 50,
    "autoExtractFacts": true
  }
}
```

### Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "@qdrant/js-client-rest": "^1.7.0",
    "@huggingface/transformers": "^3.0.0",
    "openai": "^4.0.0"
  },
  "optionalDependencies": {
    "dockerode": "^4.0.0"
  }
}
```

### Package Structure

```
packages/memory/
├── src/
│   ├── index.ts
│   ├── db/
│   │   ├── DatabaseManager.ts
│   │   ├── schema.sql
│   │   └── migrations/
│   ├── qdrant/
│   │   ├── QdrantClient.ts
│   │   └── DockerManager.ts
│   ├── embedding/
│   │   ├── EmbeddingProvider.ts
│   │   ├── OpenAIEmbedder.ts
│   │   ├── OllamaEmbedder.ts
│   │   ├── OnnxEmbedder.ts
│   │   ├── workers/
│   │   │   └── onnxWorker.ts
│   │   └── types.ts
│   ├── rag/
│   │   └── RagPipeline.ts
│   ├── extraction/
│   │   ├── FactExtractor.ts
│   │   └── patterns.ts
│   ├── knowledge/
│   │   ├── Ingestor.ts
│   │   ├── readers.ts
│   │   └── chunking.ts
│   └── MemoryManager.ts
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
└── tsconfig.json
```

### Hook Integration Points

| Hook Point | Purpose | Memory Action |
|------------|---------|---------------|
| `before_prompt_build` | Inject memory context | RAG query, format context |
| `after_tool_call` | Extract facts from tool results | Fact extraction |
| `agent_end` | Extract facts from conversation | Fact extraction, session summary |
| `before_memory_query` | Pre-process query | Query modification |
| `after_memory_extract` | Post-process extracted facts | Fact validation |

---

*End of Roadmap v1.0 for Feature F-006: Memory System*
