# Implementation Report -- T-007: Fact Extraction

**Date:** 2026-03-30
**Task ID:** T-007
**Feature:** F-008 Agent Runtime
**Domain:** DOMAIN-002
**Status:** Implemented

---

## Scope

Implemented fact extraction from LLM responses using pattern-based heuristics (MVP).

### Files Created

| File | Description |
|------|-------------|
| `packages/agent/src/memory/types.ts` | Fact, FactCategory, ExtractionResult, StoreFactsFunction types |
| `packages/agent/src/memory/FactExtractor.ts` | FactExtractor class with extract(), storeFacts(), extractAndStore() |
| `packages/agent/src/memory/index.ts` | Barrel export for memory module |
| `packages/agent/src/memory/__tests__/FactExtractor.test.ts` | Unit tests (15 test cases) |

### Files Modified

| File | Change |
|------|--------|
| `packages/agent/src/index.ts` | Added FactExtractor export and memory types |

---

## Implementation Details

### FactExtractor

- **Constructor DI:** optional `StoreFactsFunction`, mandatory `HookRegistry`
- **`extract(response, chatId, sessionId)`**: pattern-based heuristic extraction
  - Calls `BEFORE_FACT_EXTRACTION` hook
  - Runs 6 extraction patterns (dates, names, numbers with units, preferences, explicit facts)
  - Calls `AFTER_MEMORY_QUERY` hook with extracted facts
  - Returns `Fact[]`
- **`storeFacts(facts)`**: delegates to injectable store function
  - Graceful degradation on error (logs, does not throw)
- **`extractAndStore(response, chatId, sessionId)`**: convenience method
  - Combines extract + store in one call
  - Returns `ExtractionResult` with facts, count, errors

### Extraction Patterns (MVP)

1. ISO dates: `\d{4}-\d{2}-\d{2}`
2. Long dates: `March 15, 2026`
3. Names: `My name is Alex`, `I am Bob`
4. Numbers with units: `5000 USD`, `30 days`
5. Preferences: `I prefer...`, `I like...`, `I always...`
6. Explicit facts: `Remember that...`, `Important:...`

### Types

- `Fact`: id, content, category, chatId, sessionId, extractedAt, confidence
- `FactCategory`: `'name' | 'date' | 'number' | 'preference' | 'explicit' | 'unknown'`
- `ExtractionResult`: facts, count, hasErrors, errors
- `StoreFactsFunction`: injectable function for memory system integration

---

## Compliance

- TypeScript strict mode: yes
- DI via constructor: yes (HookRegistry, StoreFactsFunction)
- Graceful degradation: yes (storeFacts catches errors)
- Hook integration: yes (BEFORE_FACT_EXTRACTION, AFTER_MEMORY_QUERY)
- No external dependencies: yes (only node:crypto)
- Barrel exports: yes

---

## Deviations from Roadmap

None. Implementation follows ROADMAP_TASKS_F-008.md T-007 specification exactly.
