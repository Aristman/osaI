/**
 * @osai/agent -- Hook System Additional Tests (T-002)
 *
 * Additional critical tests for HookRegistry beyond existing tests:
 *   - Handler returning modified data flows through to next handler
 *   - Multiple handlers at different priorities with complex data mutation
 *   - Hook error does not lose context from previous handlers
 *   - Handler count tracking across register/unregister cycles
 *   - execute() returns the context from the last successful handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookRegistry } from '../../../packages/agent/src/hooks/HookRegistry.js';
import { HookPoint } from '../../../packages/agent/src/hooks/types.js';
import type { HookContext } from '../../../packages/agent/src/hooks/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createBaseContext(overrides?: Partial<HookContext>): HookContext {
  return {
    hookPoint: HookPoint.BEFORE_INTAKE,
    sessionId: 'session-001',
    chatId: 'chat-001',
    traceId: 'trace-001',
    timestamp: new Date().toISOString(),
    data: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HookRegistry -- Complex Data Flow', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  it('should accumulate data through multiple handlers at different priorities', async () => {
    registry.register(HookPoint.BEFORE_INTAKE, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, step1: 'a', step2: 'b' },
    }), 10);

    registry.register(HookPoint.BEFORE_INTAKE, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, step3: 'c' },
    }), 5); // lower priority runs first

    registry.register(HookPoint.BEFORE_INTAKE, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, step4: 'd' },
    }), 20); // highest priority runs last

    const result = await registry.execute(HookPoint.BEFORE_INTAKE, createBaseContext());

    // All data should be accumulated
    expect(result.data['step3']).toBe('c'); // priority 5
    expect(result.data['step1']).toBe('a'); // priority 10
    expect(result.data['step2']).toBe('b'); // priority 10
    expect(result.data['step4']).toBe('d'); // priority 20
  });

  it('should allow handler to overwrite data from previous handler', async () => {
    registry.register(HookPoint.AFTER_INTAKE, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, value: 'first' },
    }), 1);

    registry.register(HookPoint.AFTER_INTAKE, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, value: 'second' },
    }), 2);

    const result = await registry.execute(HookPoint.AFTER_INTAKE, createBaseContext());

    expect(result.data['value']).toBe('second');
  });

  it('should allow later handler to delete data set by earlier handler', async () => {
    // Priority 1 runs first, sets temp and permanent
    registry.register(HookPoint.BEFORE_CONTEXT_ASSEMBLY, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, temp: 'should-be-deleted', permanent: 'stays' },
    }), 1);

    // Priority 2 runs second, deletes temp
    registry.register(HookPoint.BEFORE_CONTEXT_ASSEMBLY, (ctx) => {
      const { temp, ...rest } = ctx.data;
      return { ...ctx, data: rest };
    }, 2);

    const result = await registry.execute(
      HookPoint.BEFORE_CONTEXT_ASSEMBLY,
      createBaseContext(),
    );

    expect(result.data['temp']).toBeUndefined();
    expect(result.data['permanent']).toBe('stays');
  });
});

describe('HookRegistry -- Error Resilience and Context Preservation', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  it('should preserve all accumulated data when a handler throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    registry.register(HookPoint.BEFORE_MODEL_INFERENCE, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, a: 1, b: 2 },
    }), 1);

    registry.register(HookPoint.BEFORE_MODEL_INFERENCE, () => {
      throw new Error('Handler crash');
    }, 2);

    registry.register(HookPoint.BEFORE_MODEL_INFERENCE, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, c: 3 },
    }), 3);

    const result = await registry.execute(
      HookPoint.BEFORE_MODEL_INFERENCE,
      createBaseContext(),
    );

    // Context from handler 1 should be preserved
    expect(result.data['a']).toBe(1);
    expect(result.data['b']).toBe(2);
    // Handler 3 should have run with preserved context
    expect(result.data['c']).toBe(3);

    consoleSpy.mockRestore();
  });

  it('should continue through multiple throwing handlers', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    registry.register(HookPoint.AFTER_TOOL_EXECUTION, () => {
      throw new Error('Error 1');
    }, 1);
    registry.register(HookPoint.AFTER_TOOL_EXECUTION, () => {
      throw new Error('Error 2');
    }, 2);
    registry.register(HookPoint.AFTER_TOOL_EXECUTION, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, survived: true },
    }), 3);

    const result = await registry.execute(
      HookPoint.AFTER_TOOL_EXECUTION,
      createBaseContext(),
    );

    expect(result.data['survived']).toBe(true);
    expect(consoleSpy).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
  });

  it('should return the last successfully modified context when last handler throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    registry.register(HookPoint.BEFORE_INTAKE, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, fromHandler: 'yes' },
    }));

    registry.register(HookPoint.BEFORE_INTAKE, () => {
      throw new Error('Last handler fails');
    });

    const result = await registry.execute(HookPoint.BEFORE_INTAKE, createBaseContext());

    // Context from the first handler should be returned
    expect(result.data['fromHandler']).toBe('yes');

    consoleSpy.mockRestore();
  });
});

describe('HookRegistry -- Lifecycle Tracking', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  it('should correctly track handler count through register/unregister cycles', () => {
    const id1 = registry.register(HookPoint.BEFORE_INTAKE, () => undefined as unknown as HookContext);
    registry.register(HookPoint.BEFORE_INTAKE, () => undefined as unknown as HookContext);
    registry.register(HookPoint.AFTER_INTAKE, () => undefined as unknown as HookContext);

    expect(registry.getHandlerCount(HookPoint.BEFORE_INTAKE)).toBe(2);
    expect(registry.getHandlerCount(HookPoint.AFTER_INTAKE)).toBe(1);

    registry.unregister(HookPoint.BEFORE_INTAKE, id1);
    expect(registry.getHandlerCount(HookPoint.BEFORE_INTAKE)).toBe(1);

    // Unregister from wrong hook point should return false
    expect(registry.unregister(HookPoint.AFTER_INTAKE, id1)).toBe(false);
    expect(registry.getHandlerCount(HookPoint.AFTER_INTAKE)).toBe(1);

    // Register again on same hook point
    registry.register(HookPoint.BEFORE_INTAKE, () => undefined as unknown as HookContext);
    expect(registry.getHandlerCount(HookPoint.BEFORE_INTAKE)).toBe(2);

    // Clear all
    registry.clear();
    expect(registry.getHandlerCount(HookPoint.BEFORE_INTAKE)).toBe(0);
    expect(registry.getHandlerCount(HookPoint.AFTER_INTAKE)).toBe(0);
  });

  it('should return unique IDs for each registration', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const id = registry.register(HookPoint.BEFORE_INTAKE, () => undefined as unknown as HookContext);
      ids.add(id);
    }
    expect(ids.size).toBe(20);
  });

  it('should handle register on multiple hook points independently', () => {
    const points = Object.values(HookPoint);

    for (const hp of points) {
      registry.register(hp, () => undefined as unknown as HookContext);
    }

    for (const hp of points) {
      expect(registry.getHandlerCount(hp)).toBe(1);
    }

    // Unregister one
    const firstId = registry.register(HookPoint.BEFORE_INTAKE, () => undefined as unknown as HookContext);
    registry.unregister(HookPoint.BEFORE_INTAKE, firstId);

    expect(registry.getHandlerCount(HookPoint.BEFORE_INTAKE)).toBe(1); // still has the original
    expect(registry.getHandlerCount(HookPoint.AFTER_INTAKE)).toBe(1);
  });
});

describe('HookRegistry -- Async Handler Scenarios', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  it('should wait for async handler before calling next', async () => {
    const callOrder: string[] = [];

    registry.register(HookPoint.BEFORE_INTAKE, async (ctx) => {
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push('async1');
      return { ...ctx, data: { ...ctx.data, async1: true } };
    });

    registry.register(HookPoint.BEFORE_INTAKE, async (ctx) => {
      callOrder.push('async2');
      return { ...ctx, data: { ...ctx.data, async2: true } };
    });

    const result = await registry.execute(HookPoint.BEFORE_INTAKE, createBaseContext());

    expect(callOrder).toEqual(['async1', 'async2']);
    expect(result.data['async1']).toBe(true);
    expect(result.data['async2']).toBe(true);
  });

  it('should handle mix of sync and async handlers', async () => {
    const callOrder: string[] = [];

    registry.register(HookPoint.BEFORE_INTAKE, (ctx) => {
      callOrder.push('sync');
      return { ...ctx, data: { ...ctx.data, sync: true } };
    });

    registry.register(HookPoint.BEFORE_INTAKE, async (ctx) => {
      await new Promise((r) => setTimeout(r, 5));
      callOrder.push('async');
      return { ...ctx, data: { ...ctx.data, async: true } };
    });

    await registry.execute(HookPoint.BEFORE_INTAKE, createBaseContext());

    expect(callOrder).toEqual(['sync', 'async']);
  });

  it('should handle async handler that rejects', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    registry.register(HookPoint.AFTER_RESPONSE_STREAMING, async () => {
      await new Promise((r) => setTimeout(r, 5));
      throw new Error('Async rejection');
    });

    registry.register(HookPoint.AFTER_RESPONSE_STREAMING, (ctx) => ({
      ...ctx,
      data: { ...ctx.data, afterError: true },
    }));

    const result = await registry.execute(
      HookPoint.AFTER_RESPONSE_STREAMING,
      createBaseContext(),
    );

    expect(result.data['afterError']).toBe(true);
    expect(consoleSpy).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});
