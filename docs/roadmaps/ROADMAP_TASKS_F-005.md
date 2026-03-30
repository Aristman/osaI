# Task Roadmap: Memory System

**Feature ID:** F-005
**Feature Name:** Memory System
**Domain:** DOMAIN-004 (Memory System)
**Agent Profile:** backend-typescript (extends backend-base + nodejs)
**Git Branch:** feature/memory-system
**Dependencies:** F-001 (Core Infrastructure), F-003 (Observability -- audit)
**Related Requirements:** FR-008, FR-009, FR-010, FR-011, FR-013
**Components:** S-018, S-019, S-020, S-021 (optional), S-022, S-023, S-024
**Version:** v1.0

---

## 1. Feature Overview

Трёхуровневая память (Chat, Session, Long-term), RAG pipeline, embedding generation (Ollama/Yandex/ONNX fallback), sqlite-vec vector storage, context window manager с auto-pruning + summarization, fact extraction.

**Ключевые решения из архитектуры:**
- sqlite-vec как primary vector storage (AD-002)
- Ollama nomic-embed-text 768-dim как default embedding provider
- Cosine similarity, top_k=5, min_similarity=0.7
- Summarization при 80% превышении лимита
- System prompt никогда не обрезается

---

## 2. Dependencies

### 2.1 Feature Dependencies

- **F-001:** Core Infrastructure (blocking) -- SQLite (better-sqlite3), pino logger, osai.json config, WAL mode
- **F-003:** Observability Foundation (blocking) -- audit logging, trace_id propagation

### 2.2 Task Dependencies

- **T-001** -- None (базовая структура package)
- **T-002** -- T-001 (требует package structure)
- **T-003** -- T-001 (требует package structure)
- **T-004** -- T-002, T-003 (требует embeddings + vector storage)
- **T-005** -- T-001 (требует package structure)
- **T-006** -- T-004, T-005 (требует RAG + Memory Manager)
- **T-007** -- T-006 (требует Memory Manager)
- **T-008** -- T-006, T-007 (требует Memory Manager + Context Window)

### 2.3 Development Order

```
Параллельно:
  T-001 (package setup) + T-005 (SQLite schema)

Параллельно:
  T-002 (embeddings) + T-003 (vector storage)

Последовательно:
  T-004 (RAG pipeline)

Параллельно:
  T-006 (Memory Manager) + T-007 (Context Window)

Последовательно:
  T-008 (Integration + Fact Extraction)
```

---

## 3. Task Breakdown

---

### Task T-001: Package Memory -- Base Structure and Interfaces

**Description:**
Создание структуры package `packages/memory`, определение TypeScript interfaces для всех компонентов Memory System, базовые типы и экспорты.

**Estimated Time:** 2 hours

**Dependencies:** None

**Scope:**
- **In scope:** package.json, tsconfig.json, src/types/, src/index.ts, интерфейсы MemoryEntry, EmbeddingVector, RAGQuery, RAGResult, ContextWindowConfig, MemoryManager
- **Out scope:** реализация, SQLite schema

#### Checklist
- [ ] CODE: `packages/memory/package.json`
- [ ] CODE: `packages/memory/tsconfig.json`
- [ ] CODE: `packages/memory/src/types/memory.ts` -- MemoryEntry, MemoryCategory, MemoryTier
- [ ] CODE: `packages/memory/src/types/embeddings.ts` -- EmbeddingProviderConfig, EmbeddingResult
- [ ] CODE: `packages/memory/src/types/rag.ts` -- RAGQuery, RAGResult, RAGConfig
- [ ] CODE: `packages/memory/src/types/context.ts` -- ContextWindowConfig, PruningPriority, PruningResult
- [ ] CODE: `packages/memory/src/types/vector-storage.ts` -- VectorStorageConfig, SearchResult
- [ ] CODE: `packages/memory/src/index.ts` -- barrel export
- [ ] TEST: `packages/memory/src/__tests__/types.test.ts` -- проверка корректности типов, enum values, default configs
- [ ] BUILD: `pnpm --filter @osai/memory build`

