/**
 * @osai/providers -- Auth Profile Rotation (DOMAIN-008)
 *
 * Manages API key rotation for a provider when rate limit errors occur.
 * When a provider returns HTTP 429, the rotation mechanism tries the next
 * available API key before falling back to the next provider in the chain.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of attempting an auth profile rotation. */
export enum RotationResult {
  /** A different API key was used to retry the request. */
  Rotated = 'rotated',
  /** No more API keys available for this provider. */
  Exhausted = 'exhausted',
  /** No rotation needed (single key or not a rate limit error). */
  NotApplicable = 'not_applicable',
}

/** Configuration for auth profile rotation. */
export interface AuthRotationConfig {
  /** Ordered list of API keys for this provider. */
  readonly apiKeys: readonly string[];
}

/** A function that can be called with a specific API key. */
export type KeyedRequestFn<T> = (apiKey: string) => Promise<T>;

// ---------------------------------------------------------------------------
// AuthRotator
// ---------------------------------------------------------------------------

/**
 * Manages API key rotation for a single provider.
 *
 * Usage:
 *   const rotator = new AuthRotator({ apiKeys: ['key1', 'key2', 'key3'] });
 *   const result = await rotator.tryWithRotation(requestFn, usedKeys);
 */
export class AuthRotator {
  private readonly _apiKeys: readonly string[];

  constructor(config: AuthRotationConfig) {
    this._apiKeys = config.apiKeys;
  }

  /**
   * Get all API keys managed by this rotator.
   */
  get apiKeys(): readonly string[] {
    return this._apiKeys;
  }

  /**
   * Check whether rotation is possible (more than one API key).
   */
  canRotate(): boolean {
    return this._apiKeys.length > 1;
  }

  /**
   * Get the first (default) API key.
   */
  getDefaultKey(): string | undefined {
    return this._apiKeys[0];
  }

  /**
   * Find the next API key that has not been tried yet.
   *
   * @param usedKeys - Set of API key indices already attempted.
   * @returns The next API key, or undefined if all keys have been exhausted.
   */
  getNextKey(usedKeys: ReadonlySet<number>): string | undefined {
    for (let i = 0; i < this._apiKeys.length; i++) {
      if (!usedKeys.has(i)) {
        return this._apiKeys[i];
      }
    }
    return undefined;
  }

  /**
   * Attempt to execute a request with auth rotation.
   *
   * On first call, uses the default API key. If the initial call throws
   * RateLimitError, tries the next available key, and so on.
   *
   * @param requestFn - A function that accepts an API key and returns a promise.
   * @param onRateLimit - Optional callback when rate limit is detected.
   * @returns The result from the first successful API key.
   * @throws {Error} The last error encountered if all keys are exhausted.
   */
  async tryWithRotation<T>(
    requestFn: KeyedRequestFn<T>,
    onRateLimit?: (keyIndex: number, retryAfterMs?: number) => void,
  ): Promise<T> {
    if (this._apiKeys.length === 0) {
      throw new Error('No API keys configured for rotation');
    }

    const usedKeys = new Set<number>();
    let lastError: Error | undefined;

    for (let i = 0; i < this._apiKeys.length; i++) {
      const key = this._apiKeys[i];
      if (key === undefined) continue;
      usedKeys.add(i);

      try {
        return await requestFn(key);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is a rate limit error by looking at the error structure
        // We check for RateLimitError by its name and properties
        const isRateLimit = this._isRateLimitError(lastError);

        if (isRateLimit) {
          onRateLimit?.(i, this._extractRetryAfter(lastError));

          // Try next key if available
          const nextKey = this.getNextKey(usedKeys);
          if (nextKey !== undefined) {
            continue;
          }
        }

        // Non-rate-limit errors or exhausted keys -- propagate immediately
        throw lastError;
      }
    }

    // All keys exhausted
    throw lastError ?? new Error('All API keys exhausted');
  }

  /**
   * Check how many unused keys remain.
   */
  getRemainingKeyCount(usedKeys: ReadonlySet<number>): number {
    let remaining = 0;
    for (let i = 0; i < this._apiKeys.length; i++) {
      if (!usedKeys.has(i)) {
        remaining++;
      }
    }
    return remaining;
  }

  // -- Internal -------------------------------------------------------------

  private _isRateLimitError(error: Error): boolean {
    // Check for RateLimitError by name (duck typing for testability)
    if (error.name === 'RateLimitError') {
      return true;
    }

    // Check for retryAfterMs property (characteristic of RateLimitError)
    if ('retryAfterMs' in error) {
      return true;
    }

    // Check statusCode 429
    if ('statusCode' in error && (error as Record<string, unknown>).statusCode === 429) {
      return true;
    }

    return false;
  }

  private _extractRetryAfter(error: Error): number | undefined {
    if ('retryAfterMs' in error) {
      return (error as Record<string, unknown>).retryAfterMs as number | undefined;
    }
    return undefined;
  }
}
