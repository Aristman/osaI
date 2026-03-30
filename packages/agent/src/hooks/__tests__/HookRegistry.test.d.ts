/**
 * Unit tests for HookRegistry
 *
 * Covers: T-001 Hook System acceptance criteria
 *   - register() adds handler, emit calls it
 *   - emitAsync processes async handlers
 *   - execute() calls all handlers in order
 *   - unregister() removes handler
 *   - execute() without handlers does not crash
 *   - HookContext contains trace_id, chat_id, session_id
 *   - All 13 hook points defined in HookPoint enum
 *   - Error handling (graceful degradation)
 *   - Multiple handlers ordered by priority
 */
export {};
//# sourceMappingURL=HookRegistry.test.d.ts.map