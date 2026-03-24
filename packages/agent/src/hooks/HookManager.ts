/**
 * HookManager -- Core hook system for the Agent Runtime
 *
 * Provides registration, unregistration, priority-ordered execution,
 * abort chain support, and automatic on_error dispatch.
 *
 * @module hooks/HookManager
 */

import type { HookPoint, HookContext, HookHandler } from '../types.js';

let handlerCounter = 0;

export class HookManager {
  private handlers: Map<
    HookPoint,
    Map<string, { handler: HookHandler; priority: number }>
  > = new Map();

  /**
   * Register a hook handler for a given hook point.
   *
   * @param hookPoint - The hook point to listen on.
   * @param handler - Async function receiving and returning HookContext.
   * @param priority - Execution priority (lower = earlier). Default 10.
   * @returns Unique handler ID for later unregistration.
   */
  registerHook(
    hookPoint: HookPoint,
    handler: HookHandler,
    priority: number = 10,
  ): string {
    const id = `hook-${++handlerCounter}-${Date.now()}`;
    if (!this.handlers.has(hookPoint)) {
      this.handlers.set(hookPoint, new Map());
    }
    this.handlers.get(hookPoint)!.set(id, { handler, priority });
    return id;
  }

  /**
   * Unregister a previously registered hook handler.
   *
   * @param hookPoint - The hook point the handler was registered on.
   * @param handlerId - The ID returned by registerHook.
   * @returns true if the handler was found and removed, false otherwise.
   */
  unregisterHook(hookPoint: HookPoint, handlerId: string): boolean {
    return this.handlers.get(hookPoint)?.delete(handlerId) ?? false;
  }

  /**
   * Execute all handlers registered for a hook point in priority order.
   *
   * Handlers may return a modified context, set `abort: true` to stop
   * the chain, or return `null` to abort immediately.
   *
   * If a handler throws, the error is caught and dispatched to any
   * registered `on_error` handlers.
   *
   * @param hookPoint - The hook point to execute.
   * @param context - The hook context to pass through the chain.
   * @returns The final context after all handlers have processed it.
   */
  async executeHooks(
    hookPoint: HookPoint,
    context: HookContext,
  ): Promise<HookContext> {
    const handlers = this.handlers.get(hookPoint);
    if (!handlers || handlers.size === 0) return context;

    // Sort by priority (lower = earlier)
    const sorted = [...handlers.entries()].sort(
      (a, b) => a[1].priority - b[1].priority,
    );

    let currentContext = { ...context };
    for (const [, { handler }] of sorted) {
      if (currentContext.abort) break;
      try {
        const result = await handler(currentContext);
        if (result === null) {
          currentContext = { ...currentContext, abort: true };
          break;
        }
        currentContext = result;
      } catch (error) {
        // Try on_error hook
        const errorHandlers = this.handlers.get('on_error');
        if (errorHandlers) {
          const errorContext: HookContext = {
            hookPoint: 'on_error',
            sessionId: currentContext.sessionId,
            data: { originalHook: hookPoint, error: String(error) },
            abort: false,
          };
          for (const [, { handler: errorHandler }] of [
            ...errorHandlers.entries(),
          ].sort((a, b) => a[1].priority - b[1].priority)) {
            await errorHandler(errorContext);
          }
        }
      }
    }
    return currentContext;
  }

  /**
   * Get the number of handlers registered for a hook point.
   *
   * @param hookPoint - The hook point to query.
   * @returns Number of registered handlers.
   */
  getHandlerCount(hookPoint: HookPoint): number {
    return this.handlers.get(hookPoint)?.size ?? 0;
  }

  /**
   * Remove all registered handlers for all hook points.
   */
  clear(): void {
    this.handlers.clear();
  }
}
