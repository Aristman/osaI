import { describe, it, expect, beforeEach } from 'vitest';
import { Tracer } from './Tracer.js';
import type { Span } from './Tracer.js';

describe('Tracer', () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = new Tracer({ serviceName: 'test-service', enabled: true });
  });

  describe('startSpan', () => {
    it('should create a span with name and id', () => {
      const span = tracer.startSpan('test-operation');

      expect(span.name).toBe('test-operation');
      expect(span.id).toBeDefined();
      expect(typeof span.id).toBe('string');
      expect(span.startTime).toBeGreaterThan(0);
      expect(span.status).toBe('ok');
      expect(span.endTime).toBeUndefined();
      expect(span.duration).toBeUndefined();
    });

    it('should create span with attributes', () => {
      const span = tracer.startSpan('tool-call', undefined, { tool: 'bash', args: 'ls' });

      expect(span.attributes).toEqual({ tool: 'bash', args: 'ls' });
    });

    it('should create span with parentId', () => {
      const parent = tracer.startSpan('parent');
      const child = tracer.startSpan('child', parent.id);

      expect(child.parentId).toBe(parent.id);
    });

    it('should not create spans when disabled', () => {
      const disabledTracer = new Tracer({ enabled: false });
      const span = disabledTracer.startSpan('test');

      expect(span).toBeDefined();
      expect(span.name).toBe('test');
      expect(span.id).toBe('noop');
    });
  });

  describe('endSpan', () => {
    it('should end a span with ok status', () => {
      const span = tracer.startSpan('operation');
      const completed = tracer.endSpan(span.id);

      expect(completed.endTime).toBeDefined();
      expect(completed.duration).toBeDefined();
      expect(completed.duration).toBeGreaterThanOrEqual(0);
      expect(completed.status).toBe('ok');
    });

    it('should end a span with error status', () => {
      const span = tracer.startSpan('operation');
      const completed = tracer.endSpan(span.id, 'error');

      expect(completed.status).toBe('error');
    });

    it('should merge additional attributes on end', () => {
      const span = tracer.startSpan('operation', undefined, { step: 1 });
      const completed = tracer.endSpan(span.id, 'ok', { result: 'success' });

      expect(completed.attributes).toEqual({ step: 1, result: 'success' });
    });

    it('should return undefined for unknown span id', () => {
      const completed = tracer.endSpan('unknown-id');
      expect(completed).toBeUndefined();
    });
  });

  describe('addEvent', () => {
    it('should add event to active span', () => {
      const span = tracer.startSpan('operation');
      tracer.addEvent(span.id, 'checkpoint', { progress: 50 });

      const active = tracer.getActiveSpans();
      const found = active.find((s) => s.id === span.id);
      expect(found).toBeDefined();
      expect(found?.events).toHaveLength(1);
      expect(found?.events[0]?.name).toBe('checkpoint');
      expect(found?.events[0]?.attributes).toEqual({ progress: 50 });
      expect(found?.events[0]?.timestamp).toBeDefined();
    });

    it('should add multiple events to span', () => {
      const span = tracer.startSpan('multi-event');
      tracer.addEvent(span.id, 'event1');
      tracer.addEvent(span.id, 'event2', { key: 'value' });

      const found = tracer.getActiveSpans().find((s) => s.id === span.id);
      expect(found?.events).toHaveLength(2);
    });
  });

  describe('span lifecycle', () => {
    it('should move span from active to completed on end', () => {
      const span = tracer.startSpan('lifecycle');

      expect(tracer.getActiveSpans().length).toBe(1);
      expect(tracer.getCompletedSpans().length).toBe(0);

      tracer.endSpan(span.id);

      expect(tracer.getActiveSpans().length).toBe(0);
      expect(tracer.getCompletedSpans().length).toBe(1);
    });
  });

  describe('getCompletedSpans', () => {
    it('should return all completed spans', () => {
      tracer.startSpan('a');
      tracer.startSpan('b');
      const spanC = tracer.startSpan('c');
      tracer.endSpan(spanC.id);

      const completed = tracer.getCompletedSpans();
      expect(completed).toHaveLength(1);
      expect(completed[0]?.name).toBe('c');
    });

    it('should filter completed spans by name', () => {
      const s1 = tracer.startSpan('http-request');
      const s2 = tracer.startSpan('db-query');
      tracer.endSpan(s1.id);
      tracer.endSpan(s2.id);

      const httpSpans = tracer.getCompletedSpans({ name: 'http-request' });
      expect(httpSpans).toHaveLength(1);
      expect(httpSpans[0]?.name).toBe('http-request');
    });

    it('should filter completed spans by status', () => {
      const s1 = tracer.startSpan('ok-span');
      const s2 = tracer.startSpan('err-span');
      tracer.endSpan(s1.id, 'ok');
      tracer.endSpan(s2.id, 'error');

      const errorSpans = tracer.getCompletedSpans({ status: 'error' });
      expect(errorSpans).toHaveLength(1);
      expect(errorSpans[0]?.name).toBe('err-span');
    });

    it('should combine filters', () => {
      const s1 = tracer.startSpan('task-a');
      const s2 = tracer.startSpan('task-a');
      tracer.endSpan(s1.id, 'ok');
      tracer.endSpan(s2.id, 'error');

      const filtered = tracer.getCompletedSpans({ name: 'task-a', status: 'error' });
      expect(filtered).toHaveLength(1);
    });
  });

  describe('getActiveSpans', () => {
    it('should return all active spans', () => {
      tracer.startSpan('active-1');
      tracer.startSpan('active-2');

      const active = tracer.getActiveSpans();
      expect(active).toHaveLength(2);
    });

    it('should not include completed spans', () => {
      const span = tracer.startSpan('will-end');
      tracer.endSpan(span.id);
      tracer.startSpan('still-active');

      const active = tracer.getActiveSpans();
      expect(active).toHaveLength(1);
      expect(active[0]?.name).toBe('still-active');
    });
  });

  describe('generateTraceId', () => {
    it('should generate unique trace IDs', () => {
      const id1 = tracer.generateTraceId();
      const id2 = tracer.generateTraceId();

      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });

    it('should generate 32-character hex trace IDs', () => {
      const id = tracer.generateTraceId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('formatSpans', () => {
    it('should format spans as OTLP-like JSON', () => {
      const s1 = tracer.startSpan('parent-op');
      const s2 = tracer.startSpan('child-op', s1.id);
      tracer.endSpan(s2.id, 'ok', { result: 'done' });
      tracer.endSpan(s1.id, 'ok');

      const spans = tracer.getCompletedSpans();
      const formatted = tracer.formatSpans(spans);
      const parsed = JSON.parse(formatted);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);

      const parent = parsed.find((s: Span) => s.name === 'parent-op');
      expect(parent).toBeDefined();
      expect(parent?.duration).toBeDefined();

      const child = parsed.find((s: Record<string, unknown>) => s.name === 'child-op');
      expect(child?.parentSpanId).toBe(s1.id);
    });

    it('should return empty array for empty input', () => {
      const formatted = tracer.formatSpans([]);
      expect(JSON.parse(formatted)).toEqual([]);
    });
  });

  describe('span hierarchy', () => {
    it('should maintain parent-child relationships across multiple levels', () => {
      const root = tracer.startSpan('root');
      const child1 = tracer.startSpan('child-1', root.id);
      const child2 = tracer.startSpan('child-2', root.id);
      const grandchild = tracer.startSpan('grandchild', child1.id);

      tracer.endSpan(grandchild.id);
      tracer.endSpan(child2.id);
      tracer.endSpan(child1.id);
      tracer.endSpan(root.id);

      const allSpans = tracer.getCompletedSpans();
      expect(allSpans).toHaveLength(4);

      const gc = allSpans.find((s) => s.name === 'grandchild');
      expect(gc?.parentId).toBe(child1.id);
    });
  });
});
