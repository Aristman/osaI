# Test Report -- T-006

**Version:** v1.0
**Date:** 2026-03-25
**Task ID:** T-006
**Task Name:** Build and Run Verification
**Feature:** F-001 Monorepo Infrastructure

---

## Build Verification

### T006-B01: npm install

- **Command:** `npm install`
- **Status:** PASS
- **Output:** `up to date, audited 207 packages in 6s, found 0 vulnerabilities`
- **Duration:** ~6s
- **Exit Code:** 0

### T006-B02: npm run lint

- **Command:** `npm run lint` (eslint . --max-warnings=0)
- **Status:** PASS
- **Output:** (no output -- clean exit)
- **Duration:** ~1s
- **Exit Code:** 0
- **Warnings:** 0
- **Errors:** 0

### T006-B03: npm run typecheck

- **Command:** `npm run typecheck` (tsc --build tsconfig.build.json)
- **Status:** PASS
- **Output:** (no output -- clean exit)
- **Duration:** ~1s
- **Exit Code:** 0

### T006-B04: npm run test

- **Command:** `npm run test` (vitest run via workspaces)
- **Status:** PASS
- **Output:**
  ```
  Test Files  5 passed (5)
       Tests  40 passed (40)
    Duration  163ms
  ```
- **Duration:** 163ms
- **Exit Code:** 0

### T006-B05: npm run build

- **Command:** `npm run build` (tsup via workspaces)
- **Status:** PASS
- **Output:**
  ```
  ESM dist/index.js     33.00 B
  ESM dist/index.js.map 71.00 B
  CJS dist/index.cjs     792.00 B
  CJS dist/index.cjs.map 1.01 KB
  DTS dist/index.d.ts  4.84 KB
  DTS dist/index.d.cts 4.84 KB
  ```
- **Duration:** ~368ms
- **Exit Code:** 0
- **Artifacts:** 6 файлов в dist/

### T006-B06: npm run verify (aliased script)

- **Command:** `npm run verify`
- **Status:** PASS
- **Output:** lint + typecheck + test + build -- все PASS
- **Duration:** ~3s
- **Exit Code:** 0

---

## Import Verification

### T006-I01: @osai/types CJS import

- **Command:** `node -e "const types = require('./packages/types/dist/index.cjs')"`
- **Status:** PASS
- **Output:** `CJS import OK, keys: []`
- **Exit Code:** 0
- **Notes:** keys: [] -- ожидаемо для type-only exports

### T006-I02: @osai/types ESM import

- **Command:** `node --input-type=module -e "import * as m from './packages/types/dist/index.js'"`
- **Status:** PASS
- **Output:** `ESM import OK, keys: []`
- **Exit Code:** 0
- **Notes:** keys: [] -- ожидаемо для type-only exports

---

## Integration Verification

### T006-INT01: Workspace resolution

- **Command:** `npm ls --workspaces --depth=0`
- **Status:** PASS
- **Output:** `@osai/types@0.0.1 -> ./packages/types`
- **Exit Code:** 0

### T006-INT02: npm run ci (composite script)

- **Command:** `npm run ci`
- **Status:** PASS
- **Output:** lint + typecheck + test + build -- все PASS
- **Duration:** ~3s
- **Exit Code:** 0

---

## Additional Verification

### T006-ADD01: format:check

- **Command:** `npm run format:check` (prettier --check .)
- **Status:** FAIL
- **Output:** 46 files with formatting issues (docs/, specs/, roadmaps/, tsconfig)
- **Exit Code:** 1
- **Notes:** Не блокирует lint (ESLint). Форматирование docs/specs не входит в scope. Source code отформатирован корректно.

### T006-ADD02: Node.js version

- **Command:** `node -v`
- **Status:** PASS (информационно)
- **Output:** v24.13.0
- **Notes:** Локальная версия новее целевой (20 LTS). CI тестирует Node.js 20 и 22.

---

## Summary

| Category | Total | PASS | FAIL |
|----------|-------|------|------|
| Build Verification | 6 | 6 | 0 |
| Import Verification | 2 | 2 | 0 |
| Integration Verification | 2 | 2 | 0 |
| Additional Verification | 2 | 1 | 1 |
| **TOTAL** | **12** | **11** | **1** |

**Overall Status:** PASS

Единственный FAIL (format:check) -- не блокирует lint/build/test и не входит в критерии приёмки задачи T-006.
