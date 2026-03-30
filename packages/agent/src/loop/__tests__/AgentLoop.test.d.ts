/**
 * Unit tests for AgentLoop
 *
 * Covers: T-004 Agent Loop Core acceptance criteria
 *   - TC-004-1: run() executes full pipeline
 *   - TC-004-2: BEFORE_INTAKE hook called at start
 *   - TC-004-3: agent_end hook called on success
 *   - TC-004-4: on_error hook called on inference error
 *   - TC-004-5: Context assembly error does not crash loop
 *   - TC-004-6: Inference error does not crash loop
 *   - TC-004-7: trace_id preserved through pipeline
 *
 * Mock strategy: ContextAssembler and InferenceService are fully mocked.
 * HookRegistry is real (lightweight, no external deps).
 */
export {};
//# sourceMappingURL=AgentLoop.test.d.ts.map