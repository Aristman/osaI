/**
 * Utility functions for memory search components.
 */

export type MemoryCategory = 'fact' | 'preference' | 'knowledge' | 'error' | 'pattern';

export interface MemorySearchResult {
  id: string;
  content: string;
  category: MemoryCategory;
  confidence: number;
  tags: string[];
  source: string;
  createdAt: string;
}

export interface MemorySearchResponse {
  results: MemorySearchResult[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MemoryCategoryOption {
  value: MemoryCategory | null;
  label: string;
}

/**
 * Available memory categories for filtering.
 */
export const MEMORY_CATEGORIES: MemoryCategoryOption[] = [
  { value: null, label: 'All' },
  { value: 'fact', label: 'Facts' },
  { value: 'preference', label: 'Preferences' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'error', label: 'Errors' },
  { value: 'pattern', label: 'Patterns' }
];

/**
 * Get human-readable label for a memory category.
 */
export function getCategoryLabel(category: MemoryCategory): string {
  const labels: Record<MemoryCategory, string> = {
    fact: 'Fact',
    preference: 'Preference',
    knowledge: 'Knowledge',
    error: 'Error',
    pattern: 'Pattern'
  };
  return labels[category] ?? 'Unknown';
}

/**
 * Get TailwindCSS color classes for a category badge.
 */
export function getCategoryColorClass(category: MemoryCategory): string {
  const colors: Record<MemoryCategory, string> = {
    fact: 'bg-osai-primary-500/20 text-osai-primary-300',
    preference: 'bg-purple-500/20 text-purple-300',
    knowledge: 'bg-osai-accent-500/20 text-osai-accent-400',
    error: 'bg-red-500/20 text-red-300',
    pattern: 'bg-amber-500/20 text-amber-300'
  };
  return colors[category] ?? 'bg-gray-500/20 text-gray-300';
}

/**
 * Convert 0-1 confidence value to percentage string.
 */
export function getConfidencePercentage(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Get TailwindCSS color class for confidence bar based on value.
 */
export function getConfidenceColorClass(confidence: number): string {
  if (confidence >= 0.75) {
    return 'bg-green-500';
  }
  if (confidence >= 0.4) {
    return 'bg-yellow-500';
  }
  return 'bg-red-500';
}

/**
 * Format an ISO date string to a human-readable format.
 */
export function formatMemoryDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Truncate content string with ellipsis.
 */
export function truncateContent(content: string, maxLength = 150): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + '...';
}