#### Acceptance
- package.json содержит зависимости: better-sqlite3, sqlite-vec (optional), pino
- Все интерфейсы экспортируются через barrel export
- TypeScript strict mode компилируется без ошибок
- Unit tests для типов проходят
- `pnpm --filter @osai/memory build` завершается успешно

---

### Task T-002: Embedding Provider Interface + Ollama Adapter

**Description:**
Интерфейс EmbeddingProvider и реализация Ollama adapter (nomic-embed-text, 768-dim). Включает fallback chain framework.

**Estimated Time:** 3 hours

**Dependencies:** T-001

**Scope:**
- **In scope:** EmbeddingProvider interface, OllamaEmbeddingProvider, EmbeddingFallbackChain
- **Out scope:** Yandex adapter (T-003 partial), ONNX adapter

#### Checklist
- [ ] CODE: `packages/memory/src/embeddings/embedding-provider.ts` -- interface EmbeddingProvider { embed(text): EmbeddingResult, isAvailable(), dimensions }
- [ ] CODE: `packages/memory/src/embeddings/ollama-provider.ts` -- HTTP call to Ollama /api/embed, model nomic-embed-text
- [ ] CODE: `packages/memory/src/embeddings/fallback-chain.ts` -- EmbeddingFallbackChain с isAvailable check и fallback логикой
- [ ] CODE: `packages/memory/src/embeddings/index.ts`
- [ ] TEST: `packages/memory/src/__tests__/embeddings/ollama-provider.test.ts`
  - TC-001: embed("hello") возвращает float[] длиной 768
  - TC-002: embed с пустой строкой выбрасывает Error
  - TC-003: isAvailable() возвращает true при доступном Ollama (mock HTTP)
  - TC-004: isAvailable() возвращает false при недоступном Ollama
- [ ] TEST: `packages/memory/src/__tests__/embeddings/fallback-chain.test.ts`
  - TC-005: chain вызывает primary provider при доступности
  - TC-006: chain fallback на secondary при недоступности primary
  - TC-007: chain выбрасывает Error при недоступности всех providers
- [ ] BUILD: `pnpm --filter @osai/memory build`

#### Acceptance
- EmbeddingProvider interface с методами embed, isAvailable, dimensions
- OllamaEmbeddingProvider делает HTTP POST к Ollama /api/embeddings
- EmbeddingFallbackChain переключается на fallback при ошибке
- Все unit tests проходят (mocked HTTP calls)
- Build успешен

---

### Task T-003: Vector Storage -- sqlite-vec Adapter

**Description:**
Абстракция VectorStorage и реализация на базе sqlite-vec extension. CRUD для векторов, cosine similarity search.

**Estimated Time:** 4 hours

**Dependencies:** T-001

**Scope:**
- **In scope:** VectorStorage interface, SqliteVecStorage, cosine similarity search
- **Out scope:** Qdrant adapter (optional, V1)

#### Checklist
- [ ] CODE: `packages/memory/src/vector-storage/vector-storage.ts` -- interface VectorStorage { upsert(id, vector, metadata), delete(id), search(vector, topK, minSimilarity), init() }
- [ ] CODE: `packages/memory/src/vector-storage/sqlite-vec-storage.ts` -- реализация через sqlite-vec extension (sqlite3_vec)
- [ ] CODE: `packages/memory/src/vector-storage/index.ts`
- [ ] TEST: `packages/memory/src/__tests__/vector-storage/sqlite-vec-storage.test.ts`
  - TC-001: init() создаёт virtual table memory_vectors если не существует
  - TC-002: upsert вставляет вектор с metadata
  - TC-003: upsert обновляет существующий вектор по id
  - TC-004: search возвращает top_k=5 результатов по cosine similarity
  - TC-005: search фильтрует по min_similarity (результаты с score < 0.7 исключены)
  - TC-006: delete удаляет вектор по id
  - TC-007: search с пустой таблицей возвращает пустой массив
- [ ] BUILD: `pnpm --filter @osai/memory build`

