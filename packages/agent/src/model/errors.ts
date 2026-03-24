/**
 * Model error types for the Agent Runtime.
 */

export class ModelError extends Error {
  constructor(
    public provider: string,
    message: string,
    public retryable: boolean = true,
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

export class AllProvidersExhaustedError extends Error {
  constructor(public attempts: ProviderAttempt[]) {
    super(`All ${attempts.length} model providers exhausted`);
    this.name = 'AllProvidersExhaustedError';
  }
}

export interface ProviderAttempt {
  provider: string;
  model: string;
  error: string;
  retryable: boolean;
}
