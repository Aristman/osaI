/**
 * Memory search store.
 *
 * Manages memory search state: query, results, filters, pagination.
 * Communicates with Gateway REST API: GET /api/v1/memory/search.
 */
import { writable, derived } from 'svelte/store';
import type { MemorySearchResult, MemoryCategory, MemorySearchResponse } from '../components/memory/memory-utils';

const API_BASE = '/api/v1';
const DEFAULT_PAGE_SIZE = 20;

export interface MemoryState {
  searchQuery: string;
  searchResults: MemorySearchResult[];
  isSearching: boolean;
  selectedCategory: MemoryCategory | null;
  totalFacts: number;
  error: string | null;
  currentPage: number;
  pageSize: number;
}

const initialState: MemoryState = {
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  selectedCategory: null,
  totalFacts: 0,
  error: null,
  currentPage: 1,
  pageSize: DEFAULT_PAGE_SIZE
};

function createMemoryStore() {
  const { subscribe, set, update } = writable<MemoryState>({ ...initialState });

  /**
   * Perform memory search via REST API.
   * Resets page to 1 and replaces results.
   */
  async function search(query: string): Promise<void> {
    if (!query.trim()) {
      update((s) => ({
        ...s,
        searchQuery: '',
        searchResults: [],
        totalFacts: 0,
        error: null,
        currentPage: 1
      }));
      return;
    }

    update((s) => ({
      ...s,
      searchQuery: query,
      isSearching: true,
      error: null,
      currentPage: 1
    }));

    try {
      const params = new URLSearchParams({
        q: query,
        page: '1',
        pageSize: String(DEFAULT_PAGE_SIZE)
      });

      const state = getInternalState();
      if (state.selectedCategory) {
        params.set('category', state.selectedCategory);
      }

      const response = await fetch(`${API_BASE}/memory/search?${params.toString()}`);

      if (!response.ok) {
        update((s) => ({
          ...s,
          isSearching: false,
          error: `Search failed: ${response.status}`
        }));
        return;
      }

      const data: MemorySearchResponse = await response.json();

      update((s) => ({
        ...s,
        searchResults: data.results,
        totalFacts: data.total,
        isSearching: false,
        currentPage: data.page
      }));
    } catch (err) {
      update((s) => ({
        ...s,
        isSearching: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }));
    }
  }

  /**
   * Load next page of results.
   * Appends results to existing list.
   */
  async function loadMore(): Promise<void> {
    const state = getInternalState();
    if (state.isSearching || !state.searchQuery) return;

    const nextPage = state.currentPage + 1;

    update((s) => ({
      ...s,
      isSearching: true
    }));

    try {
      const params = new URLSearchParams({
        q: state.searchQuery,
        page: String(nextPage),
        pageSize: String(state.pageSize)
      });

      if (state.selectedCategory) {
        params.set('category', state.selectedCategory);
      }

      const response = await fetch(`${API_BASE}/memory/search?${params.toString()}`);

      if (!response.ok) {
        update((s) => ({
          ...s,
          isSearching: false,
          error: `Search failed: ${response.status}`
        }));
        return;
      }

      const data: MemorySearchResponse = await response.json();

      update((s) => ({
        ...s,
        searchResults: [...s.searchResults, ...data.results],
        totalFacts: data.total,
        isSearching: false,
        currentPage: data.page
      }));
    } catch (err) {
      update((s) => ({
        ...s,
        isSearching: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }));
    }
  }

  /**
   * Set the selected category filter.
   */
  function setCategory(category: MemoryCategory | null): void {
    update((s) => ({
      ...s,
      selectedCategory: category
    }));
  }

  /**
   * Clear error state.
   */
  function clearError(): void {
    update((s) => ({
      ...s,
      error: null
    }));
  }

  /**
   * Reset store to initial state.
   */
  function reset(): void {
    set({ ...initialState });
  }

  /**
   * Get current state without subscribing.
   * Internal helper for use inside actions.
   */
  function getInternalState(): MemoryState {
    let currentState: MemoryState = initialState;
    subscribe((s) => { currentState = s; })();
    return currentState;
  }

  return {
    subscribe,
    search,
    loadMore,
    setCategory,
    clearError,
    reset
  };
}

export const memoryStore = createMemoryStore();

/**
 * Derived store: true when there are more results to load.
 */
export const hasMore = derived(memoryStore, ($state) => {
  return $state.searchResults.length < $state.totalFacts;
});

/**
 * Derived store: whether a search has been performed (has query).
 */
export const hasSearched = derived(memoryStore, ($state) => {
  return $state.searchQuery.trim().length > 0;
});

// Convenience action exports
export const searchMemory = (query: string) => memoryStore.search(query);
export const loadMore = () => memoryStore.loadMore();
export const setSelectedCategory = (category: import('../components/memory/memory-utils').MemoryCategory | null) =>
  memoryStore.setCategory(category);
export const clearError = () => memoryStore.clearError();
export const resetMemoryStore = () => memoryStore.reset();
