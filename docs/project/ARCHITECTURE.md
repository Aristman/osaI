# Architecture -- osaI v3

**Дата:** 2026-03-31
**Версия системы:** 3.0.0
**Статус:** верифицирована (System Quality Score: 9.6/10)

---

## System Context Diagram

```
+------------------------------------------------------------------+
|                     USER MACHINE (Linux / Windows)                |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |                    osaI SYSTEM                           |   |
|  |                                                          |   |
|  |  +--------+  +--------+  +----------+                    |   |
|  |  | CLI    |  | TG Bot |  | TG User  |                    |   |
|  |  | Client |  | (grammY)|  | (Telethon)|                   |   |
|  |  +---+----+  +---+----+  +----+-----+                    |   |
|  |      |            |             |                          |   |
|  |  +---v------------v-------------v---------------------+  |   |
|  |  |              GATEWAY (WS Control Plane)           |  |   |
|  |  |              ws://127.0.0.1:18789                 |  |   |
|  |  +------------------------+---------------------------+  |   |
|  |                           |                              |   |
|  |  +------------------------v---------------------------+  |   |
|  |  |              AGENT RUNTIME                       |  |   |
|  |  |  intake -> context -> inference -> tools ->       |  |   |
|  |  |   streaming -> persistence                        |  |   |
|  |  +--------+----------+-----------+------------------+  |   |
|  |           |          |           |                      |   |
|  |  +--------v--+ +-----v-----+ +--v-----------+           |   |
|  |  | Skills    | | LLM       | | Memory       |           |   |
|  |  | System    | | Providers  | | System       |           |   |
|  |  |           | | (failover) | | (RAG)        |           |   |
|  |  +--------+--+ +-----+-----+ +--+-----------+           |   |
|  |           |          |           |                      |   |
|  |  +--------v----------v-----------v------------------+  |   |
|  |  |              INFRASTRUCTURE                      |  |   |
|  |  |  SQLite (WAL) | sqlite-vec | pino | Audit Log    |  |   |
|  |  +--------------------------------------------------+  |   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  External: Ollama | Docker (opt.) | whisper.cpp (V1) | Piper (V1)|
+------------------------------------------------------------------+

  Cloud APIs: Z.ai | Yandex | Anthropic | OpenAI | Telegram
```

**Принцип:** local-first. Все данные хранятся на машине пользователя. Облачные API используются только для LLM inference, embeddings и Telegram.

---

## Component Overview (12 packages)

| Пакет | Домен | Ответственность |
|---|---|---|
| `@osai/gateway` | DOMAIN-001 | WebSocket control plane, channel routing, chat CRUD, session management |
| `@osai/agent` | DOMAIN-002 | Agent loop, hook system (13 точек), context assembly, tool execution |
| `@osai/skills-core` | DOMAIN-003 | Bundled skills: Filesystem (7 tools), Shell (2 tools), Security |
| `@osai/skills-osai` | DOMAIN-003 | osaI skills: Memory, KB, Chat Management, OS Integration |
| `@osai/providers` | DOMAIN-008 | 5 LLM-провайдеров, failover chain, circuit breaker, auth rotation |
| `@osai/memory` | DOMAIN-004 | Three-tier memory, RAG pipeline, embeddings, context window manager |
| `@osai/knowledge-base` | DOMAIN-005 | Document ingestion, semantic search, source management |
| `@osai/os-integration` | DOMAIN-009 | Desktop notifications, system info, process list |
| `@osai/observability` | DOMAIN-010 | pino structured logging, audit logging, trace context |
| `@osai/cli` | DOMAIN-011 | Interactive TUI (ink), CLI commands, WS client |
| `@osai/shared` | shared | Database schema, migrations, platform utilities, shared types |
| `@osai/voice` | DOMAIN-007 | STT/TTS (V1 milestone, stub в MVP) |

### Dependency Graph

```
cli --> gateway --> agent --> providers
                  |        |-> skills-core
                  |        |-> skills-osai --> memory --> knowledge-base
                  |        |-> memory
                  |        |-> observability
                  |-> os-integration
                  |-> observability

providers --> observability
memory --> observability
skills-osai --> memory, knowledge-base, gateway
```

