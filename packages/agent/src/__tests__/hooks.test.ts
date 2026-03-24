/**
 * Unit tests for HookManager -- T-002: Hook System Core
 *
 * Tests hook registration, unregistration, priority ordering,
 * abort chain behavior, error handling, and context preservation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HookManager } from '../hooks/HookManager.js';
import type { HookPoint, HookContext, HookHandler } from '../types.js';

function makeContext(
  hookPoint: HookPoint,
  sessionId = 'test-session',
  data: Record<string, unknown> = {},
): HookContext {
  return { hookPoint, sessionId, data, abort: false };
}

describe('HookManager', () => {
  let manager: HookManager;

  beforeEach(() => {
    manager = new HookManager();
  });

  // ---------------------------------------------------------------------------
  // 1. Регистрация hook handler
  // ---------------------------------------------------------------------------
  it('should register a hook handler and return a unique id', () => {
    const handler: HookHandler = async (ctx) => ctx;
    const id = manager.registerHook('before_agent_start', handler);

    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(manager.getHandlerCount('before_agent_start')).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 2. Unregister hook handler
  // ---------------------------------------------------------------------------
  it('should unregister a hook handler', () => {
    const handler: HookHandler = async (ctx) => ctx;
    const id = manager.registerHook('before_agent_start', handler);

    expect(manager.getHandlerCount('before_agent_start')).toBe(1);

    const removed = manager.unregisterHook('before_agent_start', id);
    expect(removed).toBe(true);
    expect(manager.getHandlerCount('before_agent_start')).toBe(0);
  });

  it('should return false when unregistering a non-existent handler', () => {
    const removed = manager.unregisterHook('before_agent_start', 'non-existent-id');
    expect(removed).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 3. Priority ordering
  // ---------------------------------------------------------------------------
  it('should execute handlers sorted by priority (lower first)', async () => {
    const order: number[] = [];

    const handler1: HookHandler = async (ctx) => {
      order.push(3);
      return ctx;
    };
    const handler2: HookHandler = async (ctx) => {
      order.push(1);
      return ctx;
    };
    const handler3: HookHandler = async (ctx) => {
      order.push(2);
      return ctx;
    };

    manager.registerHook('before_agent_start', handler1, 3);
    manager.registerHook('before_agent_start', handler2, 1);
    manager.registerHook('before_agent_start', handler3, 2);

    await manager.executeHooks('before_agent_start', makeContext('before_agent_start'));

    expect(order).toEqual([1, 2, 3]);
  });

  // ---------------------------------------------------------------------------
  // 4. Abort chain on null return
  // ---------------------------------------------------------------------------
  it('should abort hook chain when handler returns null', async () => {
    const executed: string[] = [];

    const firstHandler: HookHandler = async (ctx) => {
      executed.push('first');
      return ctx;
    };
    const abortHandler: HookHandler = async (_ctx) => {
      executed.push('abort');
      return null;
    };
    const lastHandler: HookHandler = async (ctx) => {
      executed.push('last');
      return ctx;
    };

    manager.registerHook('before_agent_start', firstHandler, 1);
    manager.registerHook('before_agent_start', abortHandler, 2);
    manager.registerHook('before_agent_start', lastHandler, 3);

    const result = await manager.executeHooks(
      'before_agent_start',
      makeContext('before_agent_start'),
    );

    expect(executed).toEqual(['first', 'abort']);
    expect(result.abort).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 5. Error in handler triggers on_error hook
  // ---------------------------------------------------------------------------
  it('should trigger on_error hook when a handler throws', async () => {
    const errorCaptured: Array<{ originalHook: HookPoint; error: string }> = [];

    const failingHandler: HookHandler = async () => {
      throw new Error('handler explosion');
    };

    const errorHandler: HookHandler = async (ctx) => {
      errorCaptured.push({
        originalHook: ctx.data.originalHook as HookPoint,
        error: ctx.data.error as string,
      });
      return ctx;
    };

    manager.registerHook('before_tool_call', failingHandler, 1);
    manager.registerHook('on_error', errorHandler, 1);

    const result = await manager.executeHooks(
      'before_tool_call',
      makeContext('before_tool_call'),
    );

    // on_error handler should have been called with error info
    expect(errorCaptured).toHaveLength(1);
    expect(errorCaptured[0]!.originalHook).toBe('before_tool_call');
    expect(errorCaptured[0]!.error).toContain('handler explosion');
    // The original context should still be returned
    expect(result.sessionId).toBe('test-session');
  });

  // ---------------------------------------------------------------------------
  // 6. Empty hook point returns original context
  // ---------------------------------------------------------------------------
  it('should return the original context when no handlers are registered', async () => {
    const context = makeContext('agent_end', 'session-42', { key: 'value' });

    const result = await manager.executeHooks('agent_end', context);

    expect(result).toEqual(context);
    expect(result.sessionId).toBe('session-42');
    expect(result.data).toEqual({ key: 'value' });
  });

  // ---------------------------------------------------------------------------
  // 7. Multiple handlers same priority
  // ---------------------------------------------------------------------------
  it('should execute all handlers with the same priority', async () => {
    const executed: string[] = [];

    const handlerA: HookHandler = async (ctx) => {
      executed.push('a');
      return ctx;
    };
    const handlerB: HookHandler = async (ctx) => {
      executed.push('b');
      return ctx;
    };

    manager.registerHook('after_tool_call', handlerA, 5);
    manager.registerHook('after_tool_call', handlerB, 5);

    await manager.executeHooks('after_tool_call', makeContext('after_tool_call'));

    expect(executed).toHaveLength(2);
    expect(executed).toContain('a');
    expect(executed).toContain('b');
  });

  // ---------------------------------------------------------------------------
  // 8. Abort flag stops execution
  // ---------------------------------------------------------------------------
  it('should stop execution when context.abort is set to true', async () => {
    const executed: string[] = [];

    const abortingHandler: HookHandler = async (ctx) => {
      executed.push('aborting');
      return { ...ctx, abort: true };
    };
    const nextHandler: HookHandler = async (ctx) => {
      executed.push('should-not-run');
      return ctx;
    };

    manager.registerHook('before_prompt_build', abortingHandler, 1);
    manager.registerHook('before_prompt_build', nextHandler, 2);

    const result = await manager.executeHooks(
      'before_prompt_build',
      makeContext('before_prompt_build'),
    );

    expect(executed).toEqual(['aborting']);
    expect(result.abort).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 9. executeHooks preserves sessionId
  // ---------------------------------------------------------------------------
  it('should preserve sessionId through hook chain', async () => {
    const handler1: HookHandler = async (ctx) => ({
      ...ctx,
      data: { ...ctx.data, step: 1 },
    });
    const handler2: HookHandler = async (ctx) => ({
      ...ctx,
      data: { ...ctx.data, step: 2 },
    });

    manager.registerHook('before_model_resolve', handler1, 1);
    manager.registerHook('before_model_resolve', handler2, 2);

    const result = await manager.executeHooks(
      'before_model_resolve',
      makeContext('before_model_resolve', 'session-abc'),
    );

    expect(result.sessionId).toBe('session-abc');
    expect(result.data).toEqual({ step: 2 });
  });

  // ---------------------------------------------------------------------------
  // 10. Register for all 11 hook points
  // ---------------------------------------------------------------------------
  it('should support registration for all 11 hook points', () => {
    const allHookPoints: HookPoint[] = [
      'before_model_resolve',
      'before_prompt_build',
      'before_agent_start',
      'before_tool_call',
      'after_tool_call',
      'agent_end',
      'on_error',
      'before_memory_query',
      'after_memory_extract',
      'on_file_access',
      'on_desktop_notification',
    ];

    const noop: HookHandler = async (ctx) => ctx;

    for (const hookPoint of allHookPoints) {
      const id = manager.registerHook(hookPoint, noop, 10);
      expect(id).toBeTruthy();
    }

    for (const hookPoint of allHookPoints) {
      expect(manager.getHandlerCount(hookPoint)).toBe(1);
    }
  });

  // ---------------------------------------------------------------------------
  // clear()
  // ---------------------------------------------------------------------------
  it('should clear all handlers', () => {
    const noop: HookHandler = async (ctx) => ctx;

    manager.registerHook('before_agent_start', noop);
    manager.registerHook('agent_end', noop);

    expect(manager.getHandlerCount('before_agent_start')).toBe(1);
    expect(manager.getHandlerCount('agent_end')).toBe(1);

    manager.clear();

    expect(manager.getHandlerCount('before_agent_start')).toBe(0);
    expect(manager.getHandlerCount('agent_end')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Default priority
  // ---------------------------------------------------------------------------
  it('should use default priority of 10 when not specified', () => {
    const noop: HookHandler = async (ctx) => ctx;

    manager.registerHook('before_agent_start', noop);
    expect(manager.getHandlerCount('before_agent_start')).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Handler receives and can modify context
  // ---------------------------------------------------------------------------
  it('should pass context through handlers and allow modification', async () => {
    const handler: HookHandler = async (ctx) => ({
      ...ctx,
      data: { ...ctx.data, modified: true },
    });

    manager.registerHook('before_agent_start', handler);

    const result = await manager.executeHooks(
      'before_agent_start',
      makeContext('before_agent_start', 's1', { original: true }),
    );

    expect(result.data.modified).toBe(true);
    expect(result.data.original).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Unregister from wrong hook point
  // ---------------------------------------------------------------------------
  it('should return false when unregistering from a different hook point', () => {
    const noop: HookHandler = async (ctx) => ctx;
    const id = manager.registerHook('before_agent_start', noop);

    const removed = manager.unregisterHook('agent_end', id);
    expect(removed).toBe(false);
    expect(manager.getHandlerCount('before_agent_start')).toBe(1);
  });
});