#### Acceptance
- sqlite-vec virtual table создаётся автоматически при init()
- upsert/search/delete работают корректно
- Cosine similarity search фильтрует по min_similarity threshold
- Build успешен

---

### Task T-004: RAG Pipeline

**Description:**
Полный RAG pipeline: embed query -> vector search -> filter -> return results. Интеграция с EmbeddingProvider и VectorStorage.

**Estimated Time:** 3 hours

**Dependencies:** T-002, T-003

**Scope:**
- **In scope:** RAGPipeline class, query orchestration, result formatting
- **Out scope:** Memory Manager integration (T-006), fact extraction (T-008)

#### Checklist
- [ ] CODE: `packages/memory/src/rag/rag-pipeline.ts` -- RAGPipeline { query(text, options): Promise<RAGResult[]> }
- [ ] CODE: `packages/memory/src/rag/rag-config.ts` -- default config: topK=5, minSimilarity=0.7
- [ ] CODE: `packages/memory/src/rag/index.ts`
- [ ] TEST: `packages/memory/src/__tests__/rag/rag-pipeline.test.ts`
  - TC-001: query вызывает embed provider с текстом запроса
  - TC-002: query вызывает vector search с полученным вектором
  - TC-003: query возвращает результаты с similarity > minSimilarity
  - TC-004: query с topK=3 возвращает максимум 3 результата
  - TC-005: query при ошибке embedding выбрасывает RAGError
  - TC-006: query при ошибке vector search выбрасывает RAGError
  - TC-007: query форматирует результат с content, similarity, metadata
- [ ] BUILD: `pnpm --filter @osai/memory build`

#### Acceptance
- RAGPipeline получает текст, делает embedding, ищет векторы, возвращает результаты
- Конфигурируемые topK и minSimilarity
- Graceful error handling (RAGError с контекстом)
- Build успешен

---

### Task T-005: SQLite Schema for Memory Entries

**Description:**
Создание SQLite таблиц для трёхуровневой памяти: memory_entries (long-term), chat_memory, session_memory. Миграции и seed data.

**Estimated Time:** 2 hours

**Dependencies:** T-001

**Scope:**
- **In scope:** таблицы memory_entries, chat_memory, session_memory, индексы, repository
- **Out scope:** RAG pipeline, embedding generation

#### Checklist
- [ ] CODE: `packages/memory/src/db/schema.ts` -- CREATE TABLE IF NOT EXISTS для memory_entries, chat_memory, session_memory
- [ ] CODE: `packages/memory/src/db/memory-repository.ts` -- MemoryRepository { store, findById, findByChat, findBySession, findLongTerm, delete, searchByTags }
- [ ] CODE: `packages/memory/src/db/index.ts`
- [ ] TEST: `packages/memory/src/__tests__/db/memory-repository.test.ts`
  - TC-001: store() сохраняет MemoryEntry в таблицу memory_entries
  - TC-002: findById() возвращает запись по id или null
  - TC-003: findByChat() возвращает все записи для chat_id
  - TC-004: findBySession() возвращает все записи для session_id
  - TC-005: findLongTerm() возвращает записи tier='long-term' (shared across chats)
  - TC-006: delete() удаляет запись по id
  - TC-007: searchByTags() фильтрует записи по тегам (JSON contains)
  - TC-008: schema migration idempotent (повторный вызов не ошибается)
- [ ] BUILD: `pnpm --filter @osai/memory build`

#### Acceptance
- Все 3 таблицы создаются при schema init
- MemoryRepository CRUD операции работают корректно
- Индексы создаются для chat_id, session_id, tier
- Idempotent schema migration
- Build успешен

---

### Task T-006: Memory Manager -- Three-Tier Memory

**Description:**
Единый MemoryManager с методами query, store, extract, forget, summarize. Координация Chat/Session/Long-term tiers + RAG pipeline.

**Estimated Time:** 4 hours

**Dependencies:** T-004, T-005

**Scope:**
- **In scope:** MemoryManager class, query (с RAG), store в long-term, forget, remember
- **Out scope:** context window pruning (T-007), fact extraction via LLM (T-008)

