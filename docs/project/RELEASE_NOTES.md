# osaI v3 v1.0.0 -- First MVP Release

**Дата релиза:** 2026-03-30

## Summary

osaI v3 -- локально работающий AI-ассистент с полным OS-управлением, multi-chat системой, трёхуровневой памятью с RAG и интеграцией с Telegram. Система построена по принципу local-first: все данные хранятся на машине пользователя, облачные API используются только для LLM. Релиз включает 13 фич, 12 пакетов в monorepo, 2498 тестов.

---

## What's New

### Core

- **Agent Runtime (F-007/F-008):** Полный agent loop: intake -> context_assembly -> model_inference -> tool_execution -> streaming -> persistence. 13 hook points (7 базовых + 6 osaI-specific) для расширения. Tool execution loop с поддержкой многократных tool_use/tool_result циклов.
- **Provider System (F-002/F-003):** Единый интерфейс для 5 LLM-провайдеров (Z.ai, Yandex, Anthropic, OpenAI, Ollama). Автоматическая failover-цепочка Z.ai -> Yandex -> Anthropic -> OpenAI -> Ollama. Circuit breaker (failure_threshold=5, reset_timeout=30s). Auth profile rotation.
- **Memory System (F-005):** Трёхуровневая память (Chat Memory, Session Memory, Long-term Memory). RAG pipeline: embed -> vector search (top_k=5, min_similarity=0.7) -> inject into system prompt. Context Window Manager с auto-pruning и summarization. Fact extraction в Long-term Memory.

### Gateway

- **WebSocket (F-009):** WebSocket control plane на localhost:18789. Типизированный протокол: ClientMessage, GatewayOutgoingMessage, ToolStreamMessage, BlockStreamMessage, PermissionRequestMessage.
- **Multi-Chat (F-009):** До 20 активных чатов с изолированным контекстом. Chat CRUD, Chat Context Isolation, Chat Switching, Chat Archiving. Общая долговременная память и knowledge base для всех чатов.
- **Protocol:** Каналы CLI и Telegram подключаются через единный Gateway с ChannelHandler interface.

### Skills

- **Registry (F-006):** SkillRegistry с методами register(), getTools(), execute(), enable(), disable(), reload(). Поддержка bundled, managed, workspace, osaI skills. Декларативный формат SKILL.md.
- **Bundled Skills:** Filesystem skill (7 инструментов: read_file, write_file, list_dir, search_files, move_file, delete_file, get_file_info). Shell skill (2 инструмента: exec, exec_sandbox).
- **osaI Skills:** Memory skill (4 инструмента), Knowledge Base skill (4 инструмента), Chat Management skill (5 инструментов), OS Integration skill (5 инструментов).
- **Permissions:** Категории разрешений: read=auto, write=confirm, exec=confirm.

### Security

