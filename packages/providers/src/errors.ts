/**
 * @osai/providers -- Provider Error Hierarchy (DOMAIN-008)
 *
 * Custom error classes for the LLM Provider System.
 * All provider errors extend ProviderError, enabling consistent error handling
 * across the failover chain and circuit breaker.
 */

// ---------------------------------------------------------------------------
// Base Provider Error
// ---------------------------------------------------------------------------

/**
 * Base error for all LLM provider failures.
 *
 * All provider-specific errors (rate limit, auth, circuit breaker, etc.)
 * extend this class so callers can catch broadly or specifically.
 */
export class ProviderError extends Error {
  /** The provider identifier that caused the error. */
  public readonly providerId: string;

  /** HTTP status code from the upstream API, if applicable. */
  public readonly statusCode?: number;

  constructor(
    message: string,
    providerId: string,
    options?: { cause?: Error; statusCode?: number },
  ) {
    super(message, options?.cause != null ? { cause: options.cause } : undefined);
    this.name = 'ProviderError';
    this.providerId = providerId;
    this.statusCode = options?.statusCode;
  }
}

// ---------------------------------------------------------------------------
// Provider Unavailable
// ---------------------------------------------------------------------------

/**
 * Thrown when the provider is unreachable or returns a server error.
 *
 * Maps to HTTP 5xx responses or connection failures.
 */
export class ProviderUnavailableError extends ProviderError {
  constructor(
    message: string,
    providerId: string,
    options?: { cause?: Error; statusCode?: number },
  ) {
    super(message, providerId, options);
    this.name = 'ProviderUnavailableError';
  }
}

// ---------------------------------------------------------------------------
// Rate Limit
// ---------------------------------------------------------------------------

/**
 * Thrown when the provider returns a rate limit response (HTTP 429).
 *
 * Carries the suggested retry-after duration in milliseconds.
 */
export class RateLimitError extends ProviderError {
  /** Suggested retry delay in milliseconds. */
  public readonly retryAfterMs?: number;

  constructor(
    message: string,
    providerId: string,
    options?: { cause?: Error; retryAfterMs?: number },
  ) {
    super(message, providerId, { cause: options?.cause, statusCode: 429 });
    this.name = 'RateLimitError';
    this.retryAfterMs = options?.retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// Token Limit
// ---------------------------------------------------------------------------

/**
 * Thrown when the request exceeds the model's token limit.
 */
export class TokenLimitError extends ProviderError {
  /** The token count that exceeded the limit. */
  public readonly tokenCount: number;

  /** The maximum allowed token count. */
  public readonly maxTokens: number;

  constructor(
    message: string,
    providerId: string,
    tokenCount: number,
    maxTokens: number,
  ) {
    super(message, providerId, { statusCode: 400 });
    this.name = 'TokenLimitError';
    this.tokenCount = tokenCount;
    this.maxTokens = maxTokens;
  }
}

// ---------------------------------------------------------------------------
// Auth Error
// ---------------------------------------------------------------------------

/**
 * Thrown when authentication with the provider fails (HTTP 401/403).
 */
export class AuthError extends ProviderError {
  constructor(
    message: string,
    providerId: string,
    options?: { cause?: Error; statusCode?: 401 | 403 },
  ) {
    super(message, providerId, {
      cause: options?.cause,
      statusCode: options?.statusCode ?? 401,
    });
    this.name = 'AuthError';
  }
}

// ---------------------------------------------------------------------------
// Circuit Breaker Open
// ---------------------------------------------------------------------------

/**
 * Thrown when the circuit breaker is open and the call is rejected
 * without attempting an actual provider request.
 */
export class CircuitBreakerOpenError extends ProviderError {
  constructor(providerId: string) {
    super(
      `Circuit breaker is open for provider "${providerId}" -- requests are temporarily blocked`,
      providerId,
    );
    this.name = 'CircuitBreakerOpenError';
  }
}