#### Checklist
- [ ] CODE: `packages/memory/src/memory/memory-manager.ts` -- MemoryManager { query(text), store(entry, tier), remember(content, chatId), forget(id), recall(chatId, query) }
- [ ] CODE: `packages/memory/src/memory/index.ts`
- [ ] TEST: `packages/memory/src/__tests__/memory/memory-manager.test.ts`
  - TC-001: store() сохраняет в long-term tier + генерирует embedding + upsert в vector storage
  - TC-002: remember() создаёт MemoryEntry с tier=long-term и store
  - TC-003: query() вызывает RAG pipeline и возвращает релевантные записи
  - TC-004: forget(id) удаляет из SQLite + vector storage
  - TC-005: recall(chatId, query) ищет по chat memory + long-term memory через RAG
  - TC-006: store() с tier=chat сохраняет только в chat_memory (без vector search)
  - TC-007: store() логирует действия в audit log (trace_id)
- [ ] BUILD: `pnpm --filter @osai/memory build`

#### Acceptance
- MemoryManager координирует все 3 tier + RAG pipeline
- store() генерирует embedding и сохраняет в vector storage
- forget() удаляет из обеих storages (SQLite + vectors)
- Audit logging через pino + trace_id
- Build успешен

---

### Task T-007: Context Window Manager -- Auto-Pruning + Summarization

**Description:**
ContextWindowManager с priority-based pruning. Определение приоритетов обрезки, суммаризация при 80% threshold.

**Estimated Time:** 4 hours

**Dependencies:** T-006

**Scope:**
- **In scope:** ContextWindowManager, priority pruning, summarization trigger, token counting
- **Out scope:** LLM-based summarization (используется mock/stub, реальная интеграция в T-008)

#### Checklist
- [ ] CODE: `packages/memory/src/context/context-window-manager.ts` -- ContextWindowManager { buildContext(messages, systemPrompt, maxTokens): ContextResult }
- [ ] CODE: `packages/memory/src/context/pruning.ts` -- pruneByPriority(): priority order (1=LT RAG, 2=KB chunks, 3=tool calls, 4=early history, 5=system prompt -- never)
- [ ] CODE: `packages/memory/src/context/token-counter.ts` -- estimateTokens(text): number (tiktoken-compatible estimation)
- [ ] CODE: `packages/memory/src/context/index.ts`
- [ ] TEST: `packages/memory/src/__tests__/context/context-window-manager.test.ts`
  - TC-001: buildContext() оставляет system prompt без изменений
  - TC-002: buildContext() при превышении 80% threshold запускает summarization (trigger)
  - TC-003: pruneByPriority() сначала удаляет LT RAG results, потом KB chunks
  - TC-004: pruneByPriority() оставляет последние N tool calls
  - TC-005: reservedForResponse=1024 резервирует токены для ответа
  - TC-006: buildContext() с историей < maxTokens не обрезает
  - TC-007: estimateTokens() корректно оценивает количество токенов
  - TC-008: pruneByPriority() с minMessages=4 оставляет минимум 4 сообщения
- [ ] BUILD: `pnpm --filter @osai/memory build`

#### Acceptance
- Context Window Manager корректно обрезает контекст по приоритетам
- System prompt никогда не обрезается
- Summarization trigger при 80% пороге
- reservedForResponse токены резервируются
- Build успешен

---

### Task T-008: Integration -- Fact Extraction + End-to-End Tests

**Description:**
Интеграция Memory System с Agent Runtime hooks. Fact extraction из ответов LLM. End-to-end тесты полного RAG pipeline.

**Estimated Time:** 4 hours

**Dependencies:** T-006, T-007

**Scope:**
- **In scope:** MemoryService (public API), hook integration (before_memory_query, after_memory_extract), e2e tests
- **Out scope:** Agent Runtime реализация (F-008)

