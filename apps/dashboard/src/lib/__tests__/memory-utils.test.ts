/**
 * T006-UNIT-002: Results render correctly (utility functions)
 * Tests for memory utility functions used by MemoryResult and MemoryFilters.
 */
import { describe, it, expect } from 'vitest';

describe('memory-utils', () => {
  describe('getCategoryLabel', () => {
    it('returns correct label for each category', async () => {
      const { getCategoryLabel } = await import('../components/memory/memory-utils');
      expect(getCategoryLabel('fact')).toBe('Fact');
      expect(getCategoryLabel('preference')).toBe('Preference');
      expect(getCategoryLabel('knowledge')).toBe('Knowledge');
      expect(getCategoryLabel('error')).toBe('Error');
      expect(getCategoryLabel('pattern')).toBe('Pattern');
    });

    it('returns "Unknown" for invalid category', async () => {
      const { getCategoryLabel } = await import('../components/memory/memory-utils');
      expect(getCategoryLabel('invalid' as any)).toBe('Unknown');
    });
  });

  describe('getCategoryColorClass', () => {
    it('returns Tailwind class for category badge', async () => {
      const { getCategoryColorClass } = await import('../components/memory/memory-utils');
      expect(getCategoryColorClass('fact')).toContain('bg-');
      expect(getCategoryColorClass('preference')).toContain('bg-');
      expect(getCategoryColorClass('knowledge')).toContain('bg-');
      expect(getCategoryColorClass('error')).toContain('bg-');
      expect(getCategoryColorClass('pattern')).toContain('bg-');
    });
  });

  describe('getConfidencePercentage', () => {
    it('converts 0-1 confidence to percentage string', async () => {
      const { getConfidencePercentage } = await import('../components/memory/memory-utils');
      expect(getConfidencePercentage(0.0)).toBe('0%');
      expect(getConfidencePercentage(0.5)).toBe('50%');
      expect(getConfidencePercentage(0.92)).toBe('92%');
      expect(getConfidencePercentage(1.0)).toBe('100%');
    });
  });

  describe('getConfidenceColorClass', () => {
    it('returns green for high confidence', async () => {
      const { getConfidenceColorClass } = await import('../components/memory/memory-utils');
      expect(getConfidenceColorClass(0.85)).toContain('bg-green');
    });

    it('returns yellow for medium confidence', async () => {
      const { getConfidenceColorClass } = await import('../components/memory/memory-utils');
      expect(getConfidenceColorClass(0.5)).toContain('bg-yellow');
    });

    it('returns red for low confidence', async () => {
      const { getConfidenceColorClass } = await import('../components/memory/memory-utils');
      expect(getConfidenceColorClass(0.25)).toContain('bg-red');
    });
  });

  describe('formatMemoryDate', () => {
    it('formats ISO date string to readable format', async () => {
      const { formatMemoryDate } = await import('../components/memory/memory-utils');
      const result = formatMemoryDate('2026-01-15T10:30:00Z');
      // Should contain date parts
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('truncateContent', () => {
    it('truncates long content with ellipsis', async () => {
      const { truncateContent } = await import('../components/memory/memory-utils');
      const longText = 'A'.repeat(200);
      const result = truncateContent(longText, 100);
      expect(result.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(result.endsWith('...')).toBe(true);
    });

    it('returns short content unchanged', async () => {
      const { truncateContent } = await import('../components/memory/memory-utils');
      const shortText = 'Hello world';
      expect(truncateContent(shortText, 100)).toBe(shortText);
    });

    it('uses default max length', async () => {
      const { truncateContent } = await import('../components/memory/memory-utils');
      const text = 'A'.repeat(200);
      const result = truncateContent(text);
      expect(result.length).toBeLessThanOrEqual(153); // default 150 + '...'
    });
  });

  describe('MEMORY_CATEGORIES', () => {
    it('contains all required categories', async () => {
      const { MEMORY_CATEGORIES } = await import('../components/memory/memory-utils');
      const labels = MEMORY_CATEGORIES.map(c => c.value);
      expect(labels).toContain('fact');
      expect(labels).toContain('preference');
      expect(labels).toContain('knowledge');
      expect(labels).toContain('error');
      expect(labels).toContain('pattern');
    });

    it('each category has label and value', async () => {
      const { MEMORY_CATEGORIES } = await import('../components/memory/memory-utils');
      for (const cat of MEMORY_CATEGORIES) {
        expect(cat).toHaveProperty('value');
        expect(cat).toHaveProperty('label');
        expect(cat.label).toBeTruthy();
        // value can be null for "All" filter
        expect('value' in cat).toBe(true);
      }
    });
  });
});
