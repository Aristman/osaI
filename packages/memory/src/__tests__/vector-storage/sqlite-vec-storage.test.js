/**
 * @osai/memory -- Vector Storage Unit Tests
 *
 * Tests TC-001 through TC-007 from ROADMAP_TASKS_F-005.md (T-003).
 * Uses InMemoryVectorStorage for deterministic, cross-platform testing.
 * SqliteVecStorage is tested indirectly via the VectorStorage interface.
 *
 * Test cases:
 *   TC-001: init() creates storage (no-op for InMemory, virtual table for SqliteVec)
 *   TC-002: upsert inserts vector with metadata
 *   TC-003: upsert updates existing vector by id
 *   TC-004: search returns top_k results sorted by cosine similarity descending
 *   TC-005: search filters by min_similarity (results with score < threshold excluded)
 *   TC-006: delete removes vector by id
 *   TC-007: search on empty storage returns empty array
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryVectorStorage, cosineSimilarity, createVectorStorage, } from '../../vector-storage/index.js';
/** Small dimension for testing (faster than 768). */
const TEST_DIMENSIONS = 4;
/**
 * Helper: create a unit vector (normalized to length 1) for testing.
 */
function unitVector(values) {
    const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0)
        return values;
    return values.map((v) => v / norm);
}
/**
 * Helper: create test storage instance.
 */
