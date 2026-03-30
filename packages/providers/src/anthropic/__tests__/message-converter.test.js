/**
 * @osai/providers -- Anthropic Message Converter Tests (DOMAIN-008)
 *
 * Tests for bidirectional conversion between osaI ChatMessage format
 * and Anthropic Messages API format.
 */
import { describe, it, expect } from 'vitest';
import { extractSystemPrompt, toAnthropicMessages, toAnthropicTools, fromAnthropicContent, } from '../message-converter.js';
// ---------------------------------------------------------------------------
// extractSystemPrompt
// ---------------------------------------------------------------------------
describe('extractSystemPrompt', () => {
    it('should extract a single system message', () => {
        const messages = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello' },
        ];
        const result = extractSystemPrompt(messages);
        expect(result).toBe('You are a helpful assistant.');
    });
    it('should join multiple system messages with double newline', () => {
        const messages = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'system', content: 'Respond in Russian.' },
            { role: 'user', content: 'Hello' },
        ];
        const result = extractSystemPrompt(messages);
        expect(result).toBe('You are a helpful assistant.\n\nRespond in Russian.');
    });
    it('should return undefined when no system messages exist', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi!' },
        ];
        const result = extractSystemPrompt(messages);
        expect(result).toBeUndefined();
    });
    it('should handle empty messages array', () => {
        const result = extractSystemPrompt([]);
        expect(result).toBeUndefined();
    });
});
// ---------------------------------------------------------------------------
// toAnthropicMessages
// ---------------------------------------------------------------------------
describe('toAnthropicMessages', () => {
    it('should exclude system messages from output', () => {
        const messages = [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'Hello' },
        ];
        const result = toAnthropicMessages(messages);
        expect(result).toHaveLength(1);
        expect(result[0]?.role).toBe('user');
    });
    it('should convert user messages to Anthropic format', () => {
        const messages = [
            { role: 'user', content: 'Hello!' },
        ];
        const result = toAnthropicMessages(messages);
        expect(result).toEqual([
            { role: 'user', content: 'Hello!' },
        ]);
    });
    it('should convert assistant messages to Anthropic format', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
        ];
        const result = toAnthropicMessages(messages);
        expect(result).toEqual([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
        ]);
    });
    it('should convert assistant tool_calls to tool_use content blocks', () => {
        const messages = [
            { role: 'user', content: 'What is the weather?' },
            {
                role: 'assistant',
                content: 'Let me check the weather.',
                toolCalls: [
                    {
                        id: 'call_123',
                        name: 'get_weather',
                        arguments: '{"location": "Moscow"}',
                    },
                ],
            },
        ];
        const result = toAnthropicMessages(messages);
        expect(result).toHaveLength(2);
        expect(result[1]?.role).toBe('assistant');
        const content = result[1]?.content;
        expect(content).toHaveLength(2);
        expect(content[0]).toEqual({ type: 'text', text: 'Let me check the weather.' });
        expect(content[1]).toEqual({
            type: 'tool_use',
            id: 'call_123',
            name: 'get_weather',
            input: { location: 'Moscow' },
        });
    });
    it('should handle assistant with only tool calls (no text)', () => {
        const messages = [
            { role: 'user', content: 'What time is it?' },
            {
                role: 'assistant',
                content: '',
                toolCalls: [
                    {
                        id: 'call_456',
                        name: 'get_time',
                        arguments: '{"timezone": "UTC"}',
                    },
                ],
            },
        ];
        const result = toAnthropicMessages(messages);
        const content = result[1]?.content;
        expect(content).toHaveLength(1);
        expect(content[0]?.type).toBe('tool_use');
    });
    it('should handle multiple tool calls from assistant', () => {
        const messages = [
            { role: 'user', content: 'Do two things' },
            {
                role: 'assistant',
                content: '',
                toolCalls: [
                    { id: 'call_1', name: 'tool_a', arguments: '{}' },
                    { id: 'call_2', name: 'tool_b', arguments: '{"x": 1}' },
                ],
            },
        ];
        const result = toAnthropicMessages(messages);
        const content = result[1]?.content;
        expect(content).toHaveLength(2);
        expect(content[0]?.name).toBe('tool_a');
        expect(content[1]?.name).toBe('tool_b');
    });
    it('should convert tool result messages to tool_result content blocks', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            {
                role: 'assistant',
                content: '',
                toolCalls: [
                    { id: 'call_123', name: 'get_weather', arguments: '{}' },
                ],
            },
            {
                role: 'tool',
                content: 'Sunny, 22C',
                toolCallId: 'call_123',
            },
        ];
        const result = toAnthropicMessages(messages);
        expect(result).toHaveLength(3);
        // The tool result should be a user message with tool_result content
        const toolMsg = result[2];
        expect(toolMsg?.role).toBe('user');
        const content = toolMsg?.content;
        expect(content[0]).toEqual({
            type: 'tool_result',
            tool_use_id: 'call_123',
            content: 'Sunny, 22C',
        });
    });
    it('should merge consecutive tool results into one user message', () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            {
                role: 'assistant',
                content: '',
                toolCalls: [
                    { id: 'call_1', name: 'tool_a', arguments: '{}' },
                    { id: 'call_2', name: 'tool_b', arguments: '{}' },
                ],
            },
            {
                role: 'tool',
                content: 'Result A',
                toolCallId: 'call_1',
            },
            {
                role: 'tool',
                content: 'Result B',
                toolCallId: 'call_2',
            },
        ];
        const result = toAnthropicMessages(messages);
        expect(result).toHaveLength(3); // user, assistant, user (with 2 tool results)
        const lastMsg = result[2];
        expect(lastMsg?.role).toBe('user');
        const content = lastMsg?.content;
        expect(content).toHaveLength(2);
        expect(content[0]?.tool_use_id).toBe('call_1');
        expect(content[1]?.tool_use_id).toBe('call_2');
    });
    it('should handle invalid JSON in tool arguments gracefully', () => {
        const messages = [
            {
                role: 'assistant',
                content: '',
                toolCalls: [
                    { id: 'call_1', name: 'tool_a', arguments: 'not json' },
                ],
            },
        ];
        const result = toAnthropicMessages(messages);
        const content = result[0]?.content;
        // Empty string content is falsy, so no text block added -- only tool_use block at index 0
        expect(content[0]?.input).toEqual({});
    });
});
// ---------------------------------------------------------------------------
// toAnthropicTools
// ---------------------------------------------------------------------------
describe('toAnthropicTools', () => {
    it('should convert osaI ToolDefinition to Anthropic Tool', () => {
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'get_weather',
                    description: 'Get weather for a location',
                    parameters: {
                        type: 'object',
                        properties: {
                            location: { type: 'string' },
                        },
                        required: ['location'],
                    },
                },
            },
        ];
        const result = toAnthropicTools(tools);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            name: 'get_weather',
            description: 'Get weather for a location',
            input_schema: {
                type: 'object',
                properties: {
                    location: { type: 'string' },
                },
                required: ['location'],
            },
        });
    });
    it('should handle tool without parameters', () => {
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'ping',
                },
            },
        ];
        const result = toAnthropicTools(tools);
        expect(result[0]).toEqual({
            name: 'ping',
            description: undefined,
            input_schema: {
                type: 'object',
            },
        });
    });
    it('should convert multiple tools', () => {
        const tools = [
            {
                type: 'function',
                function: { name: 'tool_a' },
            },
            {
                type: 'function',
                function: { name: 'tool_b' },
            },
        ];
        const result = toAnthropicTools(tools);
        expect(result).toHaveLength(2);
        expect(result[0]?.name).toBe('tool_a');
        expect(result[1]?.name).toBe('tool_b');
    });
});
// ---------------------------------------------------------------------------
// fromAnthropicContent
// ---------------------------------------------------------------------------
describe('fromAnthropicContent', () => {
    it('should extract text content from TextBlock', () => {
        const blocks = [
            { type: 'text', text: 'Hello from Claude!' },
        ];
        const result = fromAnthropicContent(blocks, 'end_turn');
        expect(result.content).toBe('Hello from Claude!');
        expect(result.toolCalls).toHaveLength(0);
        expect(result.finishReason).toBe('stop');
    });
    it('should concatenate multiple text blocks', () => {
        const blocks = [
            { type: 'text', text: 'Part 1 ' },
            { type: 'text', text: 'Part 2' },
        ];
        const result = fromAnthropicContent(blocks, 'end_turn');
        expect(result.content).toBe('Part 1 Part 2');
    });
    it('should convert tool_use blocks to ToolCall[] (TT-002-31)', () => {
        const blocks = [
            {
                type: 'tool_use',
                id: 'toolu_01',
                name: 'get_weather',
                input: { location: 'Moscow', units: 'celsius' },
            },
        ];
        const result = fromAnthropicContent(blocks, 'tool_use');
        expect(result.content).toBe('');
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0]).toEqual({
            id: 'toolu_01',
            name: 'get_weather',
            arguments: '{"location":"Moscow","units":"celsius"}',
        });
        expect(result.finishReason).toBe('tool_calls');
    });
    it('should extract both text and tool calls from mixed content', () => {
        const blocks = [
            { type: 'text', text: 'Let me check.' },
            {
                type: 'tool_use',
                id: 'toolu_02',
                name: 'search',
                input: { query: 'test' },
            },
        ];
        const result = fromAnthropicContent(blocks, 'tool_use');
        expect(result.content).toBe('Let me check.');
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0]?.name).toBe('search');
    });
    it('should handle empty tool input', () => {
        const blocks = [
            {
                type: 'tool_use',
                id: 'toolu_03',
                name: 'ping',
                input: {},
            },
        ];
        const result = fromAnthropicContent(blocks, 'tool_use');
        expect(result.toolCalls[0]?.arguments).toBe('{}');
    });
    it('should map stop_reason: end_turn -> stop', () => {
        const result = fromAnthropicContent([{ type: 'text', text: '' }], 'end_turn');
        expect(result.finishReason).toBe('stop');
    });
    it('should map stop_reason: max_tokens -> length', () => {
        const result = fromAnthropicContent([{ type: 'text', text: '' }], 'max_tokens');
        expect(result.finishReason).toBe('length');
    });
    it('should map stop_reason: tool_use -> tool_calls (TT-002-33)', () => {
        const result = fromAnthropicContent([{ type: 'tool_use', id: 't1', name: 'f', input: {} }], 'tool_use');
        expect(result.finishReason).toBe('tool_calls');
        expect(result.toolCalls).toHaveLength(1);
    });
    it('should handle null stop_reason', () => {
        const result = fromAnthropicContent([{ type: 'text', text: '' }], null);
        expect(result.finishReason).toBeUndefined();
    });
    it('should pass through unknown stop reasons', () => {
        const result = fromAnthropicContent([{ type: 'text', text: '' }], 'pause_turn');
        expect(result.finishReason).toBe('pause_turn');
    });
    it('should ignore non-text, non-tool_use blocks', () => {
        const blocks = [
            { type: 'text', text: 'Thinking' },
            { type: 'thinking', text: '(internal reasoning)', thinking: 'reasoning' },
            { type: 'text', text: 'Done' },
        ];
        const result = fromAnthropicContent(blocks, 'end_turn');
        expect(result.content).toBe('ThinkingDone');
    });
});
//# sourceMappingURL=message-converter.test.js.map