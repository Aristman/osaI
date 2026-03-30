# Project Context

**Дата:** 2026-03-30
**Проект:** osaI v3 — AI Operating System
**Статус:** Проектирование (код не написан, артефакты в docs/)

---

## Tech Stack

- **Runtime:** Node.js 22.16+ LTS / 24
- **Language:** TypeScript 5.x (strict mode)
- **Package Manager:** pnpm workspace monorepo
- **Database:** better-sqlite3 (SQLite WAL mode), sqlite-vec (vector search)
- **WebSocket Gateway:** ws
- **Logging:** pino (structured JSON)
- **CLI Framework:** oclif + ink (TUI)
- **Telegram Bot:** grammY
- **Telegram Userbot:** Telethon (Python microservice via child_process)
- **OS Integration:** node-notifier, systeminformation, systray2 (V1)
- **HTTP Client:** undici
- **Testing:** vitest (unit + integration + e2e)

### LLM Providers (failover chain)

1. Z.ai — primary (OpenAI-compatible, endpoint: `https://api.z.ai/api/paas/v4`, model: `glm-5`)
2. Yandex Foundation Models — fallback 1 (+ embeddings + STT/TTS)
3. Anthropic Claude — fallback 2
4. OpenAI GPT — fallback 3
5. Ollama — local offline fallback

### Voice Stack (V1)

- STT: whisper.cpp (child_process) → Yandex SpeechKit (fallback)
- TTS: Piper TTS (child_process) → Yandex SpeechKit (fallback)

---

## Architecture

**Pattern:** Modular monolith в pnpm workspace monorepo

### Package Structure

```
packages/
  gateway/          DOMAIN-001: WS Control Plane (ws://127.0.0.1:18789)
  agent/            DOMAIN-002: Agent Runtime + 13 hook points
  skills-core/      DOMAIN-003: Bundled Skills (Filesystem, Shell)
  skills-osai/      DOMAIN-003: osaI Skills (Memory, KB, Chat, OS)
  providers/        DOMAIN-008: LLM Providers + Failover + Circuit Breaker
  memory/           DOMAIN-004: Three-tier Memory + RAG + Embeddings
  knowledge-base/   DOMAIN-005: Document Ingestion + Semantic Search
  os-integration/   DOMAIN-009: Notifications, System Info, Processes
  voice/            DOMAIN-007: STT/TTS (V1)
  observability/    DOMAIN-010: pino + Audit + OpenTelemetry (V1)
  cli/              DOMAIN-011: Interactive CLI + TUI
```

### Key Patterns

- Event-driven (13 hook points)
- Plugin architecture (SKILL.md format)
- Adapter pattern (LLM providers)
- Bridge pattern (Telethon userbot via child_process stdio)
- Strategy pattern (vector storage, embeddings, STT/TTS)

### Data Storage

- Single SQLite DB: `~/.osai/data/osai.db` (WAL mode)
- Config: `~/.osai/osai.json`
- Logs: `~/.osai/logs/`
- TG sessions: `~/.osai/channels/telegram/session/` (encrypted)

---

## Conventions

- TypeScript strict mode (`"strict": true`)
- pino structured JSON logging with correlation IDs
- 7-layer security model
- Category-based permissions (read=auto, write=confirm, exec=confirm)
- All actions audited with trace_id
- Graceful degradation for all components

---

## Commands

**Build:** `pnpm build` (не настроен — код не написан)
**Run:** `osai start` (gateway daemon) / `osai` (interactive CLI)
**Test:** `pnpm test` / `vitest` (не настроен — код не написан)
**Config:** `osai init` (creates ~/.osai/ with defaults)
**CI:** GitHub Actions (ubuntu-latest, windows-latest)

---

## Key Artifacts

| Артефакт | Путь |
|---|---|
| Project Profile | docs/project/PROJECT_PROFILE.md |
| Technical Requirements | docs/project/TECH_REQUIREMENTS.md |
| Scope | docs/project/SCOPE.md |
| Architecture | docs/project/ARCHITECTURE_OVERVIEW.md |
| Features Index | docs/project/FEATURES_INDEX.md |
| Specification | docs/specs/spec_osai_v3_2026-03-28.md |
| Pipeline Prompt | docs/project/PIPELINE_PROMPT.md |