#### Checklist
- [ ] CODE: `packages/memory/src/memory-service.ts` -- MemoryService (facade): init, query, store, forget, buildContext, extractFacts
- [ ] CODE: `packages/memory/src/facts/fact-extractor.ts` -- FactExtractor { extract(response, chatId): Promise<MemoryEntry[]> } (LLM-based, stub для TDD)
- [ ] CODE: `packages/memory/src/facts/index.ts`
- [ ] CODE: `packages/memory/src/index.ts` -- обновить barrel export с MemoryService
- [ ] TEST: `packages/memory/src/__tests__/facts/fact-extractor.test.ts`
  - TC-001: extract() вызывает LLM с prompt для извлечения фактов
  - TC-002: extract() парсит JSON response и создаёт MemoryEntry[]
  - TC-003: extract() при ошибке LLM возвращает пустой массив (graceful degradation)
  - TC-004: extract() логирует извлечённые факты в audit log
- [ ] TEST: `packages/memory/src/__tests__/integration/memory-e2e.test.ts`
  - TC-005: E2E: store -> embed -> vector upsert -> query -> search -> results (sqlite-vec in-memory)
  - TC-006: E2E: remember -> recall через RAG pipeline
  - TC-007: E2E: buildContext с pruning при overflow
  - TC-008: E2E: forget удаляет из SQLite + vector storage
- [ ] BUILD: `pnpm --filter @osai/memory build`

#### Acceptance
- MemoryService предоставляет единый facade для всех операций
- FactExtractor извлекает факты из LLM response (stubbed LLM)
- Graceful degradation при ошибках
- E2E тесты покрывают полный цикл: store -> query -> recall -> context
- Build успешен

---

## 4. Test Strategy (TDD)

### 4.1 Test Types per Task

| Task | Unit | Integration | E2E | Coverage Target |
|------|------|-------------|-----|-----------------|
| T-001 | types validation | -- | -- | 100% (types) |
| T-002 | 7 test cases | -- | -- | 90%+ |
| T-003 | 7 test cases | -- | -- | 90%+ |
| T-004 | 7 test cases | -- | -- | 90%+ |
| T-005 | 8 test cases | -- | -- | 90%+ |
| T-006 | 7 test cases | -- | -- | 85%+ |
| T-007 | 8 test cases | -- | -- | 90%+ |
| T-008 | 4 test cases | 4 E2E tests | 4 E2E tests | 85%+ |

### 4.2 Build and Run Verification

**Build Verification:**
```bash
pnpm --filter @osai/memory build
```
- Ожидаемый результат: успешная компиляция TypeScript без ошибок
- Критерии: exit code 0, нет type errors, dist/ создан

**Test Verification:**
```bash
pnpm --filter @osai/memory test
```
- Ожидаемый результат: все тесты проходят
- Критерии: exit code 0, 0 failures, coverage > 85%

**Lint Verification:**
```bash
pnpm --filter @osai/memory lint
```
- Ожидаемый результат: нет linting errors
- Критерии: exit code 0

### 4.3 Test Cases Summary

Всего **52 test case** (48 unit + 4 E2E).

---

## 5. Implementation Plan per Task

### T-001
1. Создать package.json с зависимостями (better-sqlite3, sqlite-vec, pino)
2. Определить TypeScript interfaces в src/types/
3. Создать barrel export в src/index.ts
4. Настроить tsconfig для strict mode

### T-002
1. Определить EmbeddingProvider interface
2. Реализовать OllamaEmbeddingProvider (HTTP client via undici)
3. Реализовать EmbeddingFallbackChain
4. Mock HTTP для unit tests

### T-003
1. Определить VectorStorage interface
2. Реализовать SqliteVecStorage через better-sqlite3 + sqlite-vec
3. Использовать in-memory SQLite для тестов
4. Реализовать cosine similarity search

### T-004
1. Реализовать RAGPipeline с DI (EmbeddingProvider + VectorStorage)
2. Конфигурация: topK, minSimilarity
3. Error handling: RAGError с контекстом
4. Mock dependencies для unit tests

### T-005
1. Создать schema.sql с 3 таблицами + индексы
2. Реализовать MemoryRepository CRUD
3. Использовать in-memory SQLite для тестов
4. Проверить idempotent migration

