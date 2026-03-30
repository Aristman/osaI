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
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolExecutor } from '../ToolExecutor.js';
import { HookRegistry } from '../../hooks/HookRegistry.js';
import { HookPoint } from '../../hooks/types.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createTestConfig(overrides) {
    return {
        sessionId: 'session-001',
        chatId: 'chat-001',
        traceId: 'trace-001',
        maxIterations: 10,
        ...overrides,
    };
}
function createTestInput(messages) {
    return {
        messages,
    };
}
function createMockInferenceResult(overrides) {
    return {
        content: '',
        hasToolCalls: false,
        usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
        },
        model: 'glm-5',
        provider: 'z-ai',
        finishReason: 'stop',
        ...overrides,
    };
}
function createMockInferenceService(results) {
    let callIndex = 0;
    return {
        infer: vi.fn().mockImplementation(async () => {
            const result = results[callIndex] ?? results[results.length - 1];
            callIndex++;
            return result;
        }),
        inferStream: vi.fn(),
    };
}
function createMockSkillRegistry() {
    return {
        execute: vi.fn(),
    };
}
function createSuccessfulToolResult(data) {
    return { success: true, data };
}
function createFailedToolResult(error) {
    return { success: false, error };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ToolExecutor', () => {
    let hooks;
    let mockInferenceService;
    let mockSkillRegistry;
    let config;
    beforeEach(() => {
        hooks = new HookRegistry();
        config = createTestConfig();
        mockSkillRegistry = createMockSkillRegistry();
    });
    // -----------------------------------------------------------------------
    // TC-005-7: No tool_use -> loop does not start
    // -----------------------------------------------------------------------
    describe('TC-005-7: No tool_use -> single inference pass', () => {
        it('should return immediately when inference has no tool calls', async () => {
            const result = createMockInferenceResult({
                content: 'Hello! How can I help?',
                hasToolCalls: false,
                finishReason: 'stop',
            });
            mockInferenceService = createMockInferenceService([result]);
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const input = createTestInput([
                { role: 'user', content: 'Hello' },
            ]);
            const output = await executor.executeToolLoop(input.messages, input.tools, config);
            expect(output.iterations).toBe(1);
            expect(output.messages).toHaveLength(2); // original + assistant response
            expect(output.messages[1].role).toBe('assistant');
            expect(output.messages[1].content).toBe('Hello! How can I help?');
            expect(output.toolCalls).toHaveLength(1);
            expect(output.toolCalls[0]).toHaveLength(0); // no tool calls in first iteration
            expect(mockSkillRegistry.execute).not.toHaveBeenCalled();
        });
        it('should return messages with assistant response appended', async () => {
            const result = createMockInferenceResult({
                content: 'Final answer',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([result]);
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'system', content: 'System prompt' },
                { role: 'user', content: 'Question' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            expect(output.messages).toHaveLength(3); // system + user + assistant
            expect(output.messages[2].role).toBe('assistant');
            expect(output.messages[2].content).toBe('Final answer');
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-1: tool_use -> execute -> result -> re-inference
    // -----------------------------------------------------------------------
    describe('TC-005-1: tool_use -> execute -> result -> re-inference', () => {
        it('should execute tool and re-call inference when tool_use response', async () => {
            // First inference returns tool call
            const toolCallResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    {
                        id: 'call-001',
                        name: 'read_file',
                        arguments: '{"path": "/tmp/test.txt"}',
                    },
                ],
                finishReason: 'tool_calls',
            });
            // Second inference returns final text
            const finalResponse = createMockInferenceResult({
                content: 'File contents: hello world',
                hasToolCalls: false,
                finishReason: 'stop',
            });
            mockInferenceService = createMockInferenceService([toolCallResponse, finalResponse]);
            mockSkillRegistry.execute.mockResolvedValue(createSuccessfulToolResult({ content: 'hello world' }));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Read the file' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            // Inference should be called twice
            expect(mockInferenceService.infer.mock.calls.length).toBe(2);
            // SkillRegistry should be called with correct tool name and parsed params
            expect(mockSkillRegistry.execute).toHaveBeenCalledWith('read_file', { path: '/tmp/test.txt' });
            // Should have 2 iterations
            expect(output.iterations).toBe(2);
            // toolCalls should have entries for both iterations
            expect(output.toolCalls).toHaveLength(2);
            expect(output.toolCalls[0]).toHaveLength(1);
            expect(output.toolCalls[1]).toHaveLength(0); // final response has no tool calls
        });
        it('should pass tool results back to inference in subsequent calls', async () => {
            const toolCallResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    {
                        id: 'call-001',
                        name: 'get_weather',
                        arguments: '{"city": "Moscow"}',
                    },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Weather in Moscow: sunny',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([toolCallResponse, finalResponse]);
            mockSkillRegistry.execute.mockResolvedValue(createSuccessfulToolResult({ temp: 20, condition: 'sunny' }));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'What is the weather in Moscow?' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            // Second inference call should receive messages with tool result
            const secondCall = mockInferenceService.infer.mock.calls[1];
            const secondMessages = secondCall[0].messages;
            // Should contain: user message + assistant (tool_call) + tool result
            expect(secondMessages.some((m) => m.role === 'tool')).toBe(true);
            const toolMessage = secondMessages.find((m) => m.role === 'tool');
            expect(toolMessage.toolCallId).toBe('call-001');
            expect(toolMessage.content).toBe(JSON.stringify({ success: true, data: { temp: 20, condition: 'sunny' } }));
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-2: Multiple tool_use in one response
    // -----------------------------------------------------------------------
    describe('TC-005-2: Multiple tool_use in one response', () => {
        it('should execute all tools when LLM returns multiple tool calls', async () => {
            const multiToolResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    {
                        id: 'call-001',
                        name: 'read_file',
                        arguments: '{"path": "/tmp/a.txt"}',
                    },
                    {
                        id: 'call-002',
                        name: 'read_file',
                        arguments: '{"path": "/tmp/b.txt"}',
                    },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Combined results',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([multiToolResponse, finalResponse]);
            mockSkillRegistry.execute
                .mockResolvedValueOnce(createSuccessfulToolResult({ content: 'A' }))
                .mockResolvedValueOnce(createSuccessfulToolResult({ content: 'B' }));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Read both files' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            // Both tools should be executed
            expect(mockSkillRegistry.execute).toHaveBeenCalledTimes(2);
            expect(mockSkillRegistry.execute).toHaveBeenCalledWith('read_file', { path: '/tmp/a.txt' });
            expect(mockSkillRegistry.execute).toHaveBeenCalledWith('read_file', { path: '/tmp/b.txt' });
            // Two tool result messages should be appended
            const secondCall = mockInferenceService.infer.mock.calls[1];
            const secondMessages = secondCall[0].messages;
            const toolMessages = secondMessages.filter((m) => m.role === 'tool');
            expect(toolMessages).toHaveLength(2);
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-3: before_tool_execution hook called
    // -----------------------------------------------------------------------
    describe('TC-005-3: before_tool_execution hook', () => {
        it('should call BEFORE_TOOL_EXECUTION hook before each tool call', async () => {
            const hookCalls = [];
            hooks.register(HookPoint.BEFORE_TOOL_EXECUTION, (ctx) => {
                hookCalls.push(ctx);
                return ctx;
            });
            const toolCallResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    {
                        id: 'call-001',
                        name: 'search',
                        arguments: '{"query": "test"}',
                    },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Result',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([toolCallResponse, finalResponse]);
            mockSkillRegistry.execute.mockResolvedValue(createSuccessfulToolResult(null));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Search test' },
            ];
            await executor.executeToolLoop(messages, undefined, config);
            expect(hookCalls).toHaveLength(1);
            expect(hookCalls[0].hookPoint).toBe(HookPoint.BEFORE_TOOL_EXECUTION);
            expect(hookCalls[0].data['toolName']).toBe('search');
            expect(hookCalls[0].data['toolCallId']).toBe('call-001');
            expect(hookCalls[0].data['toolParams']).toEqual({ query: 'test' });
        });
        it('should call BEFORE_TOOL_EXECUTION hook for each tool in multi-tool response', async () => {
            const hookCalls = [];
            hooks.register(HookPoint.BEFORE_TOOL_EXECUTION, () => {
                hookCalls.push(1);
                // Return value must be HookContext, but we just count
                const ctx = {
                    hookPoint: HookPoint.BEFORE_TOOL_EXECUTION,
                    sessionId: 'session-001',
                    chatId: 'chat-001',
                    traceId: 'trace-001',
                    timestamp: new Date().toISOString(),
                    data: {},
                };
                return ctx;
            });
            const multiToolResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    { id: 'call-001', name: 'tool_a', arguments: '{}' },
                    { id: 'call-002', name: 'tool_b', arguments: '{}' },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Done',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([multiToolResponse, finalResponse]);
            mockSkillRegistry.execute.mockResolvedValue(createSuccessfulToolResult(null));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Run both' },
            ];
            await executor.executeToolLoop(messages, undefined, config);
            expect(hookCalls).toHaveLength(2);
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-4: after_tool_execution hook called
    // -----------------------------------------------------------------------
    describe('TC-005-4: after_tool_execution hook', () => {
        it('should call AFTER_TOOL_EXECUTION hook after each tool call', async () => {
            const hookCalls = [];
            hooks.register(HookPoint.AFTER_TOOL_EXECUTION, (ctx) => {
                hookCalls.push(ctx);
                return ctx;
            });
            const toolCallResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    {
                        id: 'call-001',
                        name: 'search',
                        arguments: '{"query": "test"}',
                    },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Result',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([toolCallResponse, finalResponse]);
            mockSkillRegistry.execute.mockResolvedValue(createSuccessfulToolResult({ items: ['a', 'b'] }));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Search' },
            ];
            await executor.executeToolLoop(messages, undefined, config);
            expect(hookCalls).toHaveLength(1);
            expect(hookCalls[0].hookPoint).toBe(HookPoint.AFTER_TOOL_EXECUTION);
            expect(hookCalls[0].data['toolName']).toBe('search');
            expect(hookCalls[0].data['toolCallId']).toBe('call-001');
            expect(hookCalls[0].data['toolResult']).toEqual({ success: true, data: { items: ['a', 'b'] } });
        });
        it('should call AFTER_TOOL_EXECUTION with error info when tool fails', async () => {
            const hookCalls = [];
            hooks.register(HookPoint.AFTER_TOOL_EXECUTION, (ctx) => {
                hookCalls.push(ctx);
                return ctx;
            });
            const toolCallResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    { id: 'call-001', name: 'failing_tool', arguments: '{}' },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Sorry, tool failed',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([toolCallResponse, finalResponse]);
            mockSkillRegistry.execute.mockResolvedValue(createFailedToolResult('Permission denied'));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Do something' },
            ];
            await executor.executeToolLoop(messages, undefined, config);
            expect(hookCalls).toHaveLength(1);
            expect(hookCalls[0].data['toolResult']).toEqual({ success: false, error: 'Permission denied' });
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-5: Tool result appended to messages
    // -----------------------------------------------------------------------
    describe('TC-005-5: Tool result appended to messages', () => {
        it('should append tool result message with role=tool and tool_call_id', async () => {
            const toolCallResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    {
                        id: 'call-abc',
                        name: 'get_time',
                        arguments: '{}',
                    },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'The time is 12:00',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([toolCallResponse, finalResponse]);
            mockSkillRegistry.execute.mockResolvedValue(createSuccessfulToolResult('2026-03-30T12:00:00Z'));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'What time is it?' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            // Find the tool message in the final messages array
            const toolMessages = output.messages.filter((m) => m.role === 'tool');
            expect(toolMessages).toHaveLength(1);
            expect(toolMessages[0].toolCallId).toBe('call-abc');
            expect(toolMessages[0].content).toBe(JSON.stringify({ success: true, data: '2026-03-30T12:00:00Z' }));
            // Also check that assistant message with tool_calls is present
            const assistantWithTools = output.messages.find((m) => m.role === 'assistant' && m.toolCalls !== undefined && m.toolCalls.length > 0);
            expect(assistantWithTools).toBeDefined();
            expect(assistantWithTools.toolCalls).toHaveLength(1);
        });
        it('should append multiple tool results for multi-tool response', async () => {
            const multiToolResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    { id: 'call-a', name: 'tool_a', arguments: '{}' },
                    { id: 'call-b', name: 'tool_b', arguments: '{}' },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Both done',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([multiToolResponse, finalResponse]);
            mockSkillRegistry.execute
                .mockResolvedValueOnce(createSuccessfulToolResult('result_a'))
                .mockResolvedValueOnce(createSuccessfulToolResult('result_b'));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Run both tools' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            const toolMessages = output.messages.filter((m) => m.role === 'tool');
            expect(toolMessages).toHaveLength(2);
            expect(toolMessages[0].toolCallId).toBe('call-a');
            expect(toolMessages[1].toolCallId).toBe('call-b');
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-6: Max iterations guard
    // -----------------------------------------------------------------------
    describe('TC-005-6: Max iterations guard', () => {
        it('should stop after max iterations (default 10)', async () => {
            // Every inference returns tool calls (infinite loop scenario)
            const toolCallResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    { id: 'call-loop', name: 'loop_tool', arguments: '{}' },
                ],
                finishReason: 'tool_calls',
            });
            // Provide enough results for 12 calls (10 iterations + 2 buffer)
            const results = Array.from({ length: 12 }, () => toolCallResponse);
            mockInferenceService = createMockInferenceService(results);
            mockSkillRegistry.execute.mockResolvedValue(createSuccessfulToolResult(null));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Start loop' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            // Should stop at maxIterations
            expect(output.iterations).toBe(10);
            expect(output.maxIterationsReached).toBe(true);
            // Inference should be called exactly 10 times (maxIterations)
            expect(mockInferenceService.infer.mock.calls.length).toBe(10);
        });
        it('should respect custom maxIterations value', async () => {
            const toolCallResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    { id: 'call-loop', name: 'loop_tool', arguments: '{}' },
                ],
                finishReason: 'tool_calls',
            });
            const results = Array.from({ length: 10 }, () => toolCallResponse);
            mockInferenceService = createMockInferenceService(results);
            mockSkillRegistry.execute.mockResolvedValue(createSuccessfulToolResult(null));
            const customConfig = createTestConfig({ maxIterations: 3 });
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Start' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, customConfig);
            expect(output.iterations).toBe(3);
            expect(output.maxIterationsReached).toBe(true);
            expect(mockInferenceService.infer.mock.calls.length).toBe(3);
        });
        it('should not set maxIterationsReached when loop terminates normally', async () => {
            const toolCallResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    { id: 'call-001', name: 'tool', arguments: '{}' },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Done',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([toolCallResponse, finalResponse]);
            mockSkillRegistry.execute.mockResolvedValue(createSuccessfulToolResult(null));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Go' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            expect(output.iterations).toBe(2);
            expect(output.maxIterationsReached).toBe(false);
        });
    });
    // -----------------------------------------------------------------------
    // TC-005-8: Tool execution error -> logged, loop continues
    // -----------------------------------------------------------------------
    describe('TC-005-8: Tool execution error handling', () => {
        it('should continue loop when SkillRegistry.execute throws', async () => {
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => { });
            const toolCallResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    { id: 'call-err', name: 'failing_tool', arguments: '{}' },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Recovered from error',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([toolCallResponse, finalResponse]);
            mockSkillRegistry.execute.mockRejectedValue(new Error('Tool handler crashed'));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Run failing tool' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            // Should still complete the loop
            expect(output.iterations).toBe(2);
            expect(output.messages.some((m) => m.role === 'tool')).toBe(true);
            // Tool result message should contain error info
            const toolMessage = output.messages.find((m) => m.role === 'tool');
            const parsedResult = JSON.parse(toolMessage.content);
            expect(parsedResult.success).toBe(false);
            expect(parsedResult.error).toBe('Tool handler crashed');
            // Error should be logged
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
        it('should still call after_tool_execution hook when tool fails', async () => {
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => { });
            const afterHookCalls = [];
            hooks.register(HookPoint.AFTER_TOOL_EXECUTION, (ctx) => {
                afterHookCalls.push(ctx);
                return ctx;
            });
            const toolCallResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    { id: 'call-err', name: 'crash_tool', arguments: '{}' },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Done',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([toolCallResponse, finalResponse]);
            mockSkillRegistry.execute.mockRejectedValue(new Error('Crash'));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Crash' },
            ];
            await executor.executeToolLoop(messages, undefined, config);
            // AFTER_TOOL_EXECUTION should still be called with error result
            expect(afterHookCalls).toHaveLength(1);
            expect(afterHookCalls[0].data['toolResult']).toEqual({ success: false, error: 'Crash' });
            consoleSpy.mockRestore();
        });
        it('should handle tool execution error for one tool in multi-tool and continue with others', async () => {
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => { });
            const multiToolResponse = createMockInferenceResult({
                content: '',
                hasToolCalls: true,
                toolCalls: [
                    { id: 'call-ok', name: 'good_tool', arguments: '{}' },
                    { id: 'call-err', name: 'bad_tool', arguments: '{}' },
                ],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Partial result',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([multiToolResponse, finalResponse]);
            mockSkillRegistry.execute
                .mockResolvedValueOnce(createSuccessfulToolResult('ok'))
                .mockRejectedValueOnce(new Error('bad'));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Multi' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            // Both tool results should be in messages
            const toolMessages = output.messages.filter((m) => m.role === 'tool');
            expect(toolMessages).toHaveLength(2);
            consoleSpy.mockRestore();
        });
    });
    // -----------------------------------------------------------------------
    // Multi-iteration tool loop
    // -----------------------------------------------------------------------
    describe('Multi-iteration tool loop', () => {
        it('should handle 3 iterations of tool calls', async () => {
            const responses = [
                // Iteration 1: tool call
                createMockInferenceResult({
                    hasToolCalls: true,
                    toolCalls: [{ id: 'call-1', name: 'step1', arguments: '{}' }],
                    finishReason: 'tool_calls',
                }),
                // Iteration 2: another tool call
                createMockInferenceResult({
                    hasToolCalls: true,
                    toolCalls: [{ id: 'call-2', name: 'step2', arguments: '{}' }],
                    finishReason: 'tool_calls',
                }),
                // Iteration 3: another tool call
                createMockInferenceResult({
                    hasToolCalls: true,
                    toolCalls: [{ id: 'call-3', name: 'step3', arguments: '{}' }],
                    finishReason: 'tool_calls',
                }),
                // Iteration 4: final response
                createMockInferenceResult({
                    content: 'All steps complete',
                    hasToolCalls: false,
                }),
            ];
            mockInferenceService = createMockInferenceService(responses);
            mockSkillRegistry.execute.mockResolvedValue(createSuccessfulToolResult(null));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Multi-step' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            expect(output.iterations).toBe(4);
            expect(mockSkillRegistry.execute).toHaveBeenCalledTimes(3);
            // toolCalls should have 4 entries
            expect(output.toolCalls).toHaveLength(4);
            expect(output.toolCalls[0]).toHaveLength(1);
            expect(output.toolCalls[1]).toHaveLength(1);
            expect(output.toolCalls[2]).toHaveLength(1);
            expect(output.toolCalls[3]).toHaveLength(0); // final response
            // Final message should be the final response
            const lastMessage = output.messages[output.messages.length - 1];
            expect(lastMessage.role).toBe('assistant');
            expect(lastMessage.content).toBe('All steps complete');
        });
    });
    // -----------------------------------------------------------------------
    // Return type validation
    // -----------------------------------------------------------------------
    describe('Return type validation', () => {
        it('should return correct structure for ToolExecutorOutput', async () => {
            const result = createMockInferenceResult({
                content: 'Response',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([result]);
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const messages = [
                { role: 'user', content: 'Test' },
            ];
            const output = await executor.executeToolLoop(messages, undefined, config);
            // Validate return type
            expect(output.messages).toBeInstanceOf(Array);
            expect(output.toolCalls).toBeInstanceOf(Array);
            expect(typeof output.iterations).toBe('number');
            expect(typeof output.maxIterationsReached).toBe('boolean');
        });
        it('should pass correlation IDs in hook context', async () => {
            const capturedContexts = [];
            hooks.register(HookPoint.BEFORE_TOOL_EXECUTION, (ctx) => {
                capturedContexts.push(ctx);
                return ctx;
            });
            const toolCallResponse = createMockInferenceResult({
                hasToolCalls: true,
                toolCalls: [{ id: 'call-1', name: 'test_tool', arguments: '{}' }],
                finishReason: 'tool_calls',
            });
            const finalResponse = createMockInferenceResult({
                content: 'Done',
                hasToolCalls: false,
            });
            mockInferenceService = createMockInferenceService([toolCallResponse, finalResponse]);
            mockSkillRegistry.execute.mockResolvedValue(createSuccessfulToolResult(null));
            const executor = new ToolExecutor(mockInferenceService, mockSkillRegistry, hooks);
            const customConfig = createTestConfig({
                sessionId: 'sess-xyz',
                chatId: 'chat-xyz',
                traceId: 'trace-xyz',
            });
            const messages = [
                { role: 'user', content: 'Test' },
            ];
            await executor.executeToolLoop(messages, undefined, customConfig);
            expect(capturedContexts).toHaveLength(1);
            expect(capturedContexts[0].sessionId).toBe('sess-xyz');
            expect(capturedContexts[0].chatId).toBe('chat-xyz');
            expect(capturedContexts[0].traceId).toBe('trace-xyz');
        });
    });
});
//# sourceMappingURL=ToolExecutor.test.js.map