Внедрение зависимостей через constructor-based DI. Barrel exports (index.ts) в каждом пакете. ESM throughout.

---

## Data Flow

### Основной поток: запрос пользователя

```
User -> Channel Handler -> Chat Router -> Agent Runtime
                                          |
                                     Context Assembly
                                     (chat messages + RAG + KB)
                                          |
                                     Model Inference
                                     (Provider Chain + failover)
                                          |
                                     Tool Execution (if tool_use)
                                          |
                                     Streaming Response
                                     -> Gateway -> Channel -> User
                                          |
                                     Persistence (SQLite)
                                          |
                                     Fact Extraction (long-term memory)
```

### RAG Pipeline

```
1. before_memory_query hook
2. Embed user message (Ollama nomic-embed-text, 768-dim)
3. Vector search in sqlite-vec (top_k=5, similarity > 0.7)
4. Filter + return relevant memories + KB chunks
5. Inject into system prompt (before_prompt_build hook)
6. After tool execution: extract facts -> long-term memory
```

### Telegram Mirror

```
Telegram Message -> Bot/Userbot Handler -> Mirror Engine -> Gateway
  -> Agent Runtime -> Mirror Engine -> Telegram Delivery
```

Mirror: bidirectional sync с дедупликацией по message_id. Конфигурируемое направление: both | osai-to-tg | tg-to-osai.

---

## Database Schema Overview

Единая SQLite БД: `~/.osai/data/osai.db` (WAL mode).

| Таблица | Описание | Ключевые поля |
|---|---|---|
| `chats` | Чаты | id, name, description, tags, icon, color, channel, is_active |
| `chat_messages` | Сообщения | id, chat_id, role, content, tool_calls (JSON), metadata (JSON) |
| `memory_entries` | Долгосрочная память | id, content, embedding, category, tags, source_chat_id, access_count |
| `knowledge_documents` | Документы KB | id, title, path, chunks_count, tags |
| `knowledge_chunks` | Чанки документов | id, document_id, content, embedding_id, chunk_index |
| `osai_audit_log` | Аудит лог | session_id, chat_id, timestamp, trace_id, action, tool_name, params, result |

Векторные данные хранятся через sqlite-vec extension в той же БД.

---

## Security Architecture (7 layers)

```
Layer 1: Network
  WS server только на 127.0.0.1:18789
  Нет внешнего доступа без Tailscale (V1)

Layer 2: Sandbox
  Docker containers для non-main sessions
  Graceful degradation: без Docker -- только permission prompts

Layer 3: Permissions
  Category-based: read=auto, write=confirm, exec=confirm
  Desktop notification для permission requests

Layer 4: File Sandbox
  allowed_dirs whitelist (конфигурируемый)
  blocked_patterns: ~/.ssh/**, ~/.gnupg/**, /etc/**, /boot/**
  Symlink resolution (предотвращение escape)

Layer 5: Shell Security
  Blocked commands list (hardcoded + configurable)
  Timeout enforcement (120s default)
  Command logging в audit log

Layer 6: Telegram Security
  Bot: allowedUsers whitelist
  Userbot: AES-256 encrypted session storage
  Rate limiting

Layer 7: Audit
  Все действия логируются с trace_id
  Хранение в SQLite (osai_audit_log)
  100% coverage: tool calls, permissions, file access, shell exec
```

---

## Provider Chain (failover strategy)

```
Request -> Z.ai (OpenAI-совместимый, https://api.z.ai/api/paas/v4, glm-5)
  |  OK -> response
  |  Rate Limit -> auth rotation + retry
  |  Error -> Yandex Foundation Models
  |            |  Error -> Anthropic Claude
  |            |            |  Error -> OpenAI GPT
  |            |            |            |  Error -> Ollama (local)
  |            |            |            |            |  response
  |            |            |            |  Timeout -> Ollama (local)
  |            |            |  Timeout -> Ollama (local)
  |            |  Timeout -> Ollama (local)
  |  Timeout -> Ollama (local)
```

**Circuit Breaker:**
- failure_threshold: 5 последовательных ошибок
- reset_timeout: 30 000 ms
- State machine: closed -> open -> half-open
- Пробный запрос в half-open состоянии

