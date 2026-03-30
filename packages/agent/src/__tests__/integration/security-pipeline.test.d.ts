/**
 * Security Pipeline -- Integration Tests (T-008)
 *
 * TC-008-6: Full pipeline: request -> sandbox check -> exec -> audit
 *
 * Tests the complete security chain:
 *   BeforeToolCallSecurity -> tool execution -> OnFileAccessAudit / AfterToolCallAudit
 *
 * Uses mock AuditService, FileSandbox, CommandValidator.
 * Verifies end-to-end security flow through HookRegistry.
 */
export {};
//# sourceMappingURL=security-pipeline.test.d.ts.map