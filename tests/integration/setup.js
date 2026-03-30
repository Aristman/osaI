/**
 * Integration test setup.
 *
 * Provides reusable factories for creating mock instances of core
 * osaI components used across integration test suites.
 *
 * All external dependencies (SQLite, LLM APIs, WebSocket) are mocked.
 */
import { vi } from 'vitest';
import { HookRegistry } from '../../packages/agent/src/hooks/HookRegistry.js';
import { ProviderStatus } from '../../packages/providers/src/types.js';
import { ProviderChain } from '../../packages/providers/src/chain/provider-chain.js';
import { CircuitBreaker } from '../../packages/providers/src/circuit-breaker/circuit-breaker.js';
import { CircuitState } from '../../packages/providers/src/circuit-breaker/types.js';
import { ProviderError, ProviderUnavailableError } from '../../packages/providers/src/errors.js';
import { ContextAssembler } from '../../packages/agent/src/context/ContextAssembler.js';
import { InferenceService } from '../../packages/agent/src/inference/InferenceService.js';
import { AgentLoop } from '../../packages/agent/src/loop/AgentLoop.js';
import { ToolExecutor } from '../../packages/agent/src/loop/ToolExecutor.js';
import { SkillRegistry } from '../../packages/skills-core/src/registry/SkillRegistry.js';
import { PermissionChecker } from '../../packages/skills-core/src/permissions/PermissionChecker.js';
import { ChatService } from '../../packages/gateway/src/chat/ChatService.js';
/**
 * Create a mock LLMProvider that simulates a real provider.
 * Supports configurable responses, tool calls, and failure modes.
 */
export function createMockLLMProvider(options) {
    const { id, name, defaultModel, responseContent = 'Mock response', toolCalls, finishReason = 'stop', shouldFail = false, failError = new ProviderUnavailableError('Provider unavailable', id), available = true, } = options;
    const completeCalls = [];
    const streamCalls = [];
    const mockUsage = {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
    };
    return {
        id,
        name,
        completeCalls,
        streamCalls,
        isAvailable: vi.fn().mockResolvedValue(available),
        async complete(request) {
            completeCalls.push(request);
            if (shouldFail) {
                throw failError;
            }
            return {
                content: responseContent,
                toolCalls: toolCalls !== undefined && toolCalls.length > 0 ? [...toolCalls] : undefined,
                usage: mockUsage,
                model: request.model || defaultModel,
                provider: id,
                finishReason,
            };
        },
        async *stream(request) {
            streamCalls.push(request);
            if (shouldFail) {
                throw failError;
            }
            yield {
                content: responseContent,
                toolCalls,
                usage: mockUsage,
                finishReason,
                model: request.model || defaultModel,
                provider: id,
            };
        },
        countTokens: vi.fn().mockReturnValue(10),
        getStatus: vi.fn().mockReturnValue(ProviderStatus.Available),
    };
}
/**
 * Create a mock SkillRegistry with configurable tool handlers.
 */
export function createMockSkillRegistry(options = {}) {
    const registry = new SkillRegistry();
    const tools = options.tools ?? {};
    for (const [toolName, handler] of Object.entries(tools)) {
        const category = toolName.startsWith('read_') || toolName.startsWith('list_') || toolName.startsWith('get_')
            ? 'read'
            : toolName.startsWith('write_') || toolName.startsWith('create_') || toolName.startsWith('delete_')
                ? 'write'
                : 'exec';
        const permissionLevel = category === 'read' ? 'auto' : 'confirm';
        const skill = {
            name: `skill-${toolName}`,
            version: '1.0.0',
            description: `Mock skill for ${toolName}`,
            category: 'bundled',
            tools: [
                {
                    name: toolName,
                    description: `Mock tool: ${toolName}`,
                    parameters: {
                        type: 'object',
                        properties: {},
                    },
                    handler,
                },
            ],
            enabled: true,
            permissions: { [toolName]: permissionLevel },
        };
        registry.register(skill);
    }
    return registry;
}
/**
 * Build a complete integration test fixture with all components wired together.
 *
 * @param dbManager - An initialized DatabaseManager with in-memory SQLite.
 * @param providerOptions - Options for the mock LLM provider.
 * @param ragQuery - Optional RAG query function.
 */
export function createTestFixture(dbManager, providerOptions = {}, ragQuery) {
    const hooks = new HookRegistry();
    const provider = createMockLLMProvider({
        id: providerOptions.id ?? 'mock-provider',
        name: providerOptions.name ?? 'Mock Provider',
        defaultModel: providerOptions.defaultModel ?? 'mock-model',
        ...providerOptions,
    });
    const inferenceService = new InferenceService(provider, hooks);
    const contextAssembler = ragQuery !== undefined
        ? new ContextAssembler(hooks, ragQuery)
        : new ContextAssembler(hooks);
    const chatService = new ChatService(dbManager);
    chatService.ensureSchema();
    const skillRegistry = new SkillRegistry();
    const permissionChecker = new PermissionChecker();
    const agentLoopConfig = {
        systemPrompt: 'You are a helpful assistant.',
        defaultModel: providerOptions.defaultModel ?? 'mock-model',
        tools: [],
    };
    const agentLoop = new AgentLoop(agentLoopConfig, contextAssembler, inferenceService, hooks);
    const toolExecutor = new ToolExecutor(inferenceService, skillRegistry, hooks);
    return {
        hooks,
        provider,
        inferenceService,
        contextAssembler,
        agentLoop,
        toolExecutor,
        skillRegistry,
        permissionChecker,
        chatService,
        dbManager,
    };
}
// ---------------------------------------------------------------------------
// Test data generators
// ---------------------------------------------------------------------------
export const TEST_IDS = {
    chatId: 'test-chat-00000000-0000-0000-0000-000000000001',
    sessionId: 'test-session-00000000-0000-0000-0000-000000000001',
    traceId: 'test-trace-00000000-0000-0000-0000-000000000001',
    messageId: 'test-msg-00000000-0000-0000-0000-000000000001',
};
export function createTestToolCall(id = crypto.randomUUID(), name = 'read_file', args = {}) {
    return {
        id,
        name,
        arguments: JSON.stringify(args),
    };
}
export function createTestChatMessage(role = 'user', content = 'Hello') {
    return { role, content };
}
// ---------------------------------------------------------------------------
// Permission check helper
// ---------------------------------------------------------------------------
/**
 * Check if a tool requires user confirmation based on permission policy.
 */
export function requiresConfirmation(toolName, policy = {}) {
    const checker = new PermissionChecker();
    const decision = checker.check(toolName, policy);
    return decision.decision === 'confirm';
}
//# sourceMappingURL=setup.js.map