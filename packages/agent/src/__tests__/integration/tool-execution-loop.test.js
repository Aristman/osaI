/**
 * Integration Test -- Tool Execution Loop (T-008)
 *
 * TC-008-2: Full loop with tool execution
 *   LLM returns tool_use -> tool executed -> LLM re-called -> final response
 *
 * TC-008-7: Max iterations guard
 *
 * Uses real ToolExecutor, InferenceService, HookRegistry
 * with mocks at external boundaries (LLMProvider, SkillRegistry).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolExecutor } from '../../loop/ToolExecutor.js';
import { InferenceService } from '../../inference/InferenceService.js';
import { HookRegistry } from '../../hooks/HookRegistry.js';
import { HookPoint } from '../../hooks/types.js';
// ---------------------------------------------------------------------------
// Mock LLMProvider with configurable responses
// ---------------------------------------------------------------------------
function createMockLLMProvider(responses) {
    let callIndex = 0;
    return {
        id: 'mock',
        name: 'Mock Provider',
        isAvailable: vi.fn().mockResolvedValue(true),
        complete: vi.fn().mockImplementation(() => {
            const response = responses[callIndex] ?? responses[responses.length - 1];
            callIndex++;
            return {
                content: response.content,
                toolCalls: response.toolCalls,
                usage: {
                    promptTokens: 10,
                    completionTokens: 20,
                    totalTokens: 30,
                },
                model: 'glm-5',
                provider: 'z-ai',
                finishReason: response.finishReason ?? 'stop',
            };
        }),
        stream: vi.fn().mockImplementation(function* () { }),
        countTokens: vi.fn().mockReturnValue(10),
        getStatus: vi.fn().mockReturnValue('available'),
    };
}
function createMockSkillRegistry(result = { success: true, data: null }) {
    return {
        execute: vi.fn().mockResolvedValue(result),
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Integration: Tool Execution Loop (TC-008-2)', () => {
    let hooks;
    beforeEach(() => {
        hooks = new HookRegistry();
    });
    it('should execute tool and get final response', async () => {
        const provider = createMockLLMProvider([
            {
                content: '',
                toolCalls: [
                    {
                        id: 'call-int-001',
                        name: 'read_file',
                        arguments: '{"path": "/tmp/test.txt"}',
                    },
                ],
                finishReason: 'tool_calls',
            },
            {
                content: 'The file contains: Hello World',
                finishReason: 'stop',
            },
        ]);
        const registry = createMockSkillRegistry({
            success: true,
            data: { content: 'Hello World' },
        });
        const inferenceService = new InferenceService(provider, hooks);
        const executor = new ToolExecutor(inferenceService, registry, hooks);
        const messages = [
            { role: 'user', content: 'Read the file /tmp/test.txt' },
        ];
        const output = await executor.executeToolLoop(messages, undefined, {
            sessionId: 'session-tool-001',
            chatId: 'chat-tool-001',
            traceId: 'trace-tool-001',
            maxIterations: 10,
        });
        // Should have 2 iterations (tool call + final response)
        expect(output.iterations).toBe(2);
        expect(output.maxIterationsReached).toBe(false);
        // SkillRegistry should have been called
        expect(registry.execute).toHaveBeenCalledWith('read_file', { path: '/tmp/test.txt' });
        // Final message should be the response
        const lastMsg = output.messages[output.messages.length - 1];
        expect(lastMsg.role).toBe('assistant');
        expect(lastMsg.content).toBe('The file contains: Hello World');
    });
    it('should handle multiple tools in sequence', async () => {
        const provider = createMockLLMProvider([
            {
                content: '',
                toolCalls: [
                    { id: 'call-a', name: 'get_time', arguments: '{}' },
                    { id: 'call-b', name: 'get_weather', arguments: '{"city": "Moscow"}' },
                ],
                finishReason: 'tool_calls',
            },
            {
                content: 'Current time: 12:00, Weather: sunny in Moscow',
                finishReason: 'stop',
            },
        ]);
        const registry = createMockSkillRegistry();
        const inferenceService = new InferenceService(provider, hooks);
        const executor = new ToolExecutor(inferenceService, registry, hooks);
        const messages = [
            { role: 'user', content: 'What time is it and what is the weather?' },
        ];
        const output = await executor.executeToolLoop(messages, undefined, {
            sessionId: 'session-tool-002',
            chatId: 'chat-tool-002',
            traceId: 'trace-tool-002',
        });
        expect(output.iterations).toBe(2);
        expect(registry.execute).toHaveBeenCalledTimes(2);
        expect(registry.execute).toHaveBeenCalledWith('get_time', {});
        expect(registry.execute).toHaveBeenCalledWith('get_weather', { city: 'Moscow' });
    });
});
describe('Integration: Max Iterations Guard (TC-008-7)', () => {
    let hooks;
    beforeEach(() => {
        hooks = new HookRegistry();
    });
    it('should stop after max iterations when LLM keeps requesting tools', async () => {
        // Every response requests a tool call
        const toolCallResponse = {
            content: '',
            toolCalls: [
                { id: 'call-loop', name: 'loop_tool', arguments: '{}' },
            ],
            finishReason: 'tool_calls',
        };
        const responses = Array.from({ length: 12 }, () => toolCallResponse);
        const provider = createMockLLMProvider(responses);
        const registry = createMockSkillRegistry();
        const inferenceService = new InferenceService(provider, hooks);
        const executor = new ToolExecutor(inferenceService, registry, hooks);
        const messages = [
            { role: 'user', content: 'Start an infinite tool loop' },
        ];
        const output = await executor.executeToolLoop(messages, undefined, {
            sessionId: 'session-max-001',
            chatId: 'chat-max-001',
            traceId: 'trace-max-001',
            maxIterations: 3,
        });
        expect(output.iterations).toBe(3);
        expect(output.maxIterationsReached).toBe(true);
        expect(registry.execute).toHaveBeenCalledTimes(3);
    });
});
//# sourceMappingURL=tool-execution-loop.test.js.map