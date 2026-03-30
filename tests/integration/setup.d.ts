/**
 * Integration test setup.
 *
 * Provides reusable factories for creating mock instances of core
 * osaI components used across integration test suites.
 *
 * All external dependencies (SQLite, LLM APIs, WebSocket) are mocked.
 */
import type { HookRegistry as HookRegistryType } from '../../packages/agent/src/hooks/index.js';
import type { LLMProvider, LLMRequest, ChatMessage, ToolCall } from '../../packages/providers/src/types.js';
import { ContextAssembler } from '../../packages/agent/src/context/ContextAssembler.js';
import type { RAGQueryFn } from '../../packages/agent/src/context/types.js';
import { InferenceService } from '../../packages/agent/src/inference/InferenceService.js';
import { AgentLoop } from '../../packages/agent/src/loop/AgentLoop.js';
import { ToolExecutor } from '../../packages/agent/src/loop/ToolExecutor.js';
import { SkillRegistry } from '../../packages/skills-core/src/registry/SkillRegistry.js';
import type { ToolResult, PermissionPolicy } from '../../packages/skills-core/src/types.js';
import { PermissionChecker } from '../../packages/skills-core/src/permissions/PermissionChecker.js';
import { ChatService } from '../../packages/gateway/src/chat/ChatService.js';
import type { DatabaseManager } from '../../packages/shared/src/database.js';
export interface MockLLMProviderOptions {
    readonly id: string;
    readonly name: string;
    readonly defaultModel: string;
    /** Response content for complete(). */
    readonly responseContent?: string;
    /** Tool calls to return from complete(). */
    readonly toolCalls?: readonly ToolCall[];
    /** Finish reason for complete(). */
    readonly finishReason?: string;
    /** Whether the provider should fail. */
    readonly shouldFail?: boolean;
    /** Error to throw when shouldFail is true. */
    readonly failError?: Error;
    /** Whether isAvailable() returns true. */
    readonly available?: boolean;
}
/**
 * Create a mock LLMProvider that simulates a real provider.
 * Supports configurable responses, tool calls, and failure modes.
 */
export declare function createMockLLMProvider(options: MockLLMProviderOptions): LLMProvider & {
    /** Tracks calls to complete(). */
    completeCalls: LLMRequest[];
    /** Tracks calls to stream(). */
    streamCalls: LLMRequest[];
};
export interface MockSkillRegistryOptions {
    readonly tools?: Record<string, (params: Record<string, unknown>) => Promise<ToolResult>>;
}
/**
 * Create a mock SkillRegistry with configurable tool handlers.
 */
export declare function createMockSkillRegistry(options?: MockSkillRegistryOptions): SkillRegistry;
export interface IntegrationTestFixture {
    readonly hooks: HookRegistryType;
    readonly provider: LLMProvider;
    readonly inferenceService: InferenceService;
    readonly contextAssembler: ContextAssembler;
    readonly agentLoop: AgentLoop;
    readonly toolExecutor: ToolExecutor;
    readonly skillRegistry: SkillRegistry;
    readonly permissionChecker: PermissionChecker;
    readonly chatService: ChatService;
    readonly dbManager: DatabaseManager;
}
/**
 * Build a complete integration test fixture with all components wired together.
 *
 * @param dbManager - An initialized DatabaseManager with in-memory SQLite.
 * @param providerOptions - Options for the mock LLM provider.
 * @param ragQuery - Optional RAG query function.
 */
export declare function createTestFixture(dbManager: DatabaseManager, providerOptions?: Omit<MockLLMProviderOptions, 'id' | 'name'> & {
    id?: string;
    name?: string;
}, ragQuery?: RAGQueryFn): IntegrationTestFixture;
export declare const TEST_IDS: {
    readonly chatId: "test-chat-00000000-0000-0000-0000-000000000001";
    readonly sessionId: "test-session-00000000-0000-0000-0000-000000000001";
    readonly traceId: "test-trace-00000000-0000-0000-0000-000000000001";
    readonly messageId: "test-msg-00000000-0000-0000-0000-000000000001";
};
export declare function createTestToolCall(id?: string, name?: string, args?: Record<string, unknown>): ToolCall;
export declare function createTestChatMessage(role?: ChatMessage['role'], content?: string): ChatMessage;
/**
 * Check if a tool requires user confirmation based on permission policy.
 */
export declare function requiresConfirmation(toolName: string, policy?: PermissionPolicy): boolean;
//# sourceMappingURL=setup.d.ts.map