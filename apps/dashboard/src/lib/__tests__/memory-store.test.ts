/**
 * T006-UNIT-001: Search input triggers API call
 * T006-UNIT-002: Results render correctly
 * T006-UNIT-003: Category filter works
 * T006-UNIT-004: Empty state displays
 *
 * Tests for memory search store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// --- Mock data ---

const mockSearchResult = {
  id: 'mem-1',
  content: 'User prefers dark mode for coding',
  category: 'preference' as const,
  confidence: 0.92,
  tags: ['ui', 'coding', 'preferences'],
  source: 'session-abc-123',
  createdAt: '2026-01-15T10:30:00Z'
};

const mockSearchResult2 = {
  id: 'mem-2',
  content: 'User works at Acme Corp as a developer',
  category: 'fact' as const,
  confidence: 0.85,
  tags: ['work', 'identity'],
  source: 'session-def-456',
  createdAt: '2026-01-16T14:00:00Z'
};

const mockSearchResult3 = {
  id: 'mem-3',
  content: 'TypeScript is the primary language for the project',
  category: 'knowledge' as const,
  confidence: 0.78,
  tags: ['tech', 'languages'],
  source: 'session-ghi-789',
  createdAt: '2026-01-17T09:00:00Z'
};

const mockApiResponse = {
  results: [mockSearchResult, mockSearchResult2, mockSearchResult3],
  total: 3,
  page: 1,
  pageSize: 20
};

describe('memoryStore', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  describe('initial state', () => {
    it('has empty initial state', async () => {
      const { memoryStore } = await import('../stores/memory');
      const state = get(memoryStore);
      expect(state.searchQuery).toBe('');
      expect(state.searchResults).toEqual([]);
      expect(state.isSearching).toBe(false);
      expect(state.selectedCategory).toBe(null);
      expect(state.totalFacts).toBe(0);
      expect(state.error).toBe(null);
    });
  });

  describe('T006-UNIT-001: Search input triggers API call', () => {
    it('calls fetch with correct params when search is triggered', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const { searchMemory } = await import('../stores/memory');

      await searchMemory('dark mode');

      expect(fetchMock).toHaveBeenCalledOnce();
      const callUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(callUrl).toContain('/api/v1/memory/search');
      expect(callUrl).toContain('q=');
      // URLSearchParams encodes space as '+'
      expect(callUrl).toContain('q=dark+mode');
    });

    it('includes category filter in API call when set', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const { searchMemory, setSelectedCategory } = await import('../stores/memory');

      setSelectedCategory('fact');
      await searchMemory('work');

      expect(fetchMock).toHaveBeenCalledOnce();
      const callUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(callUrl).toContain('category=fact');
    });

    it('sets isSearching to true during search and false after', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const { memoryStore, searchMemory } = await import('../stores/memory');

      const searchPromise = searchMemory('test');
      expect(get(memoryStore).isSearching).toBe(true);
      await searchPromise;
      expect(get(memoryStore).isSearching).toBe(false);
    });
  });

  describe('T006-UNIT-002: Results render correctly (store side)', () => {
    it('populates searchResults after successful search', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const { memoryStore, searchMemory } = await import('../stores/memory');

      await searchMemory('preferences');

      const state = get(memoryStore);
      expect(state.searchResults).toHaveLength(3);
      expect(state.searchResults[0]?.content).toBe('User prefers dark mode for coding');
      expect(state.searchResults[1]?.content).toBe('User works at Acme Corp as a developer');
      expect(state.totalFacts).toBe(3);
    });

    it('updates searchQuery in store', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const { memoryStore, searchMemory } = await import('../stores/memory');

      await searchMemory('my query');
      expect(get(memoryStore).searchQuery).toBe('my query');
    });
  });

  describe('T006-UNIT-003: Category filter works (store side)', () => {
    it('updates selectedCategory', async () => {
      const { memoryStore, setSelectedCategory } = await import('../stores/memory');

      expect(get(memoryStore).selectedCategory).toBe(null);

      setSelectedCategory('preference');
      expect(get(memoryStore).selectedCategory).toBe('preference');

      setSelectedCategory(null);
      expect(get(memoryStore).selectedCategory).toBe(null);
    });

    it('passes category to API call', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const { searchMemory, setSelectedCategory } = await import('../stores/memory');

      setSelectedCategory('fact');
      await searchMemory('work');

      const callUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(callUrl).toContain('category=fact');
    });
  });

  describe('T006-UNIT-004: Empty state displays (store side)', () => {
    it('returns empty results when API returns no results', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [], total: 0, page: 1, pageSize: 20 })
      });

      const { memoryStore, searchMemory } = await import('../stores/memory');

      await searchMemory('nonexistent');

      expect(get(memoryStore).searchResults).toEqual([]);
      expect(get(memoryStore).totalFacts).toBe(0);
    });
  });

  describe('error handling', () => {
    it('sets error when fetch fails', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const { memoryStore, searchMemory } = await import('../stores/memory');

      await searchMemory('test');

      expect(get(memoryStore).error).toBe('Network error');
      expect(get(memoryStore).searchResults).toEqual([]);
    });

    it('sets error when API returns non-ok response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const { memoryStore, searchMemory } = await import('../stores/memory');

      await searchMemory('test');

      expect(get(memoryStore).error).toBe('Search failed: 500');
      expect(get(memoryStore).isSearching).toBe(false);
    });
  });

  describe('pagination', () => {
    it('calls API with page parameter for loadMore', async () => {
      const pagedResponse = {
        results: [mockSearchResult],
        total: 5,
        page: 2,
        pageSize: 20
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => pagedResponse
      });

      const { searchMemory, loadMore } = await import('../stores/memory');

      await searchMemory('test');
      await loadMore();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const secondCallUrl = fetchMock.mock.calls[1]?.[0] as string;
      expect(secondCallUrl).toContain('page=2');
    });

    it('appends results on loadMore', async () => {
      const page2Response = {
        results: [{ ...mockSearchResult, id: 'mem-4', content: 'Additional result' }],
        total: 4,
        page: 2,
        pageSize: 3
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockApiResponse, pageSize: 3 })
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => page2Response
      });

      const { memoryStore, searchMemory, loadMore } = await import('../stores/memory');

      await searchMemory('test');
      expect(get(memoryStore).searchResults).toHaveLength(3);

      await loadMore();
      expect(get(memoryStore).searchResults).toHaveLength(4);
      expect(get(memoryStore).searchResults[3]?.content).toBe('Additional result');
    });

    it('hasMore derived returns false when all results loaded', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const { hasMore, searchMemory } = await import('../stores/memory');

      await searchMemory('test');
      expect(get(hasMore)).toBe(false);
    });

    it('hasMore derived returns true when more results available', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockApiResponse, total: 50, pageSize: 20 })
      });

      const { hasMore, searchMemory } = await import('../stores/memory');

      await searchMemory('test');
      expect(get(hasMore)).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets store to initial state', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const { memoryStore, searchMemory, resetMemoryStore } = await import('../stores/memory');

      await searchMemory('test');
      expect(get(memoryStore).searchResults.length).toBeGreaterThan(0);

      resetMemoryStore();
      const state = get(memoryStore);
      expect(state.searchQuery).toBe('');
      expect(state.searchResults).toEqual([]);
      expect(state.isSearching).toBe(false);
      expect(state.selectedCategory).toBe(null);
      expect(state.totalFacts).toBe(0);
      expect(state.error).toBe(null);
    });
  });

  describe('clearError', () => {
    it('clears error state', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const { memoryStore, searchMemory, clearError } = await import('../stores/memory');

      await searchMemory('test');
      expect(get(memoryStore).error).toBe('Network error');

      clearError();
      expect(get(memoryStore).error).toBe(null);
    });
  });
});
