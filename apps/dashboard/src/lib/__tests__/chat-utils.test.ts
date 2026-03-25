/**
 * Tests for chat utility functions.
 */
import { describe, it, expect } from 'vitest';
import { generateMessageId, formatTimestamp } from '../components/chat-utils';

describe('generateMessageId', () => {
  it('returns a string starting with "msg-"', () => {
    const id = generateMessageId();
    expect(id).toMatch(/^msg-/);
  });

  it('returns unique IDs', () => {
    const id1 = generateMessageId();
    const id2 = generateMessageId();
    expect(id1).not.toBe(id2);
  });
});

describe('formatTimestamp', () => {
  it('formats today timestamp as HH:MM', () => {
    const today = new Date();
    today.setHours(14, 30, 0, 0);
    const result = formatTimestamp(today.toISOString());
    // Should not contain month/day names for today's date
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('formats old timestamp with month and day', () => {
    const oldDate = new Date('2025-06-15T10:30:00Z');
    const result = formatTimestamp(oldDate.toISOString());
    // Should contain month abbreviation
    expect(result).toMatch(/Jun/);
  });
});
