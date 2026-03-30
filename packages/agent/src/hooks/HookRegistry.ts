/**
 * @osai/agent -- Hook Registry
 *
 * Central registry for hook handlers.
 *
 * - Handlers are grouped by HookPoint.
 * - Within each hook point, handlers execute in priority order (lower first).
 * - If a handler throws, the error is logged and execution continues
 *   (graceful degradation).
 */

import crypto from 'node:crypto';
import type { HookContext, HookHandler } from './types.js';
import { HookPoint } from './types.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RegisteredHandler {
  readonly id: string;
  readonly handler: HookHandler;
  readonly priority: number;
}

// ---------------------------------------------------------------------------
// HookRegistry
// ---------------------------------------------------------------------------

export class HookRegistry {
  private readonly handlers = new Map<HookPoint, RegisteredHandler[]>();

  // -----------------------------------------------------------------------
  // register
  // -----------------------------------------------------------------------

  /**
   * Register a handler for the given hook point.
   *
   * @param hookPoint - The hook point to attach the handler to.
   * @param handler   - The handler function (sync or async).
   * @param priority  - Execution priority. Lower values run first. Default: 100.
   * @returns Unique handler identifier for later unregistration.
   */
  register(
    hookPoint: HookPoint,
    handler: HookHandler,
    priority: number = 100,
  ): string {
    const id = crypto.randomUUID();

    const entry: RegisteredHandler = { id, handler, priority };

    let list = this.handlers.get(hookPoint);
    if (list === undefined) {
      list = [];
      this.handlers.set(hookPoint, list);
    }

    // Insert in sorted order (stable sort: lower priority first)
    let insertIdx = list.length;
    for (let i = 0; i < list.length; i++) {
      if (list[i]!.priority > priority) {
        insertIdx = i;
        break;
      }
    }
    list.splice(insertIdx, 0, entry);

    return id;
  }

  // -----------------------------------------------------------------------
  // unregister
  // -----------------------------------------------------------------------

  /**
   * Remove a previously registered handler.
   *
   * @param hookPoint - The hook point the handler was registered on.
   * @param handlerId - The unique identifier returned by register().
   * @returns true if the handler was found and removed, false otherwise.
   */
  unregister(hookPoint: HookPoint, handlerId: string): boolean {
    const list = this.handlers.get(hookPoint);
    if (list === undefined) {
      return false;
    }

    const idx = list.findIndex((entry) => entry.id === handlerId);
    if (idx === -1) {
      return false;
    }

    list.splice(idx, 1);

    // Clean up empty arrays to avoid leaking map entries
    if (list.length === 0) {
      this.handlers.delete(hookPoint);
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // execute
  // -----------------------------------------------------------------------

  /**
   * Execute all handlers registered for the given hook point.
   *
   * Handlers run sequentially in priority order. The output context
   * of each handler is fed as input to the next.
   *
   * If a handler throws, the error is caught and logged, and the
   * previous (unmodified) context is passed to the next handler
   * (graceful degradation).
   *
   * @param hookPoint - The hook point to execute.
   * @param context   - The initial hook context.
   * @returns The final (possibly modified) context after all handlers.
   */
  async execute(
    hookPoint: HookPoint,
    context: HookContext,
  ): Promise<HookContext> {
    const list = this.handlers.get(hookPoint);
    if (list === undefined || list.length === 0) {
      return context;
    }

    let current = context;

    for (const entry of list) {
      try {
        const result = await entry.handler(current);
        current = result;
      } catch (error: unknown) {
        // Graceful degradation: log and continue with previous context
        console.error(
          `[HookRegistry] Handler ${entry.id} on ${String(hookPoint)} failed:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return current;
  }

  // -----------------------------------------------------------------------
  // getHandlerCount
  // -----------------------------------------------------------------------

  /**
   * Return the number of handlers registered for a hook point.
   */
  getHandlerCount(hookPoint: HookPoint): number {
    return this.handlers.get(hookPoint)?.length ?? 0;
  }

  // -----------------------------------------------------------------------
  // clear
  // -----------------------------------------------------------------------

  /**
   * Remove all registered handlers (useful for testing teardown).
   */
  clear(): void {
    this.handlers.clear();
  }
}
