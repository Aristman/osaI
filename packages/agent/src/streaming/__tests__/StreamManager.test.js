/**
 * Unit tests for StreamManager
 *
 * Covers: T-006 Streaming + Persistence acceptance criteria
 *   - TC-006-1: StreamManager calls callback for each chunk
 *   - TC-006-2: StreamManager emits complete event
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamManager } from '../StreamManager.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createChunk(overrides) {
    return {
        content: 'Hello',
        model: 'glm-5',
        provider: 'z-ai',
        hasToolCalls: false,
        ...overrides,
    };
}
/**
 * Create an async iterable that yields the given chunks.
 */
async function* streamFromChunks(chunks) {
    for (const chunk of chunks) {
        yield chunk;
    }
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('StreamManager', () => {
    let manager;
    beforeEach(() => {
        manager = new StreamManager();
    });
    describe('constructor', () => {
        it('should create without callback', () => {
            expect(() => new StreamManager()).not.toThrow();
        });
        it('should create with callback', () => {
            const cb = vi.fn();
            expect(() => new StreamManager(cb)).not.toThrow();
        });
    });
    describe('processStream', () => {
        it('TC-006-1: should call callback for each chunk', async () => {
            const callback = vi.fn();
            manager = new StreamManager(callback);
            const chunks = [
                createChunk({ content: 'Hello' }),
                createChunk({ content: ' world' }),
                createChunk({ content: '!' }),
            ];
            await manager.processStream(streamFromChunks(chunks));
            expect(callback).toHaveBeenCalledTimes(3);
            // First call
            const call0 = callback.mock.calls[0][0];
            expect(call0).toEqual({
                content: 'Hello',
                model: 'glm-5',
                provider: 'z-ai',
                hasToolCalls: false,
            });
            // Second call
            const call1 = callback.mock.calls[1][0];
            expect(call1.content).toBe(' world');
            // Third call
            const call2 = callback.mock.calls[2][0];
            expect(call2.content).toBe('!');
        });
        it('TC-006-2: should emit complete event after stream ends', async () => {
            const listener = vi.fn();
            manager.on('complete', listener);
            const chunks = [
                createChunk({ content: 'Test' }),
            ];
            const fullText = await manager.processStream(streamFromChunks(chunks));
            expect(listener).toHaveBeenCalledTimes(1);
            const event = listener.mock.calls[0][0];
            expect(event.type).toBe('complete');
            expect(event.fullText).toBe('Test');
            expect(event.model).toBe('glm-5');
            expect(event.provider).toBe('z-ai');
        });
        it('should accumulate full text from all chunks', async () => {
            const chunks = [
                createChunk({ content: 'A' }),
                createChunk({ content: 'B' }),
                createChunk({ content: 'C' }),
            ];
            const fullText = await manager.processStream(streamFromChunks(chunks));
            expect(fullText).toBe('ABC');
        });
        it('should return accumulated full text', async () => {
            const chunks = [
                createChunk({ content: 'Hello' }),
                createChunk({ content: ' world' }),
            ];
            const result = await manager.processStream(streamFromChunks(chunks));
            expect(result).toBe('Hello world');
        });
        it('should work with empty stream', async () => {
            const fullText = await manager.processStream(streamFromChunks([]));
            expect(fullText).toBe('');
        });
        it('should expose accumulated text via getAccumulatedText()', async () => {
            const chunks = [
                createChunk({ content: 'X' }),
                createChunk({ content: 'Y' }),
            ];
            await manager.processStream(streamFromChunks(chunks));
            expect(manager.getAccumulatedText()).toBe('XY');
        });
        it('should reset accumulated text on new processStream call', async () => {
            const chunks1 = [createChunk({ content: 'First' })];
            const chunks2 = [createChunk({ content: 'Second' })];
            await manager.processStream(streamFromChunks(chunks1));
            expect(manager.getAccumulatedText()).toBe('First');
            await manager.processStream(streamFromChunks(chunks2));
            expect(manager.getAccumulatedText()).toBe('Second');
        });
        it('should pass chunks with tool calls to callback', async () => {
            const callback = vi.fn();
            manager = new StreamManager(callback);
            const toolCall = {
                id: 'tc-001',
                name: 'read_file',
                arguments: '{"path": "/test.txt"}',
            };
            const chunks = [
                createChunk({
                    content: '',
                    hasToolCalls: true,
                    toolCalls: [toolCall],
                }),
            ];
            await manager.processStream(streamFromChunks(chunks));
            expect(callback).toHaveBeenCalledTimes(1);
            const streamChunk = callback.mock.calls[0][0];
            expect(streamChunk.hasToolCalls).toBe(true);
            expect(streamChunk.toolCalls).toEqual([toolCall]);
        });
        it('should include model and provider from last chunk in complete event', async () => {
            const listener = vi.fn();
            manager.on('complete', listener);
            const chunks = [
                createChunk({ content: 'A', model: 'model-v1', provider: 'provider-a' }),
                createChunk({ content: 'B', model: 'model-v2', provider: 'provider-b' }),
            ];
            await manager.processStream(streamFromChunks(chunks));
            const event = listener.mock.calls[0][0];
            expect(event.model).toBe('model-v2');
            expect(event.provider).toBe('provider-b');
        });
        it('should handle chunks with empty content', async () => {
            const chunks = [
                createChunk({ content: '' }),
                createChunk({ content: '' }),
            ];
            const fullText = await manager.processStream(streamFromChunks(chunks));
            expect(fullText).toBe('');
        });
        it('should work without callback (no error)', async () => {
            const chunks = [
                createChunk({ content: 'No callback' }),
            ];
            const fullText = await manager.processStream(streamFromChunks(chunks));
            expect(fullText).toBe('No callback');
        });
    });
    describe('event listeners', () => {
        it('should support multiple listeners for complete event', async () => {
            const listener1 = vi.fn();
            const listener2 = vi.fn();
            manager.on('complete', listener1);
            manager.on('complete', listener2);
            const chunks = [createChunk({ content: 'Test' })];
            await manager.processStream(streamFromChunks(chunks));
            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
        });
        it('should support removeListener', async () => {
            const listener = vi.fn();
            manager.on('complete', listener);
            manager.removeListener('complete', listener);
            const chunks = [createChunk({ content: 'Test' })];
            await manager.processStream(streamFromChunks(chunks));
            expect(listener).not.toHaveBeenCalled();
        });
        it('should support removeAllListeners', async () => {
            const listener = vi.fn();
            manager.on('complete', listener);
            manager.removeAllListeners();
            const chunks = [createChunk({ content: 'Test' })];
            await manager.processStream(streamFromChunks(chunks));
            expect(listener).not.toHaveBeenCalled();
        });
        it('should support chunk event', async () => {
            const chunkListener = vi.fn();
            manager.on('chunk', chunkListener);
            const chunks = [
                createChunk({ content: 'Hi' }),
                createChunk({ content: ' there' }),
            ];
            await manager.processStream(streamFromChunks(chunks));
            expect(chunkListener).toHaveBeenCalledTimes(2);
            const event0 = chunkListener.mock.calls[0][0];
            expect(event0.content).toBe('Hi');
            const event1 = chunkListener.mock.calls[1][0];
            expect(event1.content).toBe(' there');
        });
    });
});
//# sourceMappingURL=StreamManager.test.js.map