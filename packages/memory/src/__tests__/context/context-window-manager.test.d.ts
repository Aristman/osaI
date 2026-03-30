/**
 * T-007: Context Window Manager -- Auto-Pruning + Summarization
 *
 * Test cases from ROADMAP_TASKS_F-005.md:
 *   TC-001: buildContext() оставляет system prompt без изменений
 *   TC-002: buildContext() при превышении 80% threshold запускает summarization (trigger)
 *   TC-003: pruneByPriority() сначала удаляет LT RAG results, потом KB chunks
 *   TC-004: pruneByPriority() оставляет последние N tool calls
 *   TC-005: reservedForResponse=1024 резервирует токены для ответа
 *   TC-006: buildContext() с историей < maxTokens не обрезает
 *   TC-007: estimateTokens() корректно оценивает количество токенов
 *   TC-008: pruneByPriority() с minMessages=4 оставляет минимум 4 сообщения
 */
export {};
//# sourceMappingURL=context-window-manager.test.d.ts.map