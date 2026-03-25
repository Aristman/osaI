/**
 * T006-UNIT-001: Search input triggers API call
 * T006-UNIT-003: Category filter works
 * T006-UNIT-004: Empty state displays
 *
 * Integration test: memory store + API mock flow.
 * Tests the full search -> filter -> empty state cycle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const mockResults = [
  {
    id: 'mem-1',
    content: 'User prefers dark mode',
    category: 'preference' as const,
    confidence: 0.92,
    tags: ['ui'],
    source: 'session-1',
    createdAt: '2026-01-15T10:00:00Z'
  },
  {
    id: 'mem-2',
    content: 'User works at Acme Corp',
    category: 'fact' as const,
    confidence: 0.85,
    tags: ['work'],
    source: 'session-2',
    createdAt: '2026-01-16T10:00:00Z'
  },
  {
    id: 'mem-3',
    content: 'Error: failed to connect to DB',
    category: 'error' as const,
    confidence: 0.99,
    tags: ['database'],
    source: 'session-3',
    createdAt: '2026-01-17T10:00:00Z'
  }
];

describe('Memory Search Integration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('T006-UNIT-001: full search flow from query to results', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResults, total: 3, page: 1, pageSize: 20 })
    });

    const { memoryStore, searchMemory } = await import('../stores/memory');

    // Initial state
    expect(get(memoryStore).isSearching).toBe(false);
    expect(get(memoryStore).searchResults).toEqual([]);

    // Trigger search
    const searchPromise = searchMemory('user preferences');

    // During search
    expect(get(memoryStore).isSearching).toBe(true);
    expect(get(memoryStore).searchQuery).toBe('user preferences');

    await searchPromise;

    // After search
    expect(get(memoryStore).isSearching).toBe(false);
    expect(get(memoryStore).searchResults).toHaveLength(3);
    expect(get(memoryStore).error).toBe(null);
  });

  it('T006-UNIT-003: search with category filter then clear filter', async () => {
    // First search without filter
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResults, total: 3, page: 1, pageSize: 20 })
    });

    const { memoryStore, searchMemory, setSelectedCategory } = await import('../stores/memory');

    await searchMemory('user');

    expect(get(memoryStore).searchResults).toHaveLength(3);

    // Set category filter and search again
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [mockResults[1]],
        total: 1,
        page: 1,
        pageSize: 20
      })
    });

    setSelectedCategory('fact');
    await searchMemory('user');

    // API should include category param
    const secondCallUrl = fetchMock.mock.calls[1]?.[0] as string;
    expect(secondCallUrl).toContain('category=fact');

    // Results filtered to facts only
    expect(get(memoryStore).searchResults).toHaveLength(1);
    expect(get(memoryStore).searchResults[0]?.category).toBe('fact');

    // Clear filter
    setSelectedCategory(null);
    expect(get(memoryStore).selectedCategory).toBe(null);
  });

  it('T006-UNIT-004: empty state after search with no results', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [], total: 0, page: 1, pageSize: 20 })
    });

    const { memoryStore, searchMemory } = await import('../stores/memory');

    await searchMemory('nonexistent query xyz123');

    expect(get(memoryStore).searchResults).toEqual([]);
    expect(get(memoryStore).totalFacts).toBe(0);
    expect(get(memoryStore).error).toBe(null);

    // hasMore should be false
    const { hasMore } = await import('../stores/memory');
    expect(get(hasMore)).toBe(false);
  });

  it('handles error gracefully and allows retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const { memoryStore, searchMemory, clearError } = await import('../stores/memory');

    await searchMemory('test');

    expect(get(memoryStore).error).toBe('Network error');
    expect(get(memoryStore).isSearching).toBe(false);

    // Clear error and retry
    clearError();
    expect(get(memoryStore).error).toBe(null);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResults.slice(0, 1), total: 1, page: 1, pageSize: 20 })
    });

    await searchMemory('test');
    expect(get(memoryStore).error).toBe(null);
    expect(get(memoryStore).searchResults).toHaveLength(1);
  });

  it('pagination: initial search then load more', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResults, total: 5, page: 1, pageSize: 3 })
    });

    const { memoryStore, searchMemory, loadMore } = await import('../stores/memory');

    await searchMemory('test');

    expect(get(memoryStore).searchResults).toHaveLength(3);

    // Load more
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: 'mem-4', content: 'More result', category: 'knowledge' as const, confidence: 0.7, tags: [], source: 's4', createdAt: '2026-01-18T10:00:00Z' },
          { id: 'mem-5', content: 'Another result', category: 'pattern' as const, confidence: 0.6, tags: [], source: 's5', createdAt: '2026-01-19T10:00:00Z' }
        ],
        total: 5,
        page: 2,
        pageSize: 3
      })
    });

    await loadMore();

    expect(get(memoryStore).searchResults).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second call should have page=2
    const secondCallUrl = fetchMock.mock.calls[1]?.[0] as string;
    expect(secondCallUrl).toContain('page=2');
  });
});
