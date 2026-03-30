/**
 * Unit tests for ToolExecutor
 *
 * Covers: T-005 Tool Execution Loop acceptance criteria
 *   - TC-005-1: tool_use -> execute -> result -> re-inference (LLM called twice)
 *   - TC-005-2: Multiple tool_use in one response (all tools executed)
 *   - TC-005-3: before_tool_execution hook called before each tool
 *   - TC-005-4: after_tool_execution hook called after each tool
 *   - TC-005-5: Tool result appended to messages as tool role message
 *   - TC-005-6: Max iterations guard (default 10) breaks the loop
 *   - TC-005-7: No tool_use -> loop does not start (single inference pass)
 *   - TC-005-8: Tool execution error -> logged, loop continues
 *
 * Mock strategy: InferenceService and SkillRegistry are fully mocked.
 * HookRegistry is real (lightweight, no external deps).
 */
export {};
//# sourceMappingURL=ToolExecutor.test.d.ts.map