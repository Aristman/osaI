/**
 * Unit tests for BaseLLMProvider.
 * T-001: LLMProvider Interface + Types
 */
import { describe, it, expect } from 'vitest';
import { BaseLLMProvider } from '../base.js';
import { ProviderStatus } from '../types.js';
// ---------------------------------------------------------------------------
// Concrete implementation for testing
// ---------------------------------------------------------------------------
class TestProvider extends BaseLLMProvider {
    _available;
    constructor(available, config = {
        id: 'test',
        name: 'Test Provider',
        baseUrl: 'http://localhost',
        apiKeys: ['key'],
        defaultModel: 'test-model',
    }) {
        super(config);
        this._available = available;
    }
    async isAvailable() {
        return this._available;
    }
    async complete(request) {
        const content = 'test completion';
        const usage = this.estimateUsage(request.messages, content);
        return this.buildResponse(request, content, usage);
    }
    async *stream(request) {
        const words = ['Hello', ' ', 'world'];
        for (const word of words) {
            yield this.buildChunk(request, word);
        }
        // Final chunk with finishReason
        yield this.buildChunk(request, '', { finishReason: 'stop' });
    }
    setAvailable(value) {
        this._available = value;
    }
}
// ---------------------------------------------------------------------------
// Constructor and identity
// ---------------------------------------------------------------------------
describe('BaseLLMProvider', () => {
    it('should set id and name from config', () => {
        const provider = new TestProvider(true, {
            id: 'my-provider',
            name: 'My Provider',
            baseUrl: 'http://example.com',
            apiKeys: ['k1'],
            defaultModel: 'm1',
        });
        expect(provider.id).toBe('my-provider');
        expect(provider.name).toBe('My Provider');
    });
    it('should default status to Unknown', () => {
        const provider = new TestProvider(true);
        expect(provider.getStatus()).toBe(ProviderStatus.Unknown);
    });
});
// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------
describe('BaseLLMProvider.isAvailable', () => {
    it('should return true when provider is available', async () => {
        const provider = new TestProvider(true);
        expect(await provider.isAvailable()).toBe(true);
    });
    it('should return false when provider is unavailable', async () => {
        const provider = new TestProvider(false);
        expect(await provider.isAvailable()).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// countTokens
// ---------------------------------------------------------------------------
describe('BaseLLMProvider.countTokens', () => {
    it('should estimate tokens as ceil(characters / 4)', () => {
        const provider = new TestProvider(true);
        // 8 chars -> ceil(8/4) = 2
        expect(provider.countTokens('abcdefgh')).toBe(2);
        // 1 char -> ceil(1/4) = 1
        expect(provider.countTokens('a')).toBe(1);
        // 0 chars -> ceil(0/4) = 0
        expect(provider.countTokens('')).toBe(0);
        // 10 chars -> ceil(10/4) = 3
        expect(provider.countTokens('abcdefghij')).toBe(3);
    });
});
// ---------------------------------------------------------------------------
// complete
// ---------------------------------------------------------------------------
describe('BaseLLMProvider.complete', () => {
    it('should return LLMResponse with correct provider and model', async () => {
        const provider = new TestProvider(true);
        const request = {
            model: 'glm-5',
            messages: [{ role: 'user', content: 'Hello' }],
        };
        const response = await provider.complete(request);
        expect(response.content).toBe('test completion');
        expect(response.provider).toBe('test');
        expect(response.model).toBe('glm-5');
        expect(response.usage.totalTokens).toBeGreaterThan(0);
    });
    it('should calculate usage from messages and completion', async () => {
        const provider = new TestProvider(true);
        const request = {
            model: 'm',
            messages: [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Hello' },
            ],
        };
        const response = await provider.complete(request);
        // "You are helpful." = 16 chars -> ceil(16/4) = 4 prompt tokens
        // "Hello" = 5 chars -> ceil(5/4) = 2 prompt tokens (but estimated from joined string)
        // Combined prompt text = 21 chars -> ceil(21/4) = 6 prompt tokens
        // Completion "test completion" = 15 chars -> ceil(15/4) = 4 completion tokens
        expect(response.usage.promptTokens).toBe(6);
        expect(response.usage.completionTokens).toBe(4);
        expect(response.usage.totalTokens).toBe(10);
    });
});
// ---------------------------------------------------------------------------
// stream
// ---------------------------------------------------------------------------
describe('BaseLLMProvider.stream', () => {
    it('should yield LLMChunk objects via AsyncIterable', async () => {
        const provider = new TestProvider(true);
        const request = {
            model: 'm',
            messages: [],
        };
        const chunks = [];
        for await (const chunk of provider.stream(request)) {
            chunks.push(chunk);
        }
        expect(chunks).toHaveLength(4); // 3 words + 1 final chunk
        expect(chunks.map((c) => c.content).join('')).toBe('Hello world');
        expect(chunks[3].finishReason).toBe('stop');
    });
    it('chunks should have correct provider and model', async () => {
        const provider = new TestProvider(true);
        const request = {
            model: 'glm-5',
            messages: [],
        };
        for await (const chunk of provider.stream(request)) {
            expect(chunk.provider).toBe('test');
            expect(chunk.model).toBe('glm-5');
        }
    });
});
// ---------------------------------------------------------------------------
// buildResponse helper
// ---------------------------------------------------------------------------
describe('BaseLLMProvider.buildResponse', () => {
    it('should include toolCalls when provided', async () => {
        const provider = new TestProvider(true);
        // Override complete to include tool calls
        const originalComplete = provider.complete.bind(provider);
        provider.complete = async (request) => {
            const base = await originalComplete(request);
            return {
                ...base,
                toolCalls: [
                    { id: 'tc1', name: 'fn1', arguments: '{}' },
                ],
                finishReason: 'tool_calls',
            };
        };
        const response = await provider.complete({
            model: 'm',
            messages: [],
        });
        expect(response.toolCalls).toHaveLength(1);
        expect(response.finishReason).toBe('tool_calls');
    });
});
// ---------------------------------------------------------------------------
// buildUsage helper
// ---------------------------------------------------------------------------
describe('BaseLLMProvider.buildUsage', () => {
    it('should compute totalTokens from prompt and completion', () => {
        // Access protected method via a subclass method
        class UsageTestProvider extends TestProvider {
            testBuildUsage() {
                const usage = this.buildUsage({ promptTokens: 10, completionTokens: 5 });
                expect(usage.promptTokens).toBe(10);
                expect(usage.completionTokens).toBe(5);
                expect(usage.totalTokens).toBe(15);
            }
        }
        const p = new UsageTestProvider(true);
        p.testBuildUsage();
    });
});
// ---------------------------------------------------------------------------
// setStatus
// ---------------------------------------------------------------------------
describe('BaseLLMProvider.setStatus', () => {
    it('should update status', () => {
        class StatusTestProvider extends TestProvider {
            testSetStatus(status) {
                this.setStatus(status);
            }
        }
        const sp = new StatusTestProvider(true);
        expect(sp.getStatus()).toBe(ProviderStatus.Unknown);
        sp.testSetStatus(ProviderStatus.Available);
        expect(sp.getStatus()).toBe(ProviderStatus.Available);
        sp.testSetStatus(ProviderStatus.Unavailable);
        expect(sp.getStatus()).toBe(ProviderStatus.Unavailable);
        sp.testSetStatus(ProviderStatus.RateLimited);
        expect(sp.getStatus()).toBe(ProviderStatus.RateLimited);
    });
});
//# sourceMappingURL=base.test.js.map