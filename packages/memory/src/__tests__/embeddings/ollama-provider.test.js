/**
 * Unit tests for OllamaEmbeddingProvider (TC-001 .. TC-004).
 *
 * Uses native fetch mocking (vi.stubGlobal) to simulate Ollama HTTP API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaEmbeddingProvider } from '../../embeddings/ollama-provider.js';
import { EMBEDDING_DEFAULTS } from '../../types/embeddings.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Build a mock Response for a successful /api/embeddings call. */
function makeEmbedResponse(embedding) {
    return new Response(JSON.stringify({ embedding }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
/** Build a 768-dim vector filled with 0.01. */
function make768() {
    return new Array(EMBEDDING_DEFAULTS.ollamaDimensions).fill(0.01);
}
// ---------------------------------------------------------------------------
// TC-001: embed("hello") returns float[] with length 768
// TC-002: embed with empty string throws Error
// TC-003: isAvailable() returns true when Ollama is reachable
// TC-004: isAvailable() returns false when Ollama is unreachable
// ---------------------------------------------------------------------------
describe('OllamaEmbeddingProvider', () => {
    const originalFetch = globalThis.fetch;
    let fetchSpy;
    beforeEach(() => {
        fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
    });
    afterEach(() => {
        vi.stubGlobal('fetch', originalFetch);
        vi.restoreAllMocks();
    });
    // -----------------------------------------------------------------------
    // TC-001
    // -----------------------------------------------------------------------
    it('TC-001: embed("hello") returns EmbeddingResult with vector length 768', async () => {
        const embedding = make768();
        fetchSpy.mockResolvedValueOnce(makeEmbedResponse(embedding));
        const provider = new OllamaEmbeddingProvider();
        const result = await provider.embed('hello');
        expect(result.vector).toHaveLength(768);
        expect(result.dimensions).toBe(768);
        expect(result.provider).toBe('ollama');
        expect(typeof result.durationMs).toBe('number');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        // Verify fetch was called with correct Ollama API params
        expect(fetchSpy).toHaveBeenCalledOnce();
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe(`${EMBEDDING_DEFAULTS.ollamaEndpoint}/api/embeddings`);
        expect(init?.method).toBe('POST');
        const body = JSON.parse(init?.body);
        expect(body.model).toBe(EMBEDDING_DEFAULTS.ollamaModel);
        expect(body.prompt).toBe('hello');
    });
    // -----------------------------------------------------------------------
    // TC-002
    // -----------------------------------------------------------------------
    it('TC-002: embed with empty string throws Error', async () => {
        const provider = new OllamaEmbeddingProvider();
        await expect(provider.embed('')).rejects.toThrow();
        await expect(provider.embed('')).rejects.toThrow(/empty/i);
        // fetch should NOT have been called
        expect(fetchSpy).not.toHaveBeenCalled();
    });
    // -----------------------------------------------------------------------
    // TC-003
    // -----------------------------------------------------------------------
    it('TC-003: isAvailable() returns true when Ollama is reachable', async () => {
        // Ollama /api/embeddings returns 200 even with an empty-ish check
        fetchSpy.mockResolvedValueOnce(makeEmbedResponse(make768()));
        const provider = new OllamaEmbeddingProvider();
        const available = await provider.isAvailable();
        expect(available).toBe(true);
        expect(fetchSpy).toHaveBeenCalledOnce();
    });
    // -----------------------------------------------------------------------
    // TC-004
    // -----------------------------------------------------------------------
    it('TC-004: isAvailable() returns false when Ollama is unreachable', async () => {
        fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));
        const provider = new OllamaEmbeddingProvider();
        const available = await provider.isAvailable();
        expect(available).toBe(false);
    });
    // -----------------------------------------------------------------------
    // Additional coverage: getDimensions
    // -----------------------------------------------------------------------
    it('getDimensions returns 768', () => {
        const provider = new OllamaEmbeddingProvider();
        expect(provider.getDimensions()).toBe(768);
    });
    // -----------------------------------------------------------------------
    // Additional coverage: batch embed(texts: string[])
    // -----------------------------------------------------------------------
    it('embed(texts) batches multiple texts', async () => {
        // Each call to fetch must return a fresh Response (body can only be read once).
        fetchSpy.mockImplementation(() => Promise.resolve(makeEmbedResponse(make768())));
        const provider = new OllamaEmbeddingProvider();
        const results = await provider.embed(['hello', 'world']);
        expect(results).toHaveLength(2);
        for (const r of results) {
            expect(r.vector).toHaveLength(768);
            expect(r.dimensions).toBe(768);
            expect(r.provider).toBe('ollama');
        }
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
    // -----------------------------------------------------------------------
    // Additional coverage: embed throws on HTTP error response
    // -----------------------------------------------------------------------
    it('embed throws Error on non-200 HTTP response', async () => {
        fetchSpy.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
        const provider = new OllamaEmbeddingProvider();
        await expect(provider.embed('test')).rejects.toThrow();
    });
    // -----------------------------------------------------------------------
    // Additional coverage: embed handles non-JSON response
    // -----------------------------------------------------------------------
    it('embed throws Error when response is not valid JSON', async () => {
        fetchSpy.mockResolvedValueOnce(new Response('not json', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
        }));
        const provider = new OllamaEmbeddingProvider();
        await expect(provider.embed('test')).rejects.toThrow();
    });
});
//# sourceMappingURL=ollama-provider.test.js.map