**Auth Rotation:**
- Несколько API-ключей для одного провайдера
- Автоматическая смена при rate limit (компонент реализован, wiring к chain -- TODO)

---

## Memory System (3-tier + RAG)

```
+--------------------------------------------------------------+
|                    MEMORY SYSTEM                               |
|                                                               |
|  CHAT MEMORY          SESSION MEMORY        LONG-TERM MEMORY |
|  (per-chat)           (per-session)         (shared)         |
|  - messages[]         - tool results        - facts          |
|  - chat state         - session state       - preferences    |
|  - chat context       - channel ctx         - knowledge      |
|                        TTL: session          TTL: permanent   |
|                                                               |
|  SQLite: chats/chat_messages  SQLite: sessions     SQLite +   |
|                                 + tool_results       sqlite-vec|
|                                                               |
|  +------------------------------------------------------+   |
|  | Embeddings (Ollama nomic-embed-text 768-dim)          |   |
|  |   Fallback: Yandex (256-dim) -> ONNX (384-dim)        |   |
|  | Vector Storage: sqlite-vec (primary), Qdrant (opt.)    |   |
|  | Context Window Manager: auto-pruning + summarization   |   |
|  +------------------------------------------------------+   |
+--------------------------------------------------------------+
```

**Context Window Manager** -- приоритет обрезки:
1. Long-term memory RAG results
2. Knowledge base chunks
3. Tool execution history
4. Early conversation history (summarize, не удалять)
5. System prompt -- никогда не обрезается

Параметры: `maxTokens` (зависит от модели), `reservedForResponse: 1024`, `summarizationThreshold: 80%`.

---

## Skills System

### Bundled Skills (skills-core)

| Skill | Tools | Permissions |
|---|---|---|
| Filesystem | read_file, write_file, list_dir, search_files, move_file, delete_file, get_file_info | read=auto, write=confirm |
| Shell | exec, exec_sandbox | Always confirm |

### osaI Skills (skills-osai)

| Skill | Tools |
|---|---|
| Memory | remember, recall, forget, summarize_session |
| Knowledge Base | ingest_document, query_knowledge, list_sources, remove_source |
| Chat Management | chat_list, chat_create, chat_switch, chat_archive, chat_delete |
| OS Integration | show_notification, list_processes, open_application, get_system_info |

### SkillRegistry Interface

```typescript
register(skillDef: SkillDefinition): void;
getTools(): ToolDefinition[];
execute(name: string, params: Record<string, unknown>): Promise<ToolResult>;
enable(name: string): void;
disable(name: string): void;
reload(): void;
```

SKILL.md -- декларативный формат описания skills. Skills сканируются из bundled, workspace, osaI директорий.

---

## Non-Functional Considerations

| Атрибут | Достижение |
|---|---|
| TTFT overhead | <= 500ms сверх LLM latency (прямой вызов, без прокси) |
| RAG query | <= 200ms для 10K записей (sqlite-vec, in-process) |
| Failover time | <= 10s (circuit breaker + timeout) |
| Data persistence | Zero data loss (SQLite WAL) |
| Build | 0 ошибок, 12 пакетов, TypeScript strict |
| Tests | 145 файлов, 2498 passed, 0 failures |
| Security | 7-layer model, полностью реализована |

---

## Architectural Decisions

| ID | Решение | Обоснование |
|---|---|---|
| AD-001 | Самостоятельная разработка core | OpenClaw upstream не существует |
| AD-002 | sqlite-vec как primary vector storage | Qdrant не имеет embedded mode для Node.js |
| AD-003 | whisper.cpp + Piper через child_process | Ollama не поддерживает STT/TTS |
| AD-004 | Z.ai как primary (конфигурируемый baseURL) | Верифицирован, OpenAI-совместимый |
| AD-005 | Модульный монолит | Solo developer, local-first, single-user |
| AD-006 | Telethon через child_process stdio | Самый простой и безопасный bridge |
| AD-007 | SQLite WAL mode | Concurrent reads, crash recovery |
| AD-008 | Единая SQLite БД | Упрощает backup, транзакции, sqlite-vec |

---

**Версия документа:** v1.0
**Источник:** ARCHITECTURE_OVERVIEW.md, SYSTEM_VERIFICATION.md, PROJECT_PROFILE.md