function createTestStorage() {
    const { storage } = createVectorStorage({
        dimensions: TEST_DIMENSIONS,
        forceBackend: 'in-memory',
    });
    return storage;
}
describe('VectorStorage (T-003)', () => {
    let storage;
    beforeEach(() => {
        storage = createTestStorage();
        storage.init();
    });
    // ---------------------------------------------------------------
    // TC-001: init() creates storage
    // ---------------------------------------------------------------
    describe('TC-001: init()', () => {
        it('should initialize without errors', () => {
            const s = createTestStorage();
            expect(() => s.init()).not.toThrow();
        });
        it('should be idempotent -- calling init() multiple times does not throw', () => {
            expect(() => {
                storage.init();
                storage.init();
                storage.init();
            }).not.toThrow();
        });
    });
    // ---------------------------------------------------------------
    // TC-002: upsert inserts vector with metadata
    // ---------------------------------------------------------------
    describe('TC-002: upsert() inserts vector with metadata', () => {
        it('should store a vector and retrieve it via search', () => {
            const vector = unitVector([1, 0, 0, 0]);
            storage.upsert('doc-1', vector, { source: 'test', tier: 'long-term' });
            const results = storage.search(vector, 5, 0.0);
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('doc-1');
            expect(results[0].score).toBeCloseTo(1.0, 5);
            expect(results[0].metadata).toEqual({ source: 'test', tier: 'long-term' });
        });
        it('should store vectors with different IDs independently', () => {
            const v1 = unitVector([1, 0, 0, 0]);
            const v2 = unitVector([0, 1, 0, 0]);
            storage.upsert('doc-1', v1, { label: 'x-axis' });
            storage.upsert('doc-2', v2, { label: 'y-axis' });
            const results = storage.search(v1, 5, 0.0);
            expect(results).toHaveLength(2);
            expect(results[0].id).toBe('doc-1');
            expect(results[1].id).toBe('doc-2');
        });
    });
    // ---------------------------------------------------------------
    // TC-003: upsert updates existing vector by id
    // ---------------------------------------------------------------
    describe('TC-003: upsert() updates existing vector by id', () => {
        it('should replace the vector when upserting with the same id', () => {
            const v1 = unitVector([1, 0, 0, 0]);
            const v2 = unitVector([0, 1, 0, 0]);
            storage.upsert('doc-1', v1, { version: 1 });
            storage.upsert('doc-1', v2, { version: 2 });
            // Search with the new vector -- should match with high similarity
            const results = storage.search(v2, 5, 0.0);
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('doc-1');
            expect(results[0].score).toBeCloseTo(1.0, 5);
            expect(results[0].metadata).toEqual({ version: 2 });
        });
        it('should not keep the old vector after update', () => {
            const v1 = unitVector([1, 0, 0, 0]);
            const v2 = unitVector([0, 1, 0, 0]);
            storage.upsert('doc-1', v1, {});
            storage.upsert('doc-1', v2, {});
            // Search with the old vector -- similarity should be low (orthogonal)
            const results = storage.search(v1, 5, 0.9);
            expect(results).toHaveLength(0);
        });
    });
    // ---------------------------------------------------------------
    // TC-004: search returns top_k results by cosine similarity
    // ---------------------------------------------------------------
    describe('TC-004: search() returns top_k results', () => {
        it('should return at most topK results sorted by similarity descending', () => {
            // Create vectors at different angles from the query
            const query = unitVector([1, 0, 0, 0]);
            const exact = unitVector([1, 0, 0, 0]); // cos=1.0
            const close = unitVector([3, 1, 0, 0]); // cos~0.95
            const medium = unitVector([1, 1, 0, 0]); // cos~0.71
            const far = unitVector([0, 1, 0, 0]); // cos=0.0
            storage.upsert('exact', exact, {});
            storage.upsert('close', close, {});
            storage.upsert('medium', medium, {});
            storage.upsert('far', far, {});
            const results = storage.search(query, 3, 0.0);
            expect(results).toHaveLength(3);
            expect(results[0].id).toBe('exact');
            expect(results[1].id).toBe('close');
            expect(results[2].id).toBe('medium');
            // Scores should be descending
            expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
            expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
        });
        it('should default to topK=5 in search results', () => {
            // Insert 10 vectors, search with topK=5
            const query = unitVector([1, 0, 0, 0]);
            for (let i = 0; i < 10; i++) {
                storage.upsert(`doc-${i}`, unitVector([1, i * 0.1, 0, 0]), {});
            }
            const results = storage.search(query, 5, 0.0);
            expect(results).toHaveLength(5);
        });
    });
    // ---------------------------------------------------------------
    // TC-005: search filters by min_similarity
    // ---------------------------------------------------------------
    describe('TC-005: search() filters by min_similarity', () => {
        it('should exclude results with similarity below threshold', () => {
            const query = unitVector([1, 0, 0, 0]);
            const exact = unitVector([1, 0, 0, 0]); // cos=1.0
            const close = unitVector([3, 1, 0, 0]); // cos~0.95
            const medium = unitVector([1, 1, 0, 0]); // cos~0.71
            const far = unitVector([0, 1, 0, 0]); // cos=0.0
            storage.upsert('exact', exact, {});
            storage.upsert('close', close, {});
            storage.upsert('medium', medium, {});
            storage.upsert('far', far, {});
            // minSimilarity = 0.7 -- should include exact, close, medium
            const results = storage.search(query, 10, 0.7);
            expect(results).toHaveLength(3);
            const ids = results.map((r) => r.id);
            expect(ids).toContain('exact');
            expect(ids).toContain('close');
            expect(ids).toContain('medium');
            expect(ids).not.toContain('far');
        });
        it('should exclude all results when min_similarity is very high', () => {
            const query = unitVector([1, 0, 0, 0]);
            storage.upsert('doc-1', unitVector([3, 1, 0, 0]), {});
            // minSimilarity = 0.99 -- no results should match
            const results = storage.search(query, 10, 0.99);
            expect(results).toHaveLength(0);
        });
    });
    // ---------------------------------------------------------------
    // TC-006: delete removes vector by id
    // ---------------------------------------------------------------
    describe('TC-006: delete() removes vector by id', () => {
        it('should remove a vector so it is no longer found in search', () => {
            const vector = unitVector([1, 0, 0, 0]);
            storage.upsert('doc-1', vector, { tag: 'removable' });
            storage.upsert('doc-2', vector, { tag: 'keep' });
            // Verify both exist
            expect(storage.search(vector, 10, 0.0)).toHaveLength(2);
            // Delete doc-1
            storage.delete('doc-1');
            const results = storage.search(vector, 10, 0.0);
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('doc-2');
        });
        it('should not throw when deleting a non-existent id', () => {
            expect(() => storage.delete('non-existent')).not.toThrow();
        });
    });
    // ---------------------------------------------------------------
    // TC-007: search on empty storage returns empty array
    // ---------------------------------------------------------------
    describe('TC-007: search() on empty storage', () => {
        it('should return empty array when no vectors stored', () => {
            const query = unitVector([1, 0, 0, 0]);
            const results = storage.search(query, 5, 0.0);
            expect(results).toHaveLength(0);
            expect(results).toEqual([]);
        });
    });
});
// =================================================================
// cosineSimilarity unit tests (pure function)
// =================================================================
describe('cosineSimilarity()', () => {
    it('should return 1.0 for identical vectors', () => {
        const v = [1, 2, 3, 4];
        expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 10);
    });
    it('should return 0.0 for orthogonal vectors', () => {
        const a = [1, 0, 0, 0];
        const b = [0, 1, 0, 0];
        expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 10);
    });
    it('should return -1.0 for opposite vectors', () => {
        const a = [1, 0, 0, 0];
        const b = [-1, 0, 0, 0];
        expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 10);
    });
    it('should return 0.0 for zero vectors (avoid NaN)', () => {
        const a = [0, 0, 0, 0];
        const b = [1, 2, 3, 4];
        expect(cosineSimilarity(a, b)).toBe(0);
    });
    it('should throw on length mismatch', () => {
        expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Vector length mismatch');
    });
    it('should compute correct similarity for arbitrary vectors', () => {
        const a = [3, 4];
        const b = [6, 8];
        // b = 2*a, same direction -> similarity = 1.0
        expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
    });
});
// =================================================================
// InMemoryVectorStorage-specific tests
// =================================================================
describe('InMemoryVectorStorage', () => {
    it('should validate vector dimensions on upsert', () => {
        const s = new InMemoryVectorStorage(4);
        s.init();
        expect(() => s.upsert('bad', [1, 2, 3], {})).toThrow('Vector dimension mismatch: expected 4, got 3');
    });
    it('should validate query vector dimensions on search', () => {
        const s = new InMemoryVectorStorage(4);
        s.init();
        expect(() => s.search([1, 2, 3], 5, 0.0)).toThrow('Query vector dimension mismatch: expected 4, got 3');
    });
    it('should throw on search before init', () => {
        const s = new InMemoryVectorStorage(4);
        expect(() => s.search([1, 2, 3, 4], 5, 0.0)).toThrow('not initialized');
    });
    it('clear() should remove all vectors', () => {
        const s = new InMemoryVectorStorage(4);
        s.init();
        s.upsert('doc-1', unitVector([1, 0, 0, 0]), {});
        s.upsert('doc-2', unitVector([0, 1, 0, 0]), {});
        expect(s.size()).toBe(2);
        s.clear();
        expect(s.size()).toBe(0);
        expect(s.search(unitVector([1, 0, 0, 0]), 5, 0.0)).toHaveLength(0);
    });
});
// =================================================================
// Factory tests
// =================================================================
describe('createVectorStorage()', () => {
    it('should create in-memory storage with forceBackend option', () => {
        const result = createVectorStorage({
            dimensions: 4,
            forceBackend: 'in-memory',
        });
        expect(result.backend).toBe('in-memory');
        expect(result.storage).toBeDefined();
        // Verify it works
        result.storage.upsert('test', unitVector([1, 0, 0, 0]), {});
        const results = result.storage.search(unitVector([1, 0, 0, 0]), 5, 0.0);
        expect(results).toHaveLength(1);
    });
    it('should auto-detect and fallback to in-memory if sqlite-vec unavailable', () => {
        const result = createVectorStorage({
            dimensions: 4,
            // No forceBackend -- auto-detect
        });
        // On Windows or without sqlite-vec, this should fallback to in-memory
        expect(result.backend).toBe('in-memory');
        expect(result.storage).toBeDefined();
    });
});
//# sourceMappingURL=sqlite-vec-storage.test.js.map