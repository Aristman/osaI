/**
 * Unit tests for HookRegistry
 *
 * Covers: T-001 Hook System acceptance criteria
 *   - register() adds handler, emit calls it
 *   - emitAsync processes async handlers
 *   - execute() calls all handlers in order
 *   - unregister() removes handler
 *   - execute() without handlers does not crash
 *   - HookContext contains trace_id, chat_id, session_id
 *   - All 13 hook points defined in HookPoint enum
 *   - Error handling (graceful degradation)
 *   - Multiple handlers ordered by priority
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookRegistry } from '../HookRegistry.js';
import { HookPoint } from '../types.js';
import type { HookContext, HookHandler } from '../types.js';

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

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  // -----------------------------------------------------------------------
  // TC-001-1: register() adds sync handler
  // -----------------------------------------------------------------------
  describe('register', () => {
    it('should add a sync handler and return a unique id', () => {
      const handler: HookHandler = (ctx) => ctx;
      const id = registry.register(HookPoint.BEFORE_INTAKE, handler);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should call the handler when execute is invoked', async () => {
      const handler = vi.fn<HookHandler>((ctx) => ctx);
      registry.register(HookPoint.BEFORE_INTAKE, handler);

      const context = createBaseContext();
      await registry.execute(HookPoint.BEFORE_INTAKE, context);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(context);
    });

    it('should register multiple handlers for the same hook point', () => {
      const handler1: HookHandler = (ctx) => ctx;
      const handler2: HookHandler = (ctx) => ctx;

      registry.register(HookPoint.BEFORE_INTAKE, handler1);
      registry.register(HookPoint.BEFORE_INTAKE, handler2);

      expect(registry.getHandlerCount(HookPoint.BEFORE_INTAKE)).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // TC-001-2: register() adds async handler
  // -----------------------------------------------------------------------
  describe('async handlers', () => {
    it('should support async handler registration', async () => {
      const handler = vi.fn<HookHandler>(async (ctx) => {
        return { ...ctx, data: { ...ctx.data, asyncFlag: true } };
      });
      registry.register(HookPoint.AFTER_INTAKE, handler);

      const context = createBaseContext();
      const result = await registry.execute(HookPoint.AFTER_INTAKE, context);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(result.data['asyncFlag']).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // TC-001-3: execute() calls all handlers in order
  // -----------------------------------------------------------------------
  describe('execute', () => {
    it('should call all registered handlers in registration order (same priority)', async () => {
      const callOrder: string[] = [];

      const handler1: HookHandler = (ctx) => {
        callOrder.push('handler1');
        return ctx;
      };
      const handler2: HookHandler = (ctx) => {
        callOrder.push('handler2');
        return ctx;
      };
      const handler3: HookHandler = (ctx) => {
        callOrder.push('handler3');
        return ctx;
      };

      registry.register(HookPoint.BEFORE_INTAKE, handler1);
      registry.register(HookPoint.BEFORE_INTAKE, handler2);
      registry.register(HookPoint.BEFORE_INTAKE, handler3);

      const context = createBaseContext();
      await registry.execute(HookPoint.BEFORE_INTAKE, context);

      expect(callOrder).toEqual(['handler1', 'handler2', 'handler3']);
    });

    it('should pass modified context from one handler to the next', async () => {
      const handler1: HookHandler = (ctx) => ({
        ...ctx,
        data: { ...ctx.data, step1: 'done' },
      });
      const handler2: HookHandler = (ctx) => ({
        ...ctx,
        data: { ...ctx.data, step2: 'done' },
      });

      registry.register(HookPoint.BEFORE_CONTEXT_ASSEMBLY, handler1);
      registry.register(HookPoint.BEFORE_CONTEXT_ASSEMBLY, handler2);

      const context = createBaseContext();
      const result = await registry.execute(
        HookPoint.BEFORE_CONTEXT_ASSEMBLY,
        context,
      );

      expect(result.data['step1']).toBe('done');
      expect(result.data['step2']).toBe('done');
    });
  });

  // -----------------------------------------------------------------------
  // TC-001-4: Priority ordering
  // -----------------------------------------------------------------------
  describe('priority ordering', () => {
    it('should execute handlers ordered by priority (lower first)', async () => {
      const callOrder: number[] = [];

      const handler10: HookHandler = (ctx) => {
        callOrder.push(10);
        return ctx;
      };
      const handler1: HookHandler = (ctx) => {
        callOrder.push(1);
        return ctx;
      };
      const handler50: HookHandler = (ctx) => {
        callOrder.push(50);
        return ctx;
      };
      const handler5: HookHandler = (ctx) => {
        callOrder.push(5);
        return ctx;
      };

      // Register in non-sorted order
      registry.register(HookPoint.BEFORE_MODEL_INFERENCE, handler10, 10);
      registry.register(HookPoint.BEFORE_MODEL_INFERENCE, handler1, 1);
      registry.register(HookPoint.BEFORE_MODEL_INFERENCE, handler50, 50);
      registry.register(HookPoint.BEFORE_MODEL_INFERENCE, handler5, 5);

      const context = createBaseContext();
      await registry.execute(HookPoint.BEFORE_MODEL_INFERENCE, context);

      expect(callOrder).toEqual([1, 5, 10, 50]);
    });

    it('should maintain registration order for equal priorities', async () => {
      const callOrder: string[] = [];

      const handlerA: HookHandler = (ctx) => {
        callOrder.push('A');
        return ctx;
      };
      const handlerB: HookHandler = (ctx) => {
        callOrder.push('B');
        return ctx;
      };

      registry.register(HookPoint.AFTER_TOOL_EXECUTION, handlerA, 100);
      registry.register(HookPoint.AFTER_TOOL_EXECUTION, handlerB, 100);

      const context = createBaseContext();
      await registry.execute(HookPoint.AFTER_TOOL_EXECUTION, context);

      expect(callOrder).toEqual(['A', 'B']);
    });
  });

  // -----------------------------------------------------------------------
  // TC-001-5: unregister() removes handler
  // -----------------------------------------------------------------------
  describe('unregister', () => {
    it('should remove a registered handler', async () => {
      const handler = vi.fn<HookHandler>((ctx) => ctx);
      const id = registry.register(HookPoint.BEFORE_TOOL_EXECUTION, handler);

      const removed = registry.unregister(HookPoint.BEFORE_TOOL_EXECUTION, id);
      expect(removed).toBe(true);
      expect(registry.getHandlerCount(HookPoint.BEFORE_TOOL_EXECUTION)).toBe(0);

      // Handler should no longer be called
      const context = createBaseContext();
      await registry.execute(HookPoint.BEFORE_TOOL_EXECUTION, context);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return false when trying to unregister non-existent handler', () => {
      const removed = registry.unregister(
        HookPoint.BEFORE_INTAKE,
        'non-existent-id',
      );
      expect(removed).toBe(false);
    });

    it('should return false when unregistering from hook point with no handlers', () => {
      const removed = registry.unregister(
        HookPoint.AFTER_INTAKE,
        'some-id',
      );
      expect(removed).toBe(false);
    });

    it('should only remove the specified handler, not others', async () => {
      const handler1 = vi.fn<HookHandler>((ctx) => ctx);
      const handler2 = vi.fn<HookHandler>((ctx) => ctx);

      const id1 = registry.register(HookPoint.BEFORE_INTAKE, handler1);
      registry.register(HookPoint.BEFORE_INTAKE, handler2);

      registry.unregister(HookPoint.BEFORE_INTAKE, id1);

      expect(registry.getHandlerCount(HookPoint.BEFORE_INTAKE)).toBe(1);

      const context = createBaseContext();
      await registry.execute(HookPoint.BEFORE_INTAKE, context);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // TC-001-6: execute() without handlers does not crash
  // -----------------------------------------------------------------------
  describe('empty state', () => {
    it('should return the same context when no handlers are registered', async () => {
      const context = createBaseContext();
      const result = await registry.execute(HookPoint.BEFORE_INTAKE, context);

      expect(result).toBe(context);
    });

    it('should return the same context for a hook point that was never used', async () => {
      const context = createBaseContext();
      const result = await registry.execute(
        HookPoint.ON_CHAT_SWITCH,
        context,
      );

      expect(result).toBe(context);
    });
  });

  // -----------------------------------------------------------------------
  // TC-001-7: HookContext contains trace_id, chat_id, session_id
  // -----------------------------------------------------------------------
  describe('HookContext', () => {
    it('should preserve all context fields through execution', async () => {
      const context = createBaseContext({
        sessionId: 'sess-xyz',
        chatId: 'chat-abc',
        traceId: 'trace-123',
        timestamp: '2026-03-30T12:00:00.000Z',
        data: { key: 'value' },
      });

      const handler: HookHandler = (ctx) => {
        // Verify all fields are accessible
        expect(ctx.sessionId).toBe('sess-xyz');
        expect(ctx.chatId).toBe('chat-abc');
        expect(ctx.traceId).toBe('trace-123');
        expect(ctx.timestamp).toBe('2026-03-30T12:00:00.000Z');
        expect(ctx.data['key']).toBe('value');
        return ctx;
      };

      registry.register(HookPoint.BEFORE_MEMORY_QUERY, handler);
      await registry.execute(HookPoint.BEFORE_MEMORY_QUERY, context);
    });

    it('should allow handler to extend data', async () => {
      const handler: HookHandler = (ctx) => ({
        ...ctx,
        data: { ...ctx.data, injected: true },
      });

      registry.register(HookPoint.BEFORE_FACT_EXTRACTION, handler);

      const context = createBaseContext({ data: { original: true } });
      const result = await registry.execute(
        HookPoint.BEFORE_FACT_EXTRACTION,
        context,
      );

      expect(result.data['original']).toBe(true);
      expect(result.data['injected']).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // TC-001-8: All 13 hook points defined in HookPoint enum
  // -----------------------------------------------------------------------
  describe('HookPoint enum', () => {
    it('should have exactly 13 values', () => {
      const values = Object.values(HookPoint);
      expect(values).toHaveLength(13);
    });

    it('should contain all 7 pipeline hook points', () => {
      expect(HookPoint.BEFORE_INTAKE).toBeDefined();
      expect(HookPoint.AFTER_INTAKE).toBeDefined();
      expect(HookPoint.BEFORE_CONTEXT_ASSEMBLY).toBeDefined();
      expect(HookPoint.AFTER_CONTEXT_ASSEMBLY).toBeDefined();
      expect(HookPoint.BEFORE_MODEL_INFERENCE).toBeDefined();
      expect(HookPoint.AFTER_MODEL_INFERENCE).toBeDefined();
      expect(HookPoint.BEFORE_TOOL_EXECUTION).toBeDefined();
    });

    it('should contain all hook points covering the full pipeline', () => {
      const expectedHooks = [
        'before_intake',
        'after_intake',
        'before_context_assembly',
        'after_context_assembly',
        'before_model_inference',
        'after_model_inference',
        'before_tool_execution',
        'after_tool_execution',
        'before_response_streaming',
        'after_response_streaming',
        'before_memory_query',
        'after_memory_query',
        'before_fact_extraction',
      ] as const;

      const actualValues = Object.values(HookPoint) as string[];
      for (const expected of expectedHooks) {
        expect(actualValues).toContain(expected);
      }
    });

    it('should allow registering handlers on all 13 hook points', async () => {
      const handler = vi.fn<HookHandler>((ctx) => ctx);
      const allHookPoints = Object.values(HookPoint);

      const ids: string[] = [];
      for (const hp of allHookPoints) {
        ids.push(registry.register(hp, handler));
      }

      // Each hook point should have exactly one handler
      for (const hp of allHookPoints) {
        expect(registry.getHandlerCount(hp)).toBe(1);
      }

      // Execute each hook point
      const context = createBaseContext();
      for (const hp of allHookPoints) {
        await registry.execute(hp, context);
      }

      // Handler should have been called once per hook point
      expect(handler).toHaveBeenCalledTimes(allHookPoints.length);

      // Cleanup
      for (let i = 0; i < allHookPoints.length; i++) {
        registry.unregister(allHookPoints[i]!, ids[i]!);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Error handling (graceful degradation)
  // -----------------------------------------------------------------------
  describe('error handling (graceful degradation)', () => {
    it('should continue execution when a handler throws a sync error', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const throwingHandler: HookHandler = () => {
        throw new Error('Handler failure');
      };
      const succeedingHandler = vi.fn<HookHandler>((ctx) => ({
        ...ctx,
        data: { ...ctx.data, survived: true },
      }));

      registry.register(HookPoint.ON_ERROR, throwingHandler);
      registry.register(HookPoint.ON_ERROR, succeedingHandler);

      const context = createBaseContext();
      const result = await registry.execute(HookPoint.ON_ERROR, context);

      // Succeeding handler should still be called
      expect(succeedingHandler).toHaveBeenCalledTimes(1);
      expect(result.data['survived']).toBe(true);

      // Error should be logged
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0]![0]).toContain(
        '[HookRegistry] Handler',
      );

      consoleSpy.mockRestore();
    });

    it('should continue execution when a handler throws an async error', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const asyncThrowingHandler: HookHandler = async () => {
        throw new Error('Async handler failure');
      };
      const succeedingHandler = vi.fn<HookHandler>((ctx) => ({
        ...ctx,
        data: { ...ctx.data, afterAsyncError: true },
      }));

      registry.register(
        HookPoint.AFTER_RESPONSE_STREAMING,
        asyncThrowingHandler,
      );
      registry.register(
        HookPoint.AFTER_RESPONSE_STREAMING,
        succeedingHandler,
      );

      const context = createBaseContext();
      const result = await registry.execute(
        HookPoint.AFTER_RESPONSE_STREAMING,
        context,
      );

      expect(succeedingHandler).toHaveBeenCalledTimes(1);
      expect(result.data['afterAsyncError']).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should preserve the last successful context when a handler throws', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const modifier: HookHandler = (ctx) => ({
        ...ctx,
        data: { ...ctx.data, modified: true },
      });
      const throwingHandler: HookHandler = () => {
        throw new Error('Boom');
      };
      const reader = vi.fn<HookHandler>((ctx) => {
        // Should receive the context from the modifier, not from the thrower
        expect(ctx.data['modified']).toBe(true);
        return ctx;
      });

      registry.register(HookPoint.ON_FILE_ACCESS, modifier, 1);
      registry.register(HookPoint.ON_FILE_ACCESS, throwingHandler, 2);
      registry.register(HookPoint.ON_FILE_ACCESS, reader, 3);

      const context = createBaseContext();
      await registry.execute(HookPoint.ON_FILE_ACCESS, context);

      expect(reader).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });

    it('should handle non-Error thrown values gracefully', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const throwingString: HookHandler = () => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      };
      const succeedingHandler = vi.fn<HookHandler>((ctx) => ctx);

      registry.register(HookPoint.ON_DESKTOP_NOTIFICATION, throwingString);
      registry.register(
        HookPoint.ON_DESKTOP_NOTIFICATION,
        succeedingHandler,
      );

      const context = createBaseContext();
      await registry.execute(HookPoint.ON_DESKTOP_NOTIFICATION, context);

      expect(succeedingHandler).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });

    it('should continue when ALL handlers throw', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const handler1: HookHandler = () => {
        throw new Error('Error 1');
      };
      const handler2: HookHandler = () => {
        throw new Error('Error 2');
      };

      registry.register(HookPoint.ON_MIRROR_MESSAGE, handler1);
      registry.register(HookPoint.ON_MIRROR_MESSAGE, handler2);

      const context = createBaseContext();
      const result = await registry.execute(
        HookPoint.ON_MIRROR_MESSAGE,
        context,
      );

      // Should return the original context
      expect(result).toBe(context);
      expect(consoleSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // clear
  // -----------------------------------------------------------------------
  describe('clear', () => {
    it('should remove all handlers from all hook points', async () => {
      const handler = vi.fn<HookHandler>((ctx) => ctx);

      registry.register(HookPoint.BEFORE_INTAKE, handler);
      registry.register(HookPoint.AFTER_INTAKE, handler);
      registry.register(HookPoint.BEFORE_CONTEXT_ASSEMBLY, handler);

      registry.clear();

      expect(registry.getHandlerCount(HookPoint.BEFORE_INTAKE)).toBe(0);
      expect(registry.getHandlerCount(HookPoint.AFTER_INTAKE)).toBe(0);
      expect(registry.getHandlerCount(HookPoint.BEFORE_CONTEXT_ASSEMBLY)).toBe(
        0,
      );

      // Handlers should no longer be called
      const context = createBaseContext();
      await registry.execute(HookPoint.BEFORE_INTAKE, context);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getHandlerCount
  // -----------------------------------------------------------------------
  describe('getHandlerCount', () => {
    it('should return 0 for hook point with no handlers', () => {
      expect(registry.getHandlerCount(HookPoint.BEFORE_INTAKE)).toBe(0);
    });

    it('should return correct count after register and unregister', () => {
      const id = registry.register(
        HookPoint.BEFORE_INTAKE,
        () => undefined as unknown as HookContext,
      );
      expect(registry.getHandlerCount(HookPoint.BEFORE_INTAKE)).toBe(1);

      registry.unregister(HookPoint.BEFORE_INTAKE, id);
      expect(registry.getHandlerCount(HookPoint.BEFORE_INTAKE)).toBe(0);
    });
  });
});