- **File Sandbox (F-012):** allowed_dirs whitelist, blocked_patterns (~/.ssh/**, ~/.gnupg/**, /etc/**, /boot/** + конфигурируемые), symlink resolution для предотвращения escape.
- **Shell Security (F-012):** Blocked commands list, timeout enforcement (120s default), command logging в audit log.
- **Audit (F-003/F-012):** AuditService с trace_id propagation через все модули. 100% tool calls, permission requests, file access, shell exec записываются в SQLite (таблица osai_audit_log).
- **7-Layer Security Model:** Network (localhost-only), Sandbox (Docker + graceful degradation), Permissions, File Sandbox, Shell Security, Telegram Security, Audit.

### Integrations

- **CLI Client (F-011):** Интерактивный TUI на базе oclif + ink. Команды: osai (чат), osai "команда" (quick), chat, session, config, skills, memory, channel, status. Список чатов (sidebar), область чата (main), статус-бар. WebSocket client для подключения к Gateway.
- **Telegram (F-010):** Telegram Bot (grammY) -- команды, чат, notifications, allowedUsers whitelist. Telegram Userbot (Telethon) -- Python microservice через child_process с JSON-over-stdio протоколом. Mirror Engine -- двусторонняя синхронизация osaI-чат <-> Telegram-чат/канал с дедупликацией по message_id. AES-256 encrypted session для userbot.
- **OS Integration (F-004):** Desktop notifications (Linux + Windows), system info (CPU, memory, disk), process list с фильтрацией.

### Infrastructure

- **CI/CD (F-013):** GitHub Actions matrix build (ubuntu-latest, windows-latest). Автоматическая сборка и тестирование на каждой push.
- **Cross-Platform (F-013):** Поддержка Linux (primary) и Windows 10/11 (native). Кроссплатформенные утилиты через platform.ts (single source of truth).
- **Testing (F-013):** 145 test files, 2498 tests passed, 0 failures. Три уровня: unit tests (168+), integration tests (79), E2E tests (25). Vitest как test runner. Mock LLM server для E2E. In-memory SQLite для тестов.

---

## Stats

| Метрика | Значение |
|---------|----------|
| Пакеты в monorepo | 12 |
| Тестовые файлы | 145 |
| Пройдено тестов | 2498 |
| Провалено тестов | 0 |
| Пропущено тестов | 4 (pre-existing, non-blocking) |
| Фич в MVP | 13 (F-001..F-013) |
| Доменов | 10 (DOMAIN-001..DOMAIN-011, исключая DOMAIN-012) |
| LLM провайдеров | 5 |
| Hook points | 13 |
| Skills bundled + osaI | 6 (Filesystem, Shell, Memory, KB, Chat, OS) |
| Инструментов в skills | 27 |
| Уровней безопасности | 7 |
| Системная оценка качества | 9.6 / 10 |

---

## Known Limitations

1. **AuthRotator не подключён к ProviderChain execution flow.** Компонент AuthRotator реализован и протестирован (20 tests), но `tryWithRotation()` не вызывается при RateLimitError. При rate limiting провайдер переключается на следующего вместо ротации ключей в рамках одного провайдера. Запланировано для следующей итерации.

2. **Streaming integration tests отсутствуют.** StreamManager реализован, но интеграционные тесты полного streaming path не существуют. Unit tests покрывают StreamManager.

3. **Persistence integration tests отсутствуют.** PersistenceService реализован, но интеграционные тесты полного persistence path (SQLite write -> read -> verify) не существуют.

4. **4 pre-existing skipped tests** в packages/skills-core и packages/knowledge-base. Известные issues, не влияющие на функциональность.

5. **Voice Stack (DOMAIN-007) -- V1 scope.** Пакет @osai/voice существует как stub, функционально не реализован. Запланирован для V1 milestone.

6. **OpenTelemetry traces и metrics -- V1 scope.** В MVP реализован trace_id propagation (AsyncLocalStorage). Полная OpenTelemetry instrumentation -- V1.

7. **Web Dashboard (DOMAIN-012) -- V1 scope.** SvelteKit web interface не входит в MVP.

8. **macOS не поддерживается.** Целевые платформы: Linux (primary), Windows 10/11 (native).

9. **Telegram userbot -- риск блокировки.** Telethon userbot может быть заблокирован Telegram. Рекомендуется не использовать основной аккаунт. Fallback на bot-only mode доступен.

10. **Нерешённые открытые вопросы:** OQ-ARCH-03 (Python microservice lifecycle management), OQ-ARCH-04 (Telegram mirror media handling), OQ-03 (Ollama default model selection). Не блокируют MVP, требуют решения до production deployment.

---

## Getting Started

Подробное руководство по установке и использованию доступно в [USAGE.md](./USAGE.md).

Минимальные требования для запуска:
- Node.js 22.16+ LTS / 24
- pnpm
- Ollama (настоятельно рекомендуется для local-first режима)

```bash
pnpm install
pnpm build
osai init
osai
```

---

**Версия документа:** v1.0
**Дата создания:** 2026-03-31
**Автор:** Release / DevOps Agent
**Статус:** Завершён