### T-006
1. Реализовать MemoryManager с DI (RAGPipeline + MemoryRepository + EmbeddingProvider)
2. Координация 3 tiers
3. Audit logging через pino
4. Интегрировать RAG query

### T-007
1. Реализовать token estimation (BPE-based или character-based approximation)
2. Реализовать priority pruning logic
3. Summarization trigger (stub, реальный LLM вызов в T-008 или F-008)
4. Контекстное тестирование с разными размерами сообщений

### T-008
1. Создать MemoryService facade
2. FactExtractor с LLM prompt template
3. Hook integration points (before_memory_query, after_memory_extract)
4. E2E тесты с in-memory SQLite

---

## 6. Acceptance Criteria per Task

| Task | Build | Tests | Runtime |
|------|-------|-------|---------|
| T-001 | `pnpm build` OK | types validated | N/A |
| T-002 | `pnpm build` OK | 7/7 pass | N/A |
| T-003 | `pnpm build` OK | 7/7 pass | N/A |
| T-004 | `pnpm build` OK | 7/7 pass | N/A |
| T-005 | `pnpm build` OK | 8/8 pass | N/A |
| T-006 | `pnpm build` OK | 7/7 pass | N/A |
| T-007 | `pnpm build` OK | 8/8 pass | N/A |
| T-008 | `pnpm build` OK | 8/8 pass | E2E pass |

**Общие критерии:**
- TypeScript strict mode, 0 errors
- pino structured logging (JSON) для всех операций
- Audit logging с trace_id для store/forget/query
- Graceful degradation: Memory System failures не блокируют Agent Runtime
- Структура package соответствует monorepo conventions

---

## 7. Quality Expectations

- **Coverage:** >= 85% по каждому модулю, >= 90% для embeddings и vector-storage
- **Task size:** 2-4 часа каждая, T-003/T-006/T-007 на верхней границе (4 часа)
- **Build stability:** `pnpm build` на каждом коммите
- **Test stability:** все тесты deterministic, no flaky tests
- **Code quality:** ESLint pass, no `any` types, barrel exports

---

## 8. Risks and Edge Cases

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| sqlite-vec не работает на Windows (R-ARCH-01) | 30% | Medium | Т-003: fallback на in-process vector search (brute-force cosine similarity) |
| Ollama недоступен для embeddings | 40% | Medium | T-002: EmbeddingFallbackChain -> Yandex -> ONNX |
| Разные размерности векторов (768 vs 256 vs 384) | 20% | High | VectorStorage валидирует dimension при upsert; embed provider fixed dimension |
| Token estimation неточен | 30% | Low | Использовать保守ную оценку (1 token = 4 chars); reservedForResponse buffer |
| Summarization LLM вызов занимает время | 40% | Medium | Trigger только при 80% threshold; stub для TDD; реальный вызов в F-008 |
| Graceful degradation при полной недоступности vector storage | 10% | Low | Memory Manager работает без RAG (direct SQLite query по tags) |
| 50K+ memory entries performance | 15% | Medium | sqlite-vec handles millions; индексы в SQLite; benchmark в T-003 |

---

## 9. Notes

1. **Адаптация профиля:** PROJECT_PROFILE назначает DOMAIN-004 профиль `backend-typescript`. Специфические требования: SQLite (не PostgreSQL), pino (не Winston), better-sqlite3 синхронный API.
2. **sqlite-vec:** Используется как SQLite extension. Необходима проверка совместимости с better-sqlite3 на Windows (R-ARCH-01).
3. **Fact Extraction:** Реализуется с stub для LLM в T-008. Полная интеграция с Agent Runtime в F-008.
4. **Summarization:** Trigger в Context Window Manager, но реальная summarization требует LLM вызова. Реализуется как injectable dependency.
5. **Qdrant:** Опциональный vector storage (AD-002). Не входит в MVP scope. Interface позволяет добавить adapter позже.
6. **RAG Pipeline timing:** NFR-P02 -- RAG query <= 200ms для 10K записей. sqlite-vec embedded должен удовлетворять это требование.
