# Implementation Report — T-007

**Feature:** F-013 Cross-Platform + Testing
**Task:** T-007 GitHub Actions CI — Linux + Windows Matrix
**Domain:** Cross-cutting
**Date:** 2026-03-30
**Iteration:** 2

---

## Implemented Scope

Реализована полная конфигурация CI pipeline для GitHub Actions с matrix-стратегией
(ubuntu-latest + windows-latest), настроен Dependabot для автоматических обновлений
зависимостей, обновлён package.json (скрипт check:native + devDependency tsx),
создан скрипт проверки native modules.

Реализовано строго в рамках checklist roadmap T-007, без расширения scope.

**In scope:**
- `.github/workflows/ci.yml` — matrix CI pipeline
- `.github/dependabot.yml` — автоматические обновления
- `scripts/check-native-modules.ts` — верификация native модулей
- `package.json` — скрипт `check:native`, devDependency `tsx`

**Out scope (по roadmap):**
- Release pipeline
- Docker build
- Deployment

---

## Tests Implemented

Для данной задачи (CI инфраструктура) тесты в формате vitest не применимы.
Верификация корректности:

- `.github/workflows/ci.yml` — валидный YAML с корректными action references
- `scripts/check-native-modules.ts` — скрипт доступен через `pnpm check:native`
- `.github/dependabot.yml` — валидный YAML, соответствует Dependabot v2 spec

---

## Code Changes

### Files Added

| Файл | Описание |
|------|----------|
| `.github/workflows/ci.yml` | CI pipeline: matrix ubuntu/windows, Node 22, pnpm 9, build, check:native, test (unit/integration/e2e), coverage artifact |
| `.github/dependabot.yml` | Weekly dependabot для npm (monday 09:00 UTC) и github-actions |
| `scripts/check-native-modules.ts` | TypeScript ESM скрипт: проверяет загрузку better-sqlite3 и sqlite-vec, выводит платформу/версию/статус, exit 0/1 |

### Files Modified

| Файл | Изменение |
|------|-----------|
| `package.json` | Добавлен скрипт `check:native`: `tsx scripts/check-native-modules.ts` |
| `package.json` | Добавлен `tsx` (^4.19.0) в devDependencies |

---

## Architectural Compliance

- **Trigger:** push/PR к OSAI-DEV-V3 (согласно roadmap)
- **Matrix:** ubuntu-latest + windows-latest, fail-fast: false
- **Node.js 22 LTS + pnpm 9** — соответствует packageManager в package.json
- **Кеширование pnpm store** — по хешу pnpm-lock.yaml, сокращает время CI
- **Concurrency control** — cancel-in-progress для экономии runner-minutes
- **Coverage artifact** — upload при любом исходе (if: always()), 7 дней retention
- **Native modules step** — отдельный шаг до тестов для раннего обнаружения проблем
- **frozen-lockfile** — воспроизводимость сборки
- **Профиль nodejs (fallback для backend-typescript):** TypeScript strict, ESM modules, pnpm — соблюдены
- **shell: bash** для cross-platform совместимости get-pnpm-store шага

---

## Deviations

Отсутствуют. Реализация следует спецификации из roadmap T-007.

---

## Known Limitations

- `.nvmrc` содержит только `22` вместо `22.16.0`. В CI `actions/setup-node@v4`
  установит последнюю 22.x LTS, что соответствует roadmap требованию
  "Node.js 22.16+ LTS".
- Скрипт `check-native-modules.ts` использует `createRequire` для загрузки CJS
  native modules в ESM контексте. При отсутствии better-sqlite3/sqlite-vec
  в node_modules скрипт вернёт FAIL — ожидаемое поведение до добавления
  соответствующих dependencies.
- Coverage report будет пустым до реализации T-001 (vitest config) и
  тестовых задач T-002..T-005.
- CI timeout не задан явно — используются GitHub Actions defaults (6 часов).
  Roadmap цель: CI завершается за <= 15 минут.
- macOS не включён в матрицу (out scope по roadmap).
