/**
 * Unit tests for FactExtractor
 *
 * Covers: T-007 Fact Extraction acceptance criteria
 *   - TC-007-1: Extracts facts from assistant response
 *   - TC-007-2: Calls AFTER_MEMORY_QUERY hook with facts
 *   - TC-007-3: Delegates saving to Memory System via storeFacts
 *   - TC-007-4: Error in extraction does not block loop (graceful degradation)
 *   - TC-007-5: Empty response -- no facts extracted
 *
 * Mock strategy: HookRegistry is real, StoreFactsFunction is fully mocked.
 */
export {};
//# sourceMappingURL=FactExtractor.test.d.ts